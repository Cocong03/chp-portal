// Server Logic: orders (S2-04)
// Purpose: the signed-in customer's BC Sales Orders — list (filtered and paged in BC) and detail with lines; POST submits
// a New Order (S3-10).
// API URL: https://<site>/_api/serverlogics/orders?q=&site=&from=&to=&page=  ·  ?id=SOR…  ·  POST { New Order form }
// Customer and company come only from the session's Account; request values only narrow the list.

async function get() {
    // #region bc-helpers (generated from server-logic-src/bc-helpers.js — do not edit)
    // Shared BC helpers (S1-06). Server Logic has no module loading, so scripts/stamp-server-logic-helpers.mjs copies this
    // block into every endpoint between the bc-helpers region markers. Edit here, then run the stamper.
    // Rules: arrow callbacks only; HttpClient calls are awaited; Dataverse calls are synchronous.

    var bcTokenCache = null;

    // HttpClient and connector results arrive as the record, a JSON string, or a { StatusCode, Body } envelope.
    // step names the call in the log. StatusCode 0 means no HTTP answer; the platform's reason is in ServerErrorMessage.
    function parseResult(result, step) {
        var value = typeof result === "string" ? JSON.parse(result) : result;
        if (value && (value.IsSuccessStatusCode === false || (typeof value.StatusCode === "number" && value.StatusCode >= 400))) {
            throw new Error(step + " " + value.StatusCode + " " + (value.ReasonPhrase || "") + " " + (value.ServerErrorMessage || "") + " " + errorDetail(value.Body));
        }
        if (value && typeof value.Body === "string") {
            value = value.Body ? JSON.parse(value.Body) : {};
        }
        return value;
    }

    // The error code and message from an error body: Entra { error, error_description }, BC/Dataverse { error: { code, message } }.
    function errorDetail(body) {
        try {
            var parsed = JSON.parse(body || "{}");
            var error = parsed.error;
            var text = typeof error === "string" ? error + ": " + (parsed.error_description || "") : error ? error.code + ": " + error.message : "";
            return text.slice(0, 300);
        } catch (parseErr) {
            return String(body || "").slice(0, 300);
        }
    }

    function bcConfig() {
        var names = { tenantId: "BC/TenantId", environment: "BC/EnvironmentName", basePath: "BC/ApiBasePath", clientId: "BC/ClientId", clientSecret: "BC/ClientSecret" };
        var cfg = {};
        Object.keys(names).forEach((key) => {
            var value = Server.SiteSetting.Get(names[key]);
            if (!value || !String(value).trim()) {
                throw new Error("bc-config " + names[key] + " is not set");
            }
            cfg[key] = String(value).trim();
        });
        return cfg;
    }

    // Customer and company come only from the signed-in contact's Account (architecture rule 3), and BC must still
    // let this contact into the portal (customerPortalAccess, decided 2026-10-06). Check first: the path for writes.
    async function sessionScope() {
        var scope = accountScope();
        if (!(await portalContact(scope, scope.email))) {
            throw blockedError();
        }
        return scope;
    }

    // Read-only endpoints: work(scope) reads BC while the portal-access check runs (about 1 s saved per call, 2026-10-16);
    // nothing is returned until the check passes, so a blocked caller's data is read and thrown away, never sent.
    async function scopedRead(work) {
        var scope = accountScope();
        var access = portalContact(scope, scope.email);
        var data = work(scope);
        // Settled below or dropped when access fails: never an unhandled rejection.
        data.catch(() => null);
        if (!(await access)) {
            throw blockedError();
        }
        return data;
    }

    function accountScope() {
        var user = Server.User;
        if (!user || !user.contactid) {
            throw new Error("not-signed-in");
        }
        var contact = parseResult(
            Server.Connector.Dataverse.RetrieveRecord(
                "contacts",
                user.contactid,
                "$select=contactid,emailaddress1&$expand=parentcustomerid_account($select=accountid,name,chp_bccustomerno,chp_bccompanyid)"
            ),
            "dataverse"
        );
        var account = contact.parentcustomerid_account;
        if (!account || !account.chp_bccustomerno || !account.chp_bccompanyid) {
            throw new Error("no-account");
        }
        return {
            contactId: user.contactid,
            accountId: account.accountid,
            email: String(contact.emailaddress1 || "").trim().toLowerCase(),
            customerNo: account.chp_bccustomerno,
            companyId: account.chp_bccompanyid,
            customerName: account.name || ""
        };
    }

    // The BC Person contact with this email, customerPortalAccess = true, linked to the session's customer; null when there's
    // none. One email is one person, so the first match serves for the name.
    // Company contacts never count (decided 2026-10-09): their shared email would be a login the Contacts list doesn't show.
    // The email comes from Dataverse, never from the request. A BC failure throws (an error, not a block).
    // ponytail: two BC calls per request; add a short-lived cache if Dev timings show it matters.
    async function portalContact(scope, email) {
        var address = String(email || "").trim().toLowerCase();
        if (!address) {
            return null;
        }
        var contacts = await bcGet(
            scope,
            "MCRMContacts",
            odataQuery({ $filter: "tolower(eMail) eq " + odataLiteral(address) + " and customerPortalAccess eq true and type eq 'Person'", $select: "companyNo,name", $top: "20" })
        );
        var found = ((contacts && contacts.value) || []).filter((row) => row.companyNo);
        if (found.length === 0) {
            return null;
        }
        var companies = found.map((row) => row.companyNo);
        var relations = await bcGet(
            scope,
            "mcrmBusinessRelation",
            odataQuery({
                $filter: "(" + companies.map((no) => "contactNo eq " + odataLiteral(no)).join(" or ") + ") and linktoTable eq 'Customer'",
                $select: "vendorNo"
            })
        );
        return ((relations && relations.value) || []).some((row) => row.vendorNo === scope.customerNo) ? found[0] : null;
    }

    function blockedError() {
        var err = new Error("blocked: BC customerPortalAccess is off");
        err.blocked = true;
        return err;
    }

    // Portal status → mcrmSalesOrders filter clause (confirmed mapping 2026-09-14; Completely Shipped wins over Status).
    // Shared so the Orders filter and the Dashboard counts can't drift. Invoiced lives in BC's archive: see invoicedOrders.
    var ORDER_STATUS_FILTER = {
        "Open": "status eq 'Open' and completelyShipped eq false",
        "Pending Prepayment": "status eq 'Pending Prepayment' and completelyShipped eq false",
        "Ready for Dispatch": "status eq 'Released' and completelyShipped eq false",
        "Completely Shipped": "completelyShipped eq true"
    };

    function newestOrderFirst(a, b) {
        if (a.orderDate !== b.orderDate) {
            return a.orderDate < b.orderDate ? 1 : -1;
        }
        return a.salesOrderNo < b.salesOrderNo ? 1 : a.salesOrderNo > b.salesOrderNo ? -1 : 0;
    }

    // The session customer's Invoiced orders, newest first (S2-03, probed 2026-10-16). BC archives an order when it's posted
    // and deletes it from mcrmSalesOrders once fully invoiced, so an archived order that's no longer live is Invoiced; the
    // archive row's status, ship and invoice fields are a copy from before posting and can't tell. One archive query per
    // extra filter clause ("" for none), merged. select must include salesOrderNo, sellToCustomerNo, documentType, orderDate.
    // ponytail: newest 500 archived orders per clause and 1000 live order numbers; page through BC if a customer outgrows that.
    async function invoicedOrders(scope, clauses, select) {
        var base = "sellToCustomerNo eq " + odataLiteral(scope.customerNo) + " and documentType eq 'Order'";
        var results = await Promise.all(
            clauses.map((clause) =>
                bcGet(
                    scope,
                    "mcrmSalesOrderArchives",
                    odataQuery({ $filter: base + (clause ? " and " + clause : ""), $select: select, $orderby: "orderDate desc,salesOrderNo desc", $top: "500" })
                )
            )
        );
        var archived = [];
        results.forEach((res) => {
            ((res && res.value) || []).forEach((row) => {
                if (row.sellToCustomerNo === scope.customerNo && row.documentType === "Order" && !archived.some((seen) => seen.salesOrderNo === row.salesOrderNo)) {
                    archived.push(row);
                }
            });
        });
        if (archived.length === 0) {
            return [];
        }
        var live = await bcGet(scope, "mcrmSalesOrders", odataQuery({ $filter: base, $select: "salesOrderNo", $top: "1000" }));
        var liveNos = ((live && live.value) || []).map((row) => row.salesOrderNo);
        return archived.filter((row) => liveNos.indexOf(row.salesOrderNo) === -1).sort(newestOrderFirst);
    }

    // New Order choices shared by order-quote and the orders POST (S3-06/S3-10): shipment method, source plant, delivery site
    // ("" for pick up) and 1–50 lines; null when anything is missing or out of range.
    function orderChoices(body) {
        var delivery = body.shipmentMethod === "delivery";
        var lines = Array.isArray(body.lines) ? body.lines : [];
        var choices = {
            delivery: delivery,
            source: requestText(body.source, 20),
            site: delivery ? requestText(body.site, 20) : "",
            lines: lines.map((line) => ({
                code: requestText(line && line.code, 20),
                uom: requestText(line && line.uom, 10),
                qty: Number(line && line.qty)
            }))
        };
        var valid = (delivery || body.shipmentMethod === "pickup") && choices.source && choices.site !== null &&
            lines.length > 0 && lines.length <= 50 &&
            choices.lines.every((line) => line.code && line.uom && Number.isFinite(line.qty) && line.qty > 0 && line.qty <= 1000000);
        return valid ? choices : null;
    }

    // A non-empty string of at most max characters, trimmed; null otherwise.
    function requestText(value, max) {
        return typeof value === "string" && value.trim() && value.length <= max ? value.trim() : null;
    }

    // Today's date in the Philippines (UTC+8): the Server Logic clock is UTC.
    function manilaToday() {
        return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    }

    function cents(value) {
        return Math.round(value * 100) / 100;
    }

    // BC's price for one line (portalPriceQuotes: one line per call, computed in memory, never stored). chargeRateMissing is
    // left out for now (decided 2026-10-23); message is written for customers.
    async function quoteLine(scope, choices, line, orderDate) {
        var row = await bcPost(scope, "portalPriceQuotes", {
            customerNo: scope.customerNo,
            itemNo: line.code,
            sourcePlant: choices.source,
            shipmentMethodCode: choices.delivery ? "DELIVERY" : "PICKUP",
            shipToCode: choices.site,
            unitOfMeasureCode: line.uom,
            quantity: line.qty,
            orderDate: orderDate
        });
        return {
            unitPrice: Number(row.unitPrice) || 0,
            lineAmount: Number(row.lineAmount) || 0,
            freight: Number(row.freightAmount) || 0,
            otherCharges: cents((Number(row.fuelSurchargeAmount) || 0) + (Number(row.portChargesAmount) || 0)),
            total: Number(row.totalAmount) || 0,
            message: String(row.message || "")
        };
    }

    // OData string literal with single quotes doubled (architecture rule 4).
    function odataLiteral(value) {
        return "'" + String(value).split("'").join("''") + "'";
    }

    // Query string with every value URL-encoded; BC answers a misleading 401 to a badly encoded query.
    function odataQuery(params) {
        return Object.keys(params)
            .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== "")
            .map((key) => key + "=" + encodeURIComponent(String(params[key])))
            .join("&");
    }

    // Caches the request, not just the token, so calls made in parallel share one token request.
    function bcToken(cfg) {
        if (!bcTokenCache) {
            bcTokenCache = requestToken(cfg);
            bcTokenCache.catch(() => {
                bcTokenCache = null;
            });
        }
        return bcTokenCache;
    }

    async function requestToken(cfg) {
        // The platform form-encodes a JSON object body itself; a raw "a=b&c=d" string is rejected as invalid JSON.
        var form = JSON.stringify({
            grant_type: "client_credentials",
            client_id: cfg.clientId,
            client_secret: cfg.clientSecret,
            scope: "https://api.businesscentral.dynamics.com/.default"
        });
        var response = parseResult(
            await Server.Connector.HttpClient.PostAsync(
                "https://login.microsoftonline.com/" + cfg.tenantId + "/oauth2/v2.0/token",
                form,
                {},
                "application/x-www-form-urlencoded"
            ),
            "token"
        );
        if (!response || !response.access_token) {
            throw new Error("bc-auth no access_token");
        }
        return response.access_token;
    }

    function bcUrl(cfg, scope, entity, query) {
        return "https://api.businesscentral.dynamics.com/v2.0/" + cfg.tenantId + "/" + cfg.environment + cfg.basePath +
            "/companies(" + scope.companyId + ")/" + entity + (query ? "?" + query : "");
    }

    async function bcGet(scope, entity, query) {
        var cfg = bcConfig();
        var token = await bcToken(cfg);
        return parseResult(
            await Server.Connector.HttpClient.GetAsync(bcUrl(cfg, scope, entity, query), { Authorization: "Bearer " + token, Accept: "application/json" }),
            "bc-get " + entity
        );
    }

    async function bcPost(scope, entity, body) {
        var cfg = bcConfig();
        var token = await bcToken(cfg);
        return parseResult(
            await Server.Connector.HttpClient.PostAsync(
                bcUrl(cfg, scope, entity, ""),
                JSON.stringify(body),
                { Authorization: "Bearer " + token, Accept: "application/json" },
                "application/json"
            ),
            "bc-post " + entity
        );
    }

    // Error text that is safe to log: platform messages can echo a request, so remove secrets and tokens.
    // Patterns are RegExp strings: quotes inside regex literals break the plugin validator's brace scan.
    function safeDetail(err) {
        var detail = String((err && err.message) || err);
        [
            ["client_secret=[^&\\s\"']*", "client_secret=[removed]"],
            ["client_secret\"\\s*:\\s*\"[^\"]*\"", "client_secret\": \"[removed]\""],
            ["Bearer\\s+[^\\s\"']+", "Bearer [removed]"],
            ["access_token[\"':=\\s]+[^\\s\"',}]+", "access_token=[removed]"]
        ].forEach((rule) => {
            detail = detail.replace(new RegExp(rule[0], "gi"), rule[1]);
        });
        return detail;
    }

    // Runs the endpoint body; customers only ever see a safe message, the detail goes to the log.
    async function respond(work) {
        try {
            return JSON.stringify(await work());
        } catch (err) {
            // A blocked caller gets a normal reply with no data: thrown messages never reach the browser.
            if (err && err.blocked) {
                Server.Logger.Warn(Server.Context.ServerLogicName + " " + err.message);
                return JSON.stringify({ blocked: true });
            }
            Server.Logger.Error(Server.Context.ServerLogicName + " failed: " + safeDetail(err));
            throw new Error("We couldn't load this information. Please try again.");
        }
    }
    // #endregion bc-helpers

    // Portal status ← BC Sales Header status (confirmed 2026-09-14); an order with everything shipped is Completely Shipped
    // whatever its Status says. BC encodes spaces in enum values as _x0020_. Invoiced orders are gone from mcrmSalesOrders
    // (BC deletes an order once fully invoiced) and come from mcrmSalesOrderArchives through invoicedOrders.
    var STATUS_FROM_BC = { "Open": "Open", "Pending Prepayment": "Pending Prepayment", "Released": "Ready for Dispatch" };
    // Portal ship ← BC Shipment Method Code (PICKUP / DELIVERY on DEV, 2026-10-15); any other code shows "—".
    var SHIP_FROM_BC = { "PICKUP": "Pickup", "DELIVERY": "Delivery" };
    var PAGE_SIZE = 10;
    var SEARCH_CAP = "200";
    // ponytail: Export to Excel (all=true) reads the newest 5,000 live orders; page through BC if a customer outgrows that.
    var EXPORT_CAP = 5000;
    var ORDER_FIELDS = "salesOrderNo,sellToCustomerNo,orderDate,externalDocumentNo,shiptoCode,shipmentMethodCode,tripEntryNo,requestDeliveryDate,totalAmountInclVAT,documentType,status,blanketOrderNo,completelyShipped";
    var ARCHIVE_FIELDS = "salesOrderNo,sellToCustomerNo,orderDate,externalDocumentNo,shiptoCode,shipmentMethodCode,tripEntryNo,requestDeliveryDate,totalAmountInclVAT,documentType,versionNo,docNoOccurrence";
    var LINE_FIELDS = "documentNo,itemNo,description,quantity,unitOfMeasureCode,unitPrice,AmountIncludingVAT";
    var ARCHIVE_LINE_FIELDS = "documentNo,itemNo,description,quantity,unitOfMeasureCode,unitPrice,amountIncludingVAT";
    var ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
    // Blanket Sales Orders (S3-16): BC encodes the space in the enum value.
    var BLANKET = "Blanket_x0020_Order";
    // ponytail: newest 200 blanket orders, no pager (the wireframe has none); page when a customer outgrows it.
    var BLANKET_CAP = "200";

    function param(name) {
        var params = Server.Context.QueryParameters || {};
        var value = params[name];
        return value === undefined || value === null ? "" : String(value).trim();
    }

    // Dates go into the filter unquoted: only a real calendar date in YYYY-MM-DD form (2026-02-30 is dropped too).
    function isoDate(value) {
        if (!ISO_DATE.test(value)) {
            return false;
        }
        var date = new Date(value + "T00:00:00Z");
        return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }

    function bcDate(value) {
        return value && value !== "0001-01-01" ? value : null;
    }

    // documentType defaults to a Sales Order; blanket reads pass BLANKET.
    function owned(row, scope, documentType) {
        return row.sellToCustomerNo === scope.customerNo && row.documentType === (documentType || "Order");
    }

    // The Trip ID assigned date stays null until BC provides it (S2-03). Only archive rows carry versionNo, and the
    // archive rows that reach here are the invoiced ones.
    function toSummary(row) {
        return {
            so: row.salesOrderNo,
            date: row.orderDate || "",
            po: row.externalDocumentNo || "",
            site: row.shiptoCode || "",
            ship: SHIP_FROM_BC[String(row.shipmentMethodCode || "").toUpperCase()] || null,
            bso: row.blanketOrderNo || null,
            trip: row.tripEntryNo ? { id: row.tripEntryNo, assignedAt: null } : null,
            edd: bcDate(row.requestDeliveryDate),
            total: Number(row.totalAmountInclVAT) || 0,
            status: row.versionNo !== undefined ? "Invoiced" : row.completelyShipped === true ? "Completely Shipped" : STATUS_FROM_BC[String(row.status || "").split("_x0020_").join(" ")] || null
        };
    }

    function toLine(row) {
        return {
            code: row.itemNo || "",
            description: row.description || "",
            qty: Number(row.quantity) || 0,
            uom: row.unitOfMeasureCode || "",
            unitPrice: Number(row.unitPrice) || 0,
            // Live lines spell it AmountIncludingVAT, archive lines amountIncludingVAT.
            lineTotal: Number(row.AmountIncludingVAT || row.amountIncludingVAT) || 0
        };
    }

    // Site and date clauses, shared by the live and archive queries; "" when none.
    function narrowFilter() {
        var parts = [];
        var site = param("site");
        var from = param("from");
        var to = param("to");
        if (site) {
            parts.push("shiptoCode eq " + odataLiteral(site));
        }
        if (isoDate(from)) {
            parts.push("orderDate ge " + from);
        }
        if (isoDate(to)) {
            parts.push("orderDate le " + to);
        }
        return parts.join(" and ");
    }

    function liveFilter(scope, status) {
        var narrow = narrowFilter();
        return "sellToCustomerNo eq " + odataLiteral(scope.customerNo) + " and documentType eq 'Order'" +
            (status ? " and " + ORDER_STATUS_FILTER[status] : "") + (narrow ? " and " + narrow : "");
    }

    async function detail(scope, id) {
        var ownFilter = "salesOrderNo eq " + odataLiteral(id) + " and sellToCustomerNo eq " + odataLiteral(scope.customerNo) + " and documentType eq 'Order'";
        var found = await bcGet(scope, "mcrmSalesOrders", odataQuery({ $filter: ownFilter, $select: ORDER_FIELDS }));
        var order = ((found && found.value) || []).find((row) => row.salesOrderNo === id && owned(row, scope));
        if (order) {
            var lines = await bcGet(
                scope,
                "chpSalesOrderLines",
                odataQuery({ $filter: "documentNo eq " + odataLiteral(id), $select: LINE_FIELDS, $top: "500" })
            );
            return withLines(order, lines, id);
        }
        // Not live: an invoiced order is in the archive, its lines under the archived version.
        var archived = await bcGet(scope, "mcrmSalesOrderArchives", odataQuery({ $filter: ownFilter, $select: ARCHIVE_FIELDS }));
        var row = ((archived && archived.value) || []).find((each) => each.salesOrderNo === id && owned(each, scope));
        // Another customer's order gets the same answer as a missing one.
        if (!row) {
            return { notFound: true };
        }
        var archiveLines = await bcGet(
            scope,
            "mcrmSalesOrderArchiveLines",
            odataQuery({
                $filter: "documentNo eq " + odataLiteral(id) + " and versionNo eq " + (Number(row.versionNo) || 0) + " and docNoOccurrence eq " + (Number(row.docNoOccurrence) || 0),
                $select: ARCHIVE_LINE_FIELDS,
                $top: "500"
            })
        );
        return withLines(row, archiveLines, id);
    }

    function withLines(row, lines, id) {
        var dto = toSummary(row);
        dto.lines = ((lines && lines.value) || []).filter((line) => line.documentNo === id).map(toLine);
        return dto;
    }

    // all=true (Export to Excel): every row in one answer.
    function pageOf(rows, total, page, all) {
        if (all) {
            return { orders: rows.map(toSummary), total: total, page: 1, pageSize: rows.length };
        }
        var start = (page - 1) * PAGE_SIZE;
        return { orders: rows.slice(start, start + PAGE_SIZE).map(toSummary), total: total, page: page, pageSize: PAGE_SIZE };
    }

    // Invoiced orders come from the archive, the other statuses from the live orders; All statuses merges both.
    async function list(scope, page) {
        var all = param("all") === "true";
        var status = param("status");
        var invoiced = status === "Invoiced";
        if (status && !invoiced && Object.keys(ORDER_STATUS_FILTER).indexOf(status) === -1) {
            return { orders: [], total: 0, page: page, pageSize: PAGE_SIZE };
        }
        var liveStatus = invoiced ? "" : status;
        var readArchive = !status || invoiced;
        var narrow = narrowFilter();
        var q = param("q").slice(0, 50);
        if (!q) {
            if (invoiced) {
                var only = await invoicedOrders(scope, [narrow], ARCHIVE_FIELDS);
                return pageOf(only, only.length, page, all);
            }
            // The first `page` pages of live orders, so the merge with the invoiced ones can cut out any page.
            // ponytail: up to 10,000 live rows on page 1000; switch to $skip per source if deep pages get slow.
            var both = await Promise.all([
                bcGet(
                    scope,
                    "mcrmSalesOrders",
                    odataQuery({
                        $filter: liveFilter(scope, liveStatus),
                        $select: ORDER_FIELDS,
                        $orderby: "orderDate desc,salesOrderNo desc",
                        $top: String(all ? EXPORT_CAP : page * PAGE_SIZE),
                        $count: "true"
                    })
                ),
                readArchive ? invoicedOrders(scope, [narrow], ARCHIVE_FIELDS) : []
            ]);
            var rows = ((both[0] && both[0].value) || []).filter((row) => owned(row, scope));
            var count = Number(both[0] && both[0]["@odata.count"]);
            return pageOf(rows.concat(both[1]).sort(newestOrderFirst), (isNaN(count) ? rows.length : count) + both[1].length, page, all);
        }
        // BC can't "or" two fields and contains() is case-sensitive: search the SO number (upper case) and the PO
        // reference (as typed and upper case) separately, then merge.
        var upper = q.toUpperCase();
        var terms = [["salesOrderNo", upper], ["externalDocumentNo", q]];
        if (upper !== q) {
            terms.push(["externalDocumentNo", upper]);
        }
        var clauses = terms.map((term) => "contains(" + term[0] + "," + odataLiteral(term[1]) + ")");
        var found = await Promise.all([
            Promise.all(
                (invoiced ? [] : clauses).map((clause) =>
                    bcGet(
                        scope,
                        "mcrmSalesOrders",
                        odataQuery({
                            $filter: liveFilter(scope, liveStatus) + " and " + clause,
                            $select: ORDER_FIELDS,
                            // ponytail: newest 200 per query; page through BC if a customer's searches ever need more.
                            $orderby: "orderDate desc,salesOrderNo desc",
                            $top: SEARCH_CAP
                        })
                    )
                )
            ),
            readArchive ? invoicedOrders(scope, clauses.map((clause) => (narrow ? narrow + " and " : "") + clause), ARCHIVE_FIELDS) : []
        ]);
        var merged = [];
        found[0].forEach((res) => {
            ((res && res.value) || []).forEach((row) => {
                if (owned(row, scope) && !merged.some((seen) => seen.salesOrderNo === row.salesOrderNo)) {
                    merged.push(row);
                }
            });
        });
        merged = merged.concat(found[1]).sort(newestOrderFirst);
        return pageOf(merged, merged.length, page, all);
    }

    function blanketFilter(scope) {
        return "sellToCustomerNo eq " + odataLiteral(scope.customerNo) + " and documentType eq '" + BLANKET + "'";
    }

    // The Blanket Orders tab: no search, filters or pages.
    async function blanketList(scope) {
        var found = await bcGet(
            scope,
            "mcrmSalesOrders",
            odataQuery({ $filter: blanketFilter(scope), $select: ORDER_FIELDS, $orderby: "orderDate desc,salesOrderNo desc", $top: BLANKET_CAP })
        );
        return { orders: ((found && found.value) || []).filter((row) => owned(row, scope, BLANKET)).map(toSummary) };
    }

    // Blanket orders are never archived as invoiced, so there's no archive fallback.
    async function blanketDetail(scope, id) {
        var found = await bcGet(scope, "mcrmSalesOrders", odataQuery({ $filter: "salesOrderNo eq " + odataLiteral(id) + " and " + blanketFilter(scope), $select: ORDER_FIELDS }));
        var order = ((found && found.value) || []).find((row) => row.salesOrderNo === id && owned(row, scope, BLANKET));
        if (!order) {
            return { notFound: true };
        }
        var lines = await bcGet(scope, "chpSalesOrderLines", odataQuery({ $filter: "documentNo eq " + odataLiteral(id), $select: LINE_FIELDS, $top: "500" }));
        return withLines(order, lines, id);
    }

    Server.Logger.Log("orders GET called");
    return respond(() => scopedRead(async (scope) => {
        var id = param("id");
        if (param("type") === "blanket") {
            return id ? blanketDetail(scope, id) : blanketList(scope);
        }
        if (id) {
            return detail(scope, id);
        }
        var page = parseInt(param("page"), 10);
        return list(scope, isNaN(page) || page < 1 ? 1 : Math.min(page, 1000));
    }));
}

