// Server Logic: company (S1-06; contacts S2-19)
// Purpose: the signed-in contact's own BC customer card and its contacts with portal access.
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

    // Highest first; the Permissions column shows one role.
    var BUSINESS_ROLES = ["Full Access", "Orders & Delivery", "Finance & Documents", "View Only"];
    // BC DEV field names (probed 2026-10-08, see the S2-A spec). MCRMContacts has no job title field yet (S2-18).
    var CONTACT_FIELDS = "no,companyNo,type,name,phoneNo,mobilePhoneNo,eMail,customerPortalAccess,privacyBlocked";

    function lower(value) {
        return String(value || "").trim().toLowerCase();
    }

    async function customerCard(scope) {
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
            // mcrmCustomers has no website field yet (S2-18).
            website: "",
            vatRegNumber: row.VATRegNo || "",
            phone: row.Phone_No || "",
            email: row.EMail || ""
        };
    }

    // The customer's BC person contacts: its company contacts (business relation), then their people.
    async function bcPeople(scope) {
        var relations = await bcGet(
            scope,
            "mcrmBusinessRelation",
            odataQuery({ $filter: "vendorNo eq " + odataLiteral(scope.customerNo) + " and linktoTable eq 'Customer'", $select: "contactNo,vendorNo" })
        );
        var companyNos = ((relations && relations.value) || [])
            .filter((row) => row.vendorNo === scope.customerNo && row.contactNo)
            .map((row) => row.contactNo);
        if (companyNos.length === 0) {
            return [];
        }
        var people = await bcGet(
            scope,
            "MCRMContacts",
            odataQuery({
                $filter: "(" + companyNos.map((no) => "companyNo eq " + odataLiteral(no)).join(" or ") + ") and type eq 'Person'",
                $select: CONTACT_FIELDS,
                $top: "200"
            })
        );
        return ((people && people.value) || []).filter((row) => companyNos.indexOf(row.companyNo) >= 0 && !row.privacyBlocked);
    }

    // Portal contacts on the session's Account and their web roles (table permission "Contact - same account (read)").
    function portalContacts(scope) {
        var result = parseResult(
            Server.Connector.Dataverse.RetrieveMultipleRecords(
                "contacts",
                "$select=emailaddress1&$filter=_parentcustomerid_value eq " + scope.accountId +
                    "&$expand=powerpagecomponent_mspp_webrole_contact($select=name)"
            ),
            "dataverse"
        );
        return ((result && result.value) || []).map((row) => ({
            email: lower(row.emailaddress1),
            roles: (row.powerpagecomponent_mspp_webrole_contact || []).map((role) => role.name)
        }));
    }

    // Portal access = activated on this account + a business web role + BC customerPortalAccess (S2-A decision 1).
    function contactRow(person, portal, you) {
        var email = lower(person.eMail);
        var match = email ? portal.find((p) => p.email === email) : undefined;
        var role = match ? BUSINESS_ROLES.find((name) => match.roles.indexOf(name) >= 0) || "" : "";
        var access = role !== "" && person.customerPortalAccess === true;
        return {
            name: person.name || "",
            title: "",
            phone: person.phoneNo || person.mobilePhoneNo || "",
            email: String(person.eMail || "").trim(),
            portalAccess: access,
            portalRole: access ? role : "",
            isYou: email !== "" && email === you
        };
    }

    Server.Logger.Log("company GET called");
    return respond(async () => {
        var scope = await sessionScope();
        var results = await Promise.all([customerCard(scope), bcPeople(scope)]);
        var portal = portalContacts(scope);
        var card = results[0];
        card.contacts = results[1]
            .map((person) => contactRow(person, portal, scope.email))
            .sort((a, b) => (a.isYou !== b.isYou ? (a.isYou ? -1 : 1) : a.name.localeCompare(b.name)));
        return card;
    });
}
