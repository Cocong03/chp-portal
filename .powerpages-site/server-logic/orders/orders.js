// Server Logic: orders (S2-04)
// Purpose: the signed-in customer's BC Sales Orders — list (filtered and paged in BC) and detail with lines.
// API URL: https://<site>/_api/serverlogics/orders?q=&site=&from=&to=&page=  ·  ?id=SOR…
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
    // let this contact into the portal (customerPortalAccess, decided 2026-10-06).
    async function sessionScope() {
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
        var scope = {
            contactId: user.contactid,
            accountId: account.accountid,
            email: String(contact.emailaddress1 || "").trim().toLowerCase(),
            customerNo: account.chp_bccustomerno,
            companyId: account.chp_bccompanyid,
            customerName: account.name || ""
        };
        if (!(await hasPortalAccess(scope, contact.emailaddress1))) {
            throw blockedError();
        }
        return scope;
    }

    // True while BC has a Person contact with this email, customerPortalAccess = true, linked to the session's customer.
    // Company contacts never count (decided 2026-10-09): their shared email would be a login the Contacts list doesn't show.
    // The email comes from Dataverse, never from the request. A BC failure throws (an error, not a block).
    // ponytail: two BC calls per request; add a short-lived cache if Dev timings show it matters.
    async function hasPortalAccess(scope, email) {
        var address = String(email || "").trim().toLowerCase();
        if (!address) {
            return false;
        }
        var contacts = await bcGet(
            scope,
            "MCRMContacts",
            odataQuery({ $filter: "tolower(eMail) eq " + odataLiteral(address) + " and customerPortalAccess eq true and type eq 'Person'", $select: "companyNo", $top: "20" })
        );
        var companies = ((contacts && contacts.value) || []).map((row) => row.companyNo).filter((no) => no);
        if (companies.length === 0) {
            return false;
        }
        var relations = await bcGet(
            scope,
            "mcrmBusinessRelation",
            odataQuery({
                $filter: "(" + companies.map((no) => "contactNo eq " + odataLiteral(no)).join(" or ") + ") and linktoTable eq 'Customer'",
                $select: "vendorNo"
            })
        );
        return ((relations && relations.value) || []).some((row) => row.vendorNo === scope.customerNo);
    }

    function blockedError() {
        var err = new Error("blocked: BC customerPortalAccess is off");
        err.blocked = true;
        return err;
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

    async function bcToken(cfg) {
        if (bcTokenCache) {
            return bcTokenCache;
        }
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
        bcTokenCache = response.access_token;
        return bcTokenCache;
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

    // mcrmSalesOrders also returns blanket (BSO), credit memo (SCM) and invoice (SIN) documents and has no document
    // type; BC rejects "not", so only the SOR series is listed. Switch to documentType eq 'Order' when BC adds it.
    var SO_SERIES = "SOR";
    var PAGE_SIZE = 10;
    var SEARCH_CAP = "200";
    var ORDER_FIELDS = "salesOrderNo,sellToCustomerNo,orderDate,externalDocumentNo,shiptoCode,shipmentMethodCode,tripEntryNo,requestDeliveryDate,totalAmountInclVAT";
    var LINE_FIELDS = "documentNo,itemNo,description,quantity,unitOfMeasureCode,unitPrice,AmountIncludingVAT";
    var ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

    function param(name) {
        var params = Server.Context.QueryParameters || {};
        var value = params[name];
        return value === undefined || value === null ? "" : String(value).trim();
    }

    function bcDate(value) {
        return value && value !== "0001-01-01" ? value : null;
    }

    function owned(row, scope) {
        return row.sellToCustomerNo === scope.customerNo && String(row.salesOrderNo || "").indexOf(SO_SERIES) === 0;
    }

    function newestFirst(a, b) {
        if (a.orderDate !== b.orderDate) {
            return a.orderDate < b.orderDate ? 1 : -1;
        }
        return a.salesOrderNo < b.salesOrderNo ? 1 : a.salesOrderNo > b.salesOrderNo ? -1 : 0;
    }

    // Status, ship (Pick up / Delivery), Blanket SO # and the Trip ID assigned date stay null until BC provides them (S2-03).
    function toSummary(row) {
        return {
            so: row.salesOrderNo,
            date: row.orderDate || "",
            po: row.externalDocumentNo || "",
            site: row.shiptoCode || "",
            ship: null,
            bso: null,
            trip: row.tripEntryNo ? { id: row.tripEntryNo, assignedAt: null } : null,
            edd: bcDate(row.requestDeliveryDate),
            total: Number(row.totalAmountInclVAT) || 0,
            status: null
        };
    }

    function toLine(row) {
        return {
            code: row.itemNo || "",
            description: row.description || "",
            qty: Number(row.quantity) || 0,
            uom: row.unitOfMeasureCode || "",
            unitPrice: Number(row.unitPrice) || 0,
            lineTotal: Number(row.AmountIncludingVAT) || 0
        };
    }

    function listFilter(scope) {
        var parts = ["sellToCustomerNo eq " + odataLiteral(scope.customerNo), "startswith(salesOrderNo," + odataLiteral(SO_SERIES) + ")"];
        var site = param("site");
        var from = param("from");
        var to = param("to");
        if (site) {
            parts.push("shiptoCode eq " + odataLiteral(site));
        }
        // Dates go into the filter unquoted, so only an exact YYYY-MM-DD is accepted.
        if (ISO_DATE.test(from)) {
            parts.push("orderDate ge " + from);
        }
        if (ISO_DATE.test(to)) {
            parts.push("orderDate le " + to);
        }
        return parts.join(" and ");
    }

    async function detail(scope, id) {
        if (id.indexOf(SO_SERIES) !== 0) {
            return { notFound: true };
        }
        var found = await bcGet(
            scope,
            "mcrmSalesOrders",
            odataQuery({
                $filter: "salesOrderNo eq " + odataLiteral(id) + " and sellToCustomerNo eq " + odataLiteral(scope.customerNo),
                $select: ORDER_FIELDS
            })
        );
        var order = ((found && found.value) || []).find((row) => row.salesOrderNo === id && owned(row, scope));
        // Another customer's order gets the same answer as a missing one.
        if (!order) {
            return { notFound: true };
        }
        var lines = await bcGet(
            scope,
            "chpSalesOrderLines",
            odataQuery({ $filter: "documentNo eq " + odataLiteral(id), $select: LINE_FIELDS, $top: "500" })
        );
        var dto = toSummary(order);
        dto.lines = ((lines && lines.value) || []).filter((line) => line.documentNo === id).map(toLine);
        return dto;
    }

    async function list(scope, page) {
        var filter = listFilter(scope);
        var q = param("q").slice(0, 50);
        if (!q) {
            var result = await bcGet(
                scope,
                "mcrmSalesOrders",
                odataQuery({
                    $filter: filter,
                    $select: ORDER_FIELDS,
                    $orderby: "orderDate desc,salesOrderNo desc",
                    $top: String(PAGE_SIZE),
                    $skip: String((page - 1) * PAGE_SIZE),
                    $count: "true"
                })
            );
            var rows = ((result && result.value) || []).filter((row) => owned(row, scope));
            var count = Number(result && result["@odata.count"]);
            return { orders: rows.map(toSummary), total: isNaN(count) ? rows.length : count, page: page, pageSize: PAGE_SIZE };
        }
        // BC can't "or" two fields and contains() is case-sensitive: search the SO number (upper case) and the PO
        // reference (as typed and upper case) separately, then merge.
        var upper = q.toUpperCase();
        var terms = [["salesOrderNo", upper], ["externalDocumentNo", q]];
        if (upper !== q) {
            terms.push(["externalDocumentNo", upper]);
        }
        var results = await Promise.all(
            terms.map((term) =>
                bcGet(
                    scope,
                    "mcrmSalesOrders",
                    odataQuery({ $filter: filter + " and contains(" + term[0] + "," + odataLiteral(term[1]) + ")", $select: ORDER_FIELDS, $top: SEARCH_CAP })
                )
            )
        );
        var merged = [];
        results.forEach((res) => {
            ((res && res.value) || []).forEach((row) => {
                if (owned(row, scope) && !merged.some((seen) => seen.salesOrderNo === row.salesOrderNo)) {
                    merged.push(row);
                }
            });
        });
        merged.sort(newestFirst);
        var start = (page - 1) * PAGE_SIZE;
        return { orders: merged.slice(start, start + PAGE_SIZE).map(toSummary), total: merged.length, page: page, pageSize: PAGE_SIZE };
    }

    Server.Logger.Log("orders GET called");
    return respond(async () => {
        var scope = await sessionScope();
        var id = param("id");
        if (id) {
            return detail(scope, id);
        }
        var page = parseInt(param("page"), 10);
        return list(scope, isNaN(page) || page < 1 ? 1 : Math.min(page, 1000));
    });
}
