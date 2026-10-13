// Server Logic: ledger (S2-08)
// Purpose: the signed-in customer's BC Customer Ledger Entries — filtered, searched and paged in BC.
// API URL: https://<site>/_api/serverlogics/ledger?q=&type=&show=all&from=&to=&page=
// Customer and company come only from the session's Account; request values only narrow the list.
// The BC entity and fields are the S2-07 request (docs/superpowers/specs/2026-10-13-s2-c-ledger-design.md) until BC confirms them.

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
        if (!(await portalContact(scope, contact.emailaddress1))) {
            throw blockedError();
        }
        return scope;
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

    var ENTITY = "customerLedgerEntries";
    var TYPES = ["Invoice", "Credit Memo", "Payment"];
    var PAGE_SIZE = 10;
    var SEARCH_CAP = "200";
    var FIELDS = "customerNo,entryNo,postingDate,documentType,documentNo,externalDocumentNo,description,dueDate,amount,remainingAmount,open";
    // Entry No. is unique: one payment can post several entries with the same type, number and date.
    var ORDER_BY = "postingDate desc,entryNo desc";
    var ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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

    function toEntry(row) {
        return {
            docNo: row.documentNo || "",
            refPo: row.externalDocumentNo || null,
            type: String(row.documentType || "").split("_x0020_").join(" "),
            desc: row.description || "",
            postingDate: row.postingDate || "",
            dueDate: bcDate(row.dueDate),
            original: Number(row.amount) || 0,
            remaining: Number(row.remainingAmount) || 0,
            status: row.open ? "Open" : "Closed"
        };
    }

    function newestFirst(a, b) {
        if (a.postingDate !== b.postingDate) {
            return a.postingDate < b.postingDate ? 1 : -1;
        }
        return (Number(b.entryNo) || 0) - (Number(a.entryNo) || 0);
    }

    function listFilter(scope, type) {
        var parts = ["customerNo eq " + odataLiteral(scope.customerNo)];
        var from = param("from");
        var to = param("to");
        if (param("show") !== "all") {
            parts.push("open eq true");
        }
        if (type) {
            parts.push("documentType eq " + odataLiteral(type));
        }
        if (isoDate(from)) {
            parts.push("postingDate ge " + from);
        }
        if (isoDate(to)) {
            parts.push("postingDate le " + to);
        }
        return parts.join(" and ");
    }

    // BC's contains() is case-sensitive and BC can't "or" two fields: document and PO numbers are Code fields (stored
    // upper case); descriptions are searched as typed, lower case and Capitalised. One query per distinct term.
    function searchTerms(q) {
        var upper = q.toUpperCase();
        var lower = q.toLowerCase();
        var terms = [["documentNo", upper], ["externalDocumentNo", upper]];
        [q, lower, upper.charAt(0) + lower.slice(1)].forEach((variant) => {
            if (!terms.some((term) => term[0] === "description" && term[1] === variant)) {
                terms.push(["description", variant]);
            }
        });
        return terms;
    }

    async function list(scope, page) {
        var type = param("type");
        if (type && TYPES.indexOf(type) === -1) {
            return { entries: [], total: 0, page: page, pageSize: PAGE_SIZE };
        }
        var filter = listFilter(scope, type);
        var mine = (row) => row.customerNo === scope.customerNo;
        var q = param("q").slice(0, 50);
        if (!q) {
            var result = await bcGet(
                scope,
                ENTITY,
                odataQuery({
                    $filter: filter,
                    $select: FIELDS,
                    $orderby: ORDER_BY,
                    $top: String(PAGE_SIZE),
                    $skip: String((page - 1) * PAGE_SIZE),
                    $count: "true"
                })
            );
            var rows = ((result && result.value) || []).filter(mine);
            var count = Number(result && result["@odata.count"]);
            return { entries: rows.map(toEntry), total: isNaN(count) ? rows.length : count, page: page, pageSize: PAGE_SIZE };
        }
        var results = await Promise.all(
            searchTerms(q).map((term) =>
                bcGet(
                    scope,
                    ENTITY,
                    odataQuery({
                        $filter: filter + " and contains(" + term[0] + "," + odataLiteral(term[1]) + ")",
                        $select: FIELDS,
                        // ponytail: newest 200 per query (as orders); page through BC if a customer's searches ever need more.
                        $orderby: ORDER_BY,
                        $top: SEARCH_CAP
                    })
                )
            )
        );
        var merged = [];
        var seen = {};
        results.forEach((res) => {
            ((res && res.value) || []).filter(mine).forEach((row) => {
                var key = String(row.entryNo);
                if (!seen[key]) {
                    seen[key] = true;
                    merged.push(row);
                }
            });
        });
        merged.sort(newestFirst);
        var start = (page - 1) * PAGE_SIZE;
        return { entries: merged.slice(start, start + PAGE_SIZE).map(toEntry), total: merged.length, page: page, pageSize: PAGE_SIZE };
    }

    Server.Logger.Log("ledger GET called");
    return respond(async () => {
        var scope = await sessionScope();
        var page = parseInt(param("page"), 10);
        return list(scope, isNaN(page) || page < 1 ? 1 : Math.min(page, 1000));
    });
}
