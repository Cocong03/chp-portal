// Server Logic: complaints (S4-02, S4-05)
// Purpose: the signed-in customer's complaints (Dataverse chp_complaint): list, taxonomy, create. A monday.com sync picks up Pending rows.
// API URL: https://<site>/_api/serverlogics/complaints[?taxonomy=1]
// Account and contact come only from the session; the body never sets them. SO numbers and ship-to codes are checked against BC.
// The script validator rejects the lowercase word for removing records and the letters e-v-a-l together, so keep both out of comments.

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

    var STATUS = { 775000000: "Submitted", 775000001: "In Review", 775000002: "Resolved" };
    var METHOD = { 775000000: "Email", 775000001: "Mobile" };
    var COLUMNS = "chp_complaintid,chp_reference,createdon,chp_category,chp_complainttype,chp_assignedgroup,chp_incidentdate,chp_sitelabel,chp_subject,chp_description,chp_relatedorder,chp_contactmethod,chp_contactvalue,chp_contactperson,chp_attachmentname,chp_status,chp_dateresolved,chp_resolution";

    // Date-only columns come as YYYY-MM-DD (or with a time part); the customer sees the date or nothing.
    function dateOnly(value) {
        return value ? String(value).slice(0, 10) : "";
    }

    function toDto(row) {
        return {
            id: row.chp_complaintid,
            ref: row.chp_reference || "",
            submitted: row.createdon,
            category: row.chp_category || "",
            complaintType: row.chp_complainttype || "",
            assignedGroup: row.chp_assignedgroup || "",
            incidentDate: dateOnly(row.chp_incidentdate),
            deliverySite: row.chp_sitelabel || "",
            subject: row.chp_subject || "",
            description: row.chp_description || "",
            relatedOrder: row.chp_relatedorder || "",
            contactMethod: METHOD[row.chp_contactmethod] || "Email",
            contactValue: row.chp_contactvalue || "",
            contactPerson: row.chp_contactperson || "",
            attachmentName: row.chp_attachmentname || "",
            status: STATUS[row.chp_status] || "Submitted",
            dateResolved: dateOnly(row.chp_dateresolved),
            resolutionNote: row.chp_resolution || ""
        };
    }

    function taxonomy() {
        var result = parseResult(
            Server.Connector.Dataverse.RetrieveMultipleRecords(
                "chp_complainttypes",
                "$select=chp_name,chp_category,chp_assignedgroup&$filter=chp_active eq true&$orderby=chp_sortorder",
                true
            ),
            "dataverse"
        );
        var categories = [];
        ((result && result.value) || []).forEach((row) => {
            var found = categories.find((each) => each.name === row.chp_category);
            if (!found) {
                found = { name: row.chp_category, types: [] };
                categories.push(found);
            }
            found.types.push({ type: row.chp_name, group: row.chp_assignedgroup || "" });
        });
        return { categories: categories };
    }

    Server.Logger.Log("complaints GET called");
    return respond(() =>
        scopedRead(async (scope) => {
            if (String((Server.Context.QueryParameters || {}).taxonomy || "") === "1") {
                return taxonomy();
            }
            // ponytail: newest 500 per account; page if a customer outgrows that
            var result = parseResult(
                Server.Connector.Dataverse.RetrieveMultipleRecords(
                    "chp_complaints",
                    "$select=" + COLUMNS + "&$filter=_chp_account_value eq " + scope.accountId + "&$orderby=createdon desc&$top=500",
                    true
                ),
                "dataverse"
            );
            return ((result && result.value) || []).map(toDto);
        })
    );
}

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

    var METHODS = { Email: 775000000, Mobile: 775000001 };
    // Own-key checks: a plain object lookup also matches inherited members such as constructor or toString.
    function isOwn(map, key) {
        return Object.keys(map).indexOf(key) !== -1;
    }
    var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    // Philippine mobile, as in the wireframe sample: 0917 552 6613, 09175526613 or +63 917 552 6613.
    var MOBILE = /^(\+63|0)9\d{2}[ -]?\d{3}[ -]?\d{4}$/;
    var ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
    var BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
    var MAX_FILE = 5242880;
    var DELIVERY_CATEGORY = "Delivery & Handling";
    // Complaints take no spreadsheets (unlike requests).
    var MIME = {
        pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp"
    };

    // A write's answer may be empty (undocumented); a non-empty one is checked for an error status.
    function written(result) {
        return result ? parseResult(result, "dataverse") : null;
    }

    function readBody() {
        try {
            var body = typeof Server.Context.Body === "string" ? JSON.parse(Server.Context.Body || "{}") : Server.Context.Body || {};
            return body && typeof body === "object" && !Array.isArray(body) ? body : {};
        } catch (err) {
            return {};
        }
    }

    function text(value) {
        return typeof value === "string" ? value.trim() : "";
    }

    function isoDate(value) {
        if (!ISO_DATE.test(value)) {
            return false;
        }
        var date = new Date(value + "T00:00:00Z");
        return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }

    // Today's date in Manila (UTC+8, no daylight saving) as YYYY-MM-DD.
    function manilaToday() {
        return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    }

    function typeRow(category, type) {
        var result = parseResult(
            Server.Connector.Dataverse.RetrieveMultipleRecords(
                "chp_complainttypes",
                "$select=chp_name,chp_category,chp_assignedgroup&$top=1&$filter=" + encodeURIComponent("chp_active eq true and chp_category eq " + odataLiteral(category) + " and chp_name eq " + odataLiteral(type)),
                true
            ),
            "dataverse"
        );
        var row = ((result && result.value) || [])[0];
        return row && row.chp_name === type ? row : null;
    }

    // The session customer's own order, live or archived (same filter as orders detail); the number as BC spells it, or "".
    async function ownOrder(scope, id) {
        var ownFilter = "salesOrderNo eq " + odataLiteral(id) + " and sellToCustomerNo eq " + odataLiteral(scope.customerNo) + " and documentType eq 'Order'";
        var entities = ["mcrmSalesOrders", "mcrmSalesOrderArchives"];
        for (var i = 0; i < entities.length; i++) {
            var found = await bcGet(scope, entities[i], odataQuery({ $filter: ownFilter, $select: "salesOrderNo,sellToCustomerNo,documentType" }));
            var row = ((found && found.value) || []).find((each) => each.salesOrderNo === id && each.sellToCustomerNo === scope.customerNo);
            if (row) {
                return row.salesOrderNo;
            }
        }
        return "";
    }

    async function shipToLabel(scope, code) {
        var found = await bcGet(
            scope,
            "mcrmShipToAddress",
            odataQuery({ $filter: "documentNo eq " + odataLiteral(scope.customerNo) + " and code eq " + odataLiteral(code), $select: "documentNo,code,name", $top: "1" })
        );
        var row = ((found && found.value) || []).find((each) => each.code === code && each.documentNo === scope.customerNo);
        return row ? row.code + " — " + row.name : "";
    }

    // Decoded size of a base64 string, without decoding it.
    function decodedSize(base64) {
        var padding = base64.slice(-2) === "==" ? 2 : base64.slice(-1) === "=" ? 1 : 0;
        return Math.floor((base64.length * 3) / 4) - padding;
    }

    function attachmentOf(body) {
        var file = body.attachment;
        var name = file && typeof file.name === "string" ? file.name.trim() : "";
        var ext = name.indexOf(".") > 0 ? name.split(".").pop().toLowerCase() : "";
        var base64 = file && typeof file.base64 === "string" ? file.base64 : "";
        return isOwn(MIME, ext) && name.length <= 260 && !/[\x00-\x1f"\\/]/.test(name) && base64.length % 4 === 0 && BASE64.test(base64) && decodedSize(base64) <= MAX_FILE ? { name: name, base64: base64, mime: MIME[ext] } : null;
    }

    function invalid(field) {
        return { invalid: true, field: field };
    }

    Server.Logger.Log("complaints POST called");
    return respond(async () => {
        var scope = await sessionScope();
        var body = readBody();
        var category = text(body.category);
        var complaintType = text(body.complaintType);
        var row = category && complaintType ? typeRow(category, complaintType) : null;
        if (!row) {
            return invalid(category ? "complaintType" : "category");
        }
        category = row.chp_category;
        complaintType = row.chp_name;
        var contactMethod = text(body.contactMethod);
        var contactValue = text(body.contactValue);
        if (!isOwn(METHODS, contactMethod) || !(contactMethod === "Email" ? EMAIL : MOBILE).test(contactValue)) {
            return invalid(isOwn(METHODS, contactMethod) ? "contactValue" : "contactMethod");
        }
        var subject = text(body.subject);
        if (!subject || subject.length > 200) {
            return invalid("subject");
        }
        var description = text(body.description);
        if (description.length > 4000) {
            return invalid("description");
        }
        if (body.consent !== true) {
            return invalid("consent");
        }
        var incidentDate = text(body.incidentDate);
        if (incidentDate && (!isoDate(incidentDate) || incidentDate > manilaToday())) {
            return invalid("incidentDate");
        }
        var site = text(body.site);
        var siteLabel = "";
        if (site) {
            siteLabel = category === DELIVERY_CATEGORY ? await shipToLabel(scope, site) : "";
            if (!siteLabel) {
                return invalid("site");
            }
        }
        var relatedOrder = text(body.relatedOrder);
        if (relatedOrder) {
            relatedOrder = await ownOrder(scope, relatedOrder);
            if (!relatedOrder) {
                return invalid("relatedOrder");
            }
        }
        var file = null;
        if (body.attachment) {
            file = attachmentOf(body);
            if (!file) {
                return invalid("attachment");
            }
        }
        var contact = parseResult(Server.Connector.Dataverse.RetrieveRecord("contacts", scope.contactId, "$select=fullname", true), "dataverse");
        var create = {
            chp_category: category,
            chp_complainttype: complaintType,
            chp_assignedgroup: row.chp_assignedgroup || "",
            chp_contactmethod: METHODS[contactMethod],
            chp_contactvalue: contactValue,
            chp_contactperson: (contact && contact.fullname) || "",
            chp_subject: subject,
            chp_description: description,
            chp_consent: true,
            chp_sitecode: site,
            chp_sitelabel: siteLabel,
            chp_relatedorder: relatedOrder,
            chp_status: 775000000,
            chp_syncstate: 775000000,
            chp_syncattempts: 0,
            "chp_Account@odata.bind": "/accounts(" + scope.accountId + ")",
            "chp_Contact@odata.bind": "/contacts(" + scope.contactId + ")"
        };
        if (incidentDate) {
            create.chp_incidentdate = incidentDate;
        }
        if (file) {
            create.chp_attachmentname = file.name;
            // Deep insert: the note exists the moment the complaint does, so the sync flow never sees one without the other.
            create.chp_complaint_Annotations = [{ subject: file.name, filename: file.name, mimetype: file.mime, documentbody: file.base64 }];
        }
        written(Server.Connector.Dataverse.CreateRecord("chp_complaints", JSON.stringify(create)));
        // ponytail: reads back the contact's newest complaint instead of relying on the create answer's shape; two saves in
        // the same instant could return the other one. Use the created id if Dev logs show the connector returns it.
        var latest = parseResult(
            Server.Connector.Dataverse.RetrieveMultipleRecords(
                "chp_complaints",
                "$select=chp_complaintid,chp_reference&$filter=_chp_contact_value eq " + scope.contactId + "&$orderby=createdon desc&$top=1",
                true
            ),
            "dataverse"
        );
        var created = ((latest && latest.value) || [])[0];
        if (!created) {
            // The complaint exists: answering an error would make the customer submit it again.
            Server.Logger.Warn("complaints POST created a complaint but could not read it back");
            return { ref: "" };
        }
        return { ref: created.chp_reference };
    });
}
