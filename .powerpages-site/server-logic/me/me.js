// Server Logic: me (S1-07)
// Purpose: the signed-in contact, their active account (Contact.parentcustomerid) and web roles,
// or { blocked: true } when BC has switched their portal access off (decided 2026-10-06).
// API URL: https://<site>/_api/serverlogics/me
// Scope comes only from the session (Server.User); nothing is read from the request.

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
                "$select=contactid,emailaddress1&$expand=parentcustomerid_account($select=name,chp_bccustomerno,chp_bccompanyid)"
            ),
            "dataverse"
        );
        var account = contact.parentcustomerid_account;
        if (!account || !account.chp_bccustomerno || !account.chp_bccompanyid) {
            throw new Error("no-account");
        }
        var scope = { contactId: user.contactid, customerNo: account.chp_bccustomerno, companyId: account.chp_bccompanyid, customerName: account.name || "" };
        if (!(await hasPortalAccess(scope, contact.emailaddress1))) {
            throw blockedError();
        }
        return scope;
    }

    // True while BC has a contact with this email, customerPortalAccess = true, linked to the session's customer.
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
            odataQuery({ $filter: "tolower(eMail) eq " + odataLiteral(address) + " and customerPortalAccess eq true", $select: "companyNo", $top: "20" })
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
            // Platform messages can echo a request; never let a secret or token reach the log.
            // Patterns are RegExp strings: quotes inside regex literals break the plugin validator's brace scan.
            var detail = String(err.message);
            [
                ["client_secret=[^&\\s\"']*", "client_secret=[removed]"],
                ["client_secret\"\\s*:\\s*\"[^\"]*\"", "client_secret\": \"[removed]\""],
                ["Bearer\\s+[^\\s\"']+", "Bearer [removed]"],
                ["access_token[\"':=\\s]+[^\\s\"',}]+", "access_token=[removed]"]
            ].forEach((rule) => {
                detail = detail.replace(new RegExp(rule[0], "gi"), rule[1]);
            });
            Server.Logger.Error(Server.Context.ServerLogicName + " failed: " + detail);
            throw new Error("We couldn't load this information. Please try again.");
        }
    }
    // #endregion bc-helpers

    // Roles arrive as a .NET string[] on the Power Pages runtime (Length + indexer; String() gives "System.String[]").
    // Also accept a JS array, any iterable, an array of { Name } objects, or a comma-separated string.
    function roleNames(roles) {
        var list = [];
        if (typeof roles === "string") {
            list = roles.split(",");
        } else if (roles) {
            var count = typeof roles.length === "number" ? roles.length : roles.Length;
            if (typeof count === "number") {
                for (var i = 0; i < count; i++) {
                    list.push(roles[i]);
                }
            } else if (typeof roles[Symbol.iterator] === "function") {
                list = Array.from(roles);
            }
        }
        // Arrow callbacks only: the runtime validator (RTSL01) rejects anonymous function expressions, even in comments.
        return list
            .map((role) => (typeof role === "string" ? role.trim() : String((role && (role.Name || role.name)) || "").trim()))
            .filter((name) => name.length > 0);
    }

    try {
        Server.Logger.Log("me GET called");
        var user = Server.User;
        if (!user || !user.contactid) {
            throw new Error("No signed-in contact");
        }

        var contact = parseResult(
            Server.Connector.Dataverse.RetrieveRecord(
                "contacts",
                user.contactid,
                "$select=fullname,emailaddress1&$expand=parentcustomerid_account($select=name,chp_bccustomerno,chp_bccompanyid,chp_bccompanyname)"
            ),
            "dataverse"
        );
        var account = contact.parentcustomerid_account;
        var who = { name: contact.fullname || "", email: contact.emailaddress1 || "" };

        if (account && account.chp_bccustomerno && account.chp_bccompanyid) {
            var scope = { contactId: user.contactid, customerNo: account.chp_bccustomerno, companyId: account.chp_bccompanyid, customerName: account.name || "" };
            if (!(await hasPortalAccess(scope, contact.emailaddress1))) {
                Server.Logger.Warn("me blocked: BC customerPortalAccess is off");
                return JSON.stringify({ contact: who, account: null, roles: [], blocked: true });
            }
        }

        // Server.User.Roles reached scripts as the text "System.String[]" on Dev (2026-10-04),
        // so read the contact's web roles from Dataverse; fall back to Server.User.Roles if that read fails.
        var roles;
        try {
            var withRoles = parseResult(
                Server.Connector.Dataverse.RetrieveRecord(
                    "contacts",
                    user.contactid,
                    "$select=contactid&$expand=powerpagecomponent_mspp_webrole_contact($select=name)"
                ),
                "dataverse"
            );
            roles = roleNames(withRoles.powerpagecomponent_mspp_webrole_contact || []);
        } catch (roleErr) {
            Server.Logger.Warn("me: web role read failed, using Server.User.Roles: " + roleErr.message);
            roles = roleNames(user.Roles);
        }

        return JSON.stringify({
            contact: who,
            account: account
                ? { customerNo: account.chp_bccustomerno || "", customerName: account.name || "", company: account.chp_bccompanyname || "" }
                : null,
            roles: roles
        });
    } catch (err) {
        Server.Logger.Error("me GET failed: " + err.message);
        // Customers see this text; internal details stay in the log.
        throw new Error("We couldn't load your account details.");
    }
}
