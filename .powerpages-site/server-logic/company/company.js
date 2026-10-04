// Server Logic: company (S1-06 proof of the BC helpers; extended by S2-19)
// Purpose: the signed-in contact's own BC customer card.
// API URL: https://<site>/_api/serverlogics/company
// Customer and company come only from the session's Account; nothing is read from the request.

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
            throw new Error(step + " " + value.StatusCode + " " + (value.ReasonPhrase || "") + " " + (value.ServerErrorMessage || ""));
        }
        if (value && typeof value.Body === "string") {
            value = value.Body ? JSON.parse(value.Body) : {};
        }
        return value;
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

    // Customer and company come only from the signed-in contact's Account (architecture rule 3).
    function sessionScope() {
        var user = Server.User;
        if (!user || !user.contactid) {
            throw new Error("not-signed-in");
        }
        var contact = parseResult(
            Server.Connector.Dataverse.RetrieveRecord(
                "contacts",
                user.contactid,
                "$select=contactid&$expand=parentcustomerid_account($select=name,chp_bccustomerno,chp_bccompanyid)"
            ),
            "dataverse"
        );
        var account = contact.parentcustomerid_account;
        if (!account || !account.chp_bccustomerno || !account.chp_bccompanyid) {
            throw new Error("no-account");
        }
        return { contactId: user.contactid, customerNo: account.chp_bccustomerno, companyId: account.chp_bccompanyid, customerName: account.name || "" };
    }

    // OData string literal with single quotes doubled (architecture rule 4).
    function odataLiteral(value) {
        return "'" + String(value).replace(/'/g, "''") + "'";
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

    // Runs the endpoint body; customers only ever see a safe message, the detail goes to the log.
    async function respond(work) {
        try {
            return JSON.stringify(await work());
        } catch (err) {
            // Platform messages can echo a request; never let a secret or token reach the log.
            var detail = String(err.message)
                .replace(/client_secret=[^&\s"']*/gi, "client_secret=[removed]")
                .replace(/client_secret"\s*:\s*"[^"]*"/gi, 'client_secret": "[removed]"')
                .replace(/Bearer\s+[^\s"']+/gi, "Bearer [removed]")
                .replace(/access_token["':=\s]+[^\s"',}]+/gi, "access_token=[removed]");
            Server.Logger.Error(Server.Context.ServerLogicName + " failed: " + detail);
            throw new Error("We couldn't load this information. Please try again.");
        }
    }
    // #endregion bc-helpers

    Server.Logger.Log("company GET called");
    return respond(async () => {
        var scope = sessionScope();
        var result = await bcGet(
            scope,
            "mcrmCustomers",
            odataQuery({
                $filter: "Customer_No eq " + odataLiteral(scope.customerNo),
                $select: "Customer_No,Name,Address,Address_2,City,County,Post_Code,VATRegNo,Phone_No,EMail"
            })
        );
        var rows = (result && result.value) || [];
        // Detail ownership check: exactly the session customer, nothing else.
        if (rows.length !== 1 || rows[0].Customer_No !== scope.customerNo) {
            throw new Error("not-found " + scope.customerNo);
        }
        var row = rows[0];
        return {
            customerNo: row.Customer_No,
            customerName: row.Name || "",
            address: [row.Address, row.Address_2, row.City, row.County, row.Post_Code]
                .filter((part) => part && String(part).trim())
                .join(", "),
            vatRegNumber: row.VATRegNo || "",
            phone: row.Phone_No || "",
            email: row.EMail || ""
        };
    });
}
