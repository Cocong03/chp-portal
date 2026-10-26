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

    // Active, activated portal contacts on the session's Account and their web roles (table permission
    // "Contact - same account (read)"). Deactivating a contact removes access (runbook); no username = activation unfinished.
    function portalContacts(scope) {
        var result = parseResult(
            Server.Connector.Dataverse.RetrieveMultipleRecords(
                "contacts",
                "$select=emailaddress1&$filter=_parentcustomerid_value eq " + scope.accountId +
                    " and statecode eq 0 and adx_identity_username ne null" +
                    "&$expand=powerpagecomponent_mspp_webrole_contact($select=name)",
                // skipCache: roles and activations changed outside the site must show at once, not up to 15 min later.
                true
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
    return respond(() => scopedRead(async (scope) => {
        var results = await Promise.all([customerCard(scope), bcPeople(scope)]);
        var portal = portalContacts(scope);
        var card = results[0];
        card.contacts = results[1]
            .map((person) => contactRow(person, portal, scope.email))
            .sort((a, b) => (a.isYou !== b.isYou ? (a.isYou ? -1 : 1) : a.name.localeCompare(b.name)));
        return card;
    }));
}