// Submit (S3-10): BC prices the order again, then it's created as a BC Sales Order (Open; BC staff take it from there).
// Cash only: credit orders and their approval path are Phase 2 (decided 2026-10-26). Prices and totals from the browser
// are never read; the customer comes from the session.
async function post() {
    // #region bc-helpers (generated from server-logic-src/bc-helpers.js — do not edit)
    // Shared BC helpers (S1-06). Server Logic has no module loading, so scripts/stamp-server-logic-helpers.mjs copies this
    // block into every endpoint between the bc-helpers region markers. Edit here, then run the stamper.
    // Rules: arrow callbacks only; HttpClient calls are awaited; Dataverse calls are synchronous.

    var bcTokenCache = null;

    // HttpClient and connector results arrive as the record, a JSON string, or a { StatusCode, Body } envelope.
    // step names the call in the log. StatusCode 0 means no HTTP answer; the platform's reason is in ServerErrorMessage.
    function parseResult(result, step) {
        var value = typeof result === "string" ? JSON.parse(result) : result;
        if (value && (value.IsSuccessStatusCode === false || (typeof value.StatusCode === "number" && value.StatusCode >= 400))) {
            throw new Error(step + " " + value.StatusCode + " " + (value.ReasonPhrase || "") + " " + (value.ServerErrorMessage || "") + " " + errorDetail(value.Body));
        }
        if (value && typeof value.Body === "string") {
            value = value.Body ? JSON.parse(value.Body) : {};
        }
        return value;
    }

    // The error code and message from an error body: Entra { error, error_description }, BC/Dataverse { error: { code, message } }.
    function errorDetail(body) {
        try {
            var parsed = JSON.parse(body || "{}");
            var error = parsed.error;
            var text = typeof error === "string" ? error + ": " + (parsed.error_description || "") : error ? error.code + ": " + error.message : "";
            return text.slice(0, 300);
        } catch (parseErr) {
            return String(body || "").slice(0, 300);
        }
    }

    function bcConfig() {
        var names = { tenantId: "BC/TenantId", environment: "BC/EnvironmentName", basePath: "BC/ApiBasePath", clientId: "BC/ClientId", clientSecret: "BC/ClientSecret" };
        var cfg = {};
        Object.keys(names).forEach((key) => {
            var value = Server.SiteSetting.Get(names[key]);
            if (!value || !String(value).trim()) {
                throw new Error("bc-config " + names[key] + " is not set");
            }
            cfg[key] = String(value).trim();
        });
        return cfg;
    }

    // Customer and company come only from the signed-in contact's Account (architecture rule 3), and BC must still
    // let this contact into the portal (customerPortalAccess, decided 2026-10-06). Check first: the path for writes.
    async function sessionScope() {
        var scope = accountScope();
        if (!(await portalContact(scope, scope.email))) {
            throw blockedError();
        }
        return scope;
    }

    // Read-only endpoints: work(scope) reads BC while the portal-access check runs (about 1 s saved per call, 2026-10-16);
    // nothing is returned until the check passes, so a blocked caller's data is read and thrown away, never sent.
    async function scopedRead(work) {
        var scope = accountScope();
        var access = portalContact(scope, scope.email);
        var data = work(scope);
        // Settled below or dropped when access fails: never an unhandled rejection.
        data.catch(() => null);
        if (!(await access)) {
            throw blockedError();
        }
        return data;
    }

    function accountScope() {
        var user = Server.User;
        if (!user || !user.contactid) {
            throw new Error("not-signed-in");
        }
        var contact = parseResult(
            Server.Connector.Dataverse.RetrieveRecord(
                "contacts",
                user.contactid,
                "$select=contactid,emailaddress1&$expand=parentcustomerid_account($select=accountid,name,chp_bccustomerno,chp_bccompanyid)"
            ),
            "dataverse"
        );
        var account = contact.parentcustomerid_account;
        if (!account || !account.chp_bccustomerno || !account.chp_bccompanyid) {
            throw new Error("no-account");
        }
        return {
            contactId: user.contactid,
            accountId: account.accountid,
            email: String(contact.emailaddress1 || "").trim().toLowerCase(),
            customerNo: account.chp_bccustomerno,
            companyId: account.chp_bccompanyid,
            customerName: account.name || ""
        };
    }

    // The BC Person contact with this email, customerPortalAccess = true, linked to the session's customer; null when there's
    // none. One email is one person, so the first match serves for the name.
    // Company contacts never count (decided 2026-10-09): their shared email would be a login the Contacts list doesn't show.
    // The email comes from Dataverse, never from the request. A BC failure throws (an error, not a block).
    // ponytail: two BC calls per request; add a short-lived cache if Dev timings show it matters.
    async function portalContact(scope, email) {
        var address = String(email || "").trim().toLowerCase();
        if (!address) {
            return null;
        }
        var contacts = await bcGet(
            scope,
            "MCRMContacts",
            odataQuery({ $filter: "tolower(eMail) eq " + odataLiteral(address) + " and customerPortalAccess eq true and type eq 'Person'", $select: "companyNo,name", $top: "20" })
        );
        var found = ((contacts && contacts.value) || []).filter((row) => row.companyNo);
        if (found.length === 0) {
            return null;
        }
        var companies = found.map((row) => row.companyNo);
        var relations = await bcGet(
            scope,
            "mcrmBusinessRelation",
            odataQuery({
                $filter: "(" + companies.map((no) => "contactNo eq " + odataLiteral(no)).join(" or ") + ") and linktoTable eq 'Customer'",
                $select: "vendorNo"
            })
        );
        return ((relations && relations.value) || []).some((row) => row.vendorNo === scope.customerNo) ? found[0] : null;
    }

    function blockedError() {
        var err = new Error("blocked: BC customerPortalAccess is off");
        err.blocked = true;
        return err;
    }

    // Portal status → mcrmSalesOrders filter clause (confirmed mapping 2026-09-14; Completely Shipped wins over Status).
    // Shared so the Orders filter and the Dashboard counts can't drift. Invoiced lives in BC's archive: see invoicedOrders.
    var ORDER_STATUS_FILTER = {
        "Open": "status eq 'Open' and completelyShipped eq false",
        "Pending Prepayment": "status eq 'Pending Prepayment' and completelyShipped eq false",
        "Ready for Dispatch": "status eq 'Released' and completelyShipped eq false",
        "Completely Shipped": "completelyShipped eq true"
    };

    function newestOrderFirst(a, b) {
        if (a.orderDate !== b.orderDate) {
            return a.orderDate < b.orderDate ? 1 : -1;
        }
        return a.salesOrderNo < b.salesOrderNo ? 1 : a.salesOrderNo > b.salesOrderNo ? -1 : 0;
    }

    // The session customer's Invoiced orders, newest first (S2-03, probed 2026-10-16). BC archives an order when it's posted
    // and deletes it from mcrmSalesOrders once fully invoiced, so an archived order that's no longer live is Invoiced; the
    // archive row's status, ship and invoice fields are a copy from before posting and can't tell. One archive query per
    // extra filter clause ("" for none), merged. select must include salesOrderNo, sellToCustomerNo, documentType, orderDate.
    // ponytail: newest 500 archived orders per clause and 1000 live order numbers; page through BC if a customer outgrows that.
    async function invoicedOrders(scope, clauses, select) {
        var base = "sellToCustomerNo eq " + odataLiteral(scope.customerNo) + " and documentType eq 'Order'";
        var results = await Promise.all(
            clauses.map((clause) =>
                bcGet(
                    scope,
                    "mcrmSalesOrderArchives",
                    odataQuery({ $filter: base + (clause ? " and " + clause : ""), $select: select, $orderby: "orderDate desc,salesOrderNo desc", $top: "500" })
                )
            )
        );
        var archived = [];
        results.forEach((res) => {
            ((res && res.value) || []).forEach((row) => {
                if (row.sellToCustomerNo === scope.customerNo && row.documentType === "Order" && !archived.some((seen) => seen.salesOrderNo === row.salesOrderNo)) {
                    archived.push(row);
                }
            });
        });
        if (archived.length === 0) {
            return [];
        }
        var live = await bcGet(scope, "mcrmSalesOrders", odataQuery({ $filter: base, $select: "salesOrderNo", $top: "1000" }));
        var liveNos = ((live && live.value) || []).map((row) => row.salesOrderNo);
        return archived.filter((row) => liveNos.indexOf(row.salesOrderNo) === -1).sort(newestOrderFirst);
    }

    // New Order choices shared by order-quote and the orders POST (S3-06/S3-10): shipment method, source plant, delivery site
    // ("" for pick up) and 1–50 lines; null when anything is missing or out of range.
    function orderChoices(body) {
        var delivery = body.shipmentMethod === "delivery";
        var lines = Array.isArray(body.lines) ? body.lines : [];
        var choices = {
            delivery: delivery,
            source: requestText(body.source, 20),
            site: delivery ? requestText(body.site, 20) : "",
            lines: lines.map((line) => ({
                code: requestText(line && line.code, 20),
                uom: requestText(line && line.uom, 10),
                qty: Number(line && line.qty)
            }))
        };
        var valid = (delivery || body.shipmentMethod === "pickup") && choices.source && choices.site !== null &&
            lines.length > 0 && lines.length <= 50 &&
            choices.lines.every((line) => line.code && line.uom && Number.isFinite(line.qty) && line.qty > 0 && line.qty <= 1000000);
        return valid ? choices : null;
    }

    // A non-empty string of at most max characters, trimmed; null otherwise.
    function requestText(value, max) {
        return typeof value === "string" && value.trim() && value.length <= max ? value.trim() : null;
    }

    // Today's date in the Philippines (UTC+8): the Server Logic clock is UTC.
    function manilaToday() {
        return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    }

    function cents(value) {
        return Math.round(value * 100) / 100;
    }

    // BC's price for one line (portalPriceQuotes: one line per call, computed in memory, never stored). chargeRateMissing is
    // left out for now (decided 2026-10-23); message is written for customers.
    async function quoteLine(scope, choices, line, orderDate) {
        var row = await bcPost(scope, "portalPriceQuotes", {
            customerNo: scope.customerNo,
            itemNo: line.code,
            sourcePlant: choices.source,
            shipmentMethodCode: choices.delivery ? "DELIVERY" : "PICKUP",
            shipToCode: choices.site,
            unitOfMeasureCode: line.uom,
            quantity: line.qty,
            orderDate: orderDate
        });
        return {
            unitPrice: Number(row.unitPrice) || 0,
            lineAmount: Number(row.lineAmount) || 0,
            freight: Number(row.freightAmount) || 0,
            otherCharges: cents((Number(row.fuelSurchargeAmount) || 0) + (Number(row.portChargesAmount) || 0)),
            total: Number(row.totalAmount) || 0,
            message: String(row.message || "")
        };
    }

    // OData string literal with single quotes doubled (architecture rule 4).
    function odataLiteral(value) {
        return "'" + String(value).split("'").join("''") + "'";
    }

    // Query string with every value URL-encoded; BC answers a misleading 401 to a badly encoded query.
    function odataQuery(params) {
        return Object.keys(params)
            .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== "")
            .map((key) => key + "=" + encodeURIComponent(String(params[key])))
            .join("&");
    }

    // Caches the request, not just the token, so calls made in parallel share one token request.
    function bcToken(cfg) {
        if (!bcTokenCache) {
            bcTokenCache = requestToken(cfg);
            bcTokenCache.catch(() => {
                bcTokenCache = null;
            });
        }
        return bcTokenCache;
    }

    async function requestToken(cfg) {
        // The platform form-encodes a JSON object body itself; a raw "a=b&c=d" string is rejected as invalid JSON.
        var form = JSON.stringify({
            grant_type: "client_credentials",
            client_id: cfg.clientId,
            client_secret: cfg.clientSecret,
            scope: "https://api.businesscentral.dynamics.com/.default"
        });
        var response = parseResult(
            await Server.Connector.HttpClient.PostAsync(
                "https://login.microsoftonline.com/" + cfg.tenantId + "/oauth2/v2.0/token",
                form,
                {},
                "application/x-www-form-urlencoded"
            ),
            "token"
        );
        if (!response || !response.access_token) {
            throw new Error("bc-auth no access_token");
        }
        return response.access_token;
    }

    function bcUrl(cfg, scope, entity, query) {
        return "https://api.businesscentral.dynamics.com/v2.0/" + cfg.tenantId + "/" + cfg.environment + cfg.basePath +
            "/companies(" + scope.companyId + ")/" + entity + (query ? "?" + query : "");
    }

    async function bcGet(scope, entity, query) {
        var cfg = bcConfig();
        var token = await bcToken(cfg);
        return parseResult(
            await Server.Connector.HttpClient.GetAsync(bcUrl(cfg, scope, entity, query), { Authorization: "Bearer " + token, Accept: "application/json" }),
            "bc-get " + entity
        );
    }

    async function bcPost(scope, entity, body) {
        var cfg = bcConfig();
        var token = await bcToken(cfg);
        return parseResult(
            await Server.Connector.HttpClient.PostAsync(
                bcUrl(cfg, scope, entity, ""),
                JSON.stringify(body),
                { Authorization: "Bearer " + token, Accept: "application/json" },
                "application/json"
            ),
            "bc-post " + entity
        );
    }

    // Error text that is safe to log: platform messages can echo a request, so remove secrets and tokens.
    // Patterns are RegExp strings: quotes inside regex literals break the plugin validator's brace scan.
    function safeDetail(err) {
        var detail = String((err && err.message) || err);
        [
            ["client_secret=[^&\\s\"']*", "client_secret=[removed]"],
            ["client_secret\"\\s*:\\s*\"[^\"]*\"", "client_secret\": \"[removed]\""],
            ["Bearer\\s+[^\\s\"']+", "Bearer [removed]"],
            ["access_token[\"':=\\s]+[^\\s\"',}]+", "access_token=[removed]"]
        ].forEach((rule) => {
            detail = detail.replace(new RegExp(rule[0], "gi"), rule[1]);
        });
        return detail;
    }

    // Runs the endpoint body; customers only ever see a safe message, the detail goes to the log.
    async function respond(work) {
        try {
            return JSON.stringify(await work());
        } catch (err) {
            // A blocked caller gets a normal reply with no data: thrown messages never reach the browser.
            if (err && err.blocked) {
                Server.Logger.Warn(Server.Context.ServerLogicName + " " + err.message);
                return JSON.stringify({ blocked: true });
            }
            Server.Logger.Error(Server.Context.ServerLogicName + " failed: " + safeDetail(err));
            throw new Error("We couldn't load this information. Please try again.");
        }
    }
    // #endregion bc-helpers

    // BC Receiving Time codes (S3-03, used as-is since 2026-10-26): 24H anytime, DAY 8am–5pm, EARLY 12–8am, NIGHT 5pm–12am.
    var TIME_WINDOWS = ["24H", "DAY", "EARLY", "NIGHT"];
    // ponytail: BC's Payment Method code for Cash is assumed to be CASH; confirm with BC.
    var CASH = "CASH";

    // "" when empty, the trimmed text when it fits, null when it's too long or not text.
    function optional(value, max) {
        if (value === undefined || value === null || value === "") {
            return "";
        }
        return typeof value === "string" && value.length <= max ? value.trim() : null;
    }

    // "" or a real calendar date (YYYY-MM-DD) from today on in the Philippines; null otherwise.
    function dateFromToday(value) {
        var text = optional(value, 10);
        if (!text) {
            return text;
        }
        var date = new Date(text + "T00:00:00Z");
        var real = /^\d{4}-\d{2}-\d{2}$/.test(text) && !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
        return real && text >= manilaToday() ? text : null;
    }

    // The order's choices and the fulfillment details for its shipment method, or null when anything is out of range.
    function readRequest() {
        var body;
        try {
            body = typeof Server.Context.Body === "string" ? JSON.parse(Server.Context.Body || "{}") : Server.Context.Body || {};
        } catch (err) {
            return null;
        }
        var choices = orderChoices(body);
        if (!choices || body.paymentMethod !== "cash") {
            return null;
        }
        var delivery = choices.delivery;
        var details = {
            poRef: optional(body.poRef, 35),
            instructions: optional(body.instructions, 2048),
            pickupDate: delivery ? "" : dateFromToday(body.pickupDate),
            requestedDate: delivery ? dateFromToday(body.requestedDate) : "",
            person: delivery ? optional(body.receivingPerson, 100) : "",
            contact: delivery ? optional(body.receivingContact, 30) : "",
            // ponytail: BC's field holds 30 characters for now (decided 2026-10-26); 80 when BC widens it.
            email: delivery ? optional(body.receivingEmail, 30) : "",
            timeWindow: delivery ? (TIME_WINDOWS.indexOf(body.timeWindow) >= 0 ? body.timeWindow : null) : ""
        };
        var valid = Object.keys(details).every((key) => details[key] !== null) && (!details.email || details.email.indexOf("@") > 0);
        return valid ? { choices: choices, details: details } : null;
    }

    // mcrmSalesOrders with its lines (deep insert). Every line needs sourcePlant or BC prices nothing (2026-10-25); the
    // header's locationCode is the same plant. Empty fields are left out for BC to default.
    function salesOrder(scope, choices, details) {
        var order = {
            sellToCustomerNo: scope.customerNo,
            shipmentMethodCode: choices.delivery ? "DELIVERY" : "PICKUP",
            locationCode: choices.source,
            paymentMethodCode: CASH
        };
        var fields = choices.delivery
            ? {
                shiptoCode: choices.site,
                contactPerson: details.person,
                selltoPhoneNo: details.contact,
                additionalEMail: details.email,
                requestDeliveryDate: details.requestedDate,
                receivingTime: details.timeWindow
            }
            : { shipmentDate: details.pickupDate };
        fields.externalDocumentNo = details.poRef;
        fields.specialInstruction = details.instructions;
        Object.keys(fields).forEach((key) => {
            if (fields[key]) {
                order[key] = fields[key];
            }
        });
        order.mcrmSalesOrderLines = choices.lines.map((line) => ({
            type: "Item",
            itemNo: line.code,
            quantity: line.qty,
            unitOfMeasureCode: line.uom,
            sourcePlant: choices.source
        }));
        return order;
    }

    Server.Logger.Log("orders POST called");
    return respond(async () => {
        var request = readRequest();
        if (!request) {
            throw new Error("invalid order");
        }
        var scope = await sessionScope();
        var orderDate = manilaToday();
        var quotes = await Promise.all(request.choices.lines.map((line) => quoteLine(scope, request.choices, line, orderDate)));
        // BC may still discount the order below the quote (accepted 2026-10-26); a line it can't price stops it here.
        if (quotes.some((line) => line.unitPrice <= 0)) {
            return { notPriced: true };
        }
        // ponytail: no duplicate guard yet (a portal reference field on mcrmSalesOrders is pending with BC); the SPA sends
        // once per click and keeps Submit disabled while it waits.
        var created = await bcPost(scope, "mcrmSalesOrders", salesOrder(scope, request.choices, request.details));
        if (!created || !created.salesOrderNo) {
            throw new Error("bc-post mcrmSalesOrders: no salesOrderNo");
        }
        Server.Logger.Log("orders POST created " + created.salesOrderNo);
        return { so: created.salesOrderNo };
    });
}
