// Server Logic: me (S1-07)
// Purpose: the signed-in contact, their active account (Contact.parentcustomerid) and web roles.
// API URL: https://<site>/_api/serverlogics/me
// Scope comes only from the session (Server.User); nothing is read from the request.

function get() {
    // The connector may return the record, a JSON string, or a { StatusCode, Body } envelope.
    function asRecord(result) {
        var value = typeof result === "string" ? JSON.parse(result) : result;
        if (value && (value.IsSuccessStatusCode === false || (typeof value.StatusCode === "number" && value.StatusCode >= 400))) {
            throw new Error("Dataverse " + value.StatusCode + " " + value.ReasonPhrase);
        }
        if (value && typeof value.Body === "string") {
            value = JSON.parse(value.Body);
        }
        return value;
    }

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

        var contact = asRecord(
            Server.Connector.Dataverse.RetrieveRecord(
                "contacts",
                user.contactid,
                "$select=fullname,emailaddress1&$expand=parentcustomerid_account($select=name,chp_bccustomerno,chp_bccompanyname)"
            )
        );
        var account = contact.parentcustomerid_account;

        // Server.User.Roles reached scripts as the text "System.String[]" on Dev (2026-10-04),
        // so read the contact's web roles from Dataverse; fall back to Server.User.Roles if that read fails.
        var roles;
        try {
            var withRoles = asRecord(
                Server.Connector.Dataverse.RetrieveRecord(
                    "contacts",
                    user.contactid,
                    "$select=contactid&$expand=powerpagecomponent_mspp_webrole_contact($select=name)"
                )
            );
            roles = roleNames(withRoles.powerpagecomponent_mspp_webrole_contact || []);
        } catch (roleErr) {
            Server.Logger.Warn("me: web role read failed, using Server.User.Roles: " + roleErr.message);
            roles = roleNames(user.Roles);
        }

        return JSON.stringify({
            contact: { name: contact.fullname || "", email: contact.emailaddress1 || "" },
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
