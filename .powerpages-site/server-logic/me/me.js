// Server Logic: me (S1-07)
// Purpose: the signed-in contact, their active account (Contact.parentcustomerid) and web roles.
// API URL: https://<site>/_api/serverlogics/me
// Scope comes only from the session (Server.User); nothing is read from the request.

function get() {
    // The connector may return the record, a JSON string, or a { StatusCode, Body } envelope.
    function asRecord(result) {
        var value = typeof result === "string" ? JSON.parse(result) : result;
        if (value && value.IsSuccessStatusCode === false) {
            throw new Error("Dataverse " + value.StatusCode + " " + value.ReasonPhrase);
        }
        if (value && typeof value.Body === "string") {
            value = JSON.parse(value.Body);
        }
        return value;
    }

    // Roles may arrive as an array of names, an array of { Name } objects, or a comma-separated string.
    function roleNames(roles) {
        var list = Array.isArray(roles) ? roles : String(roles || "").split(",");
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

        return JSON.stringify({
            contact: { name: contact.fullname || "", email: contact.emailaddress1 || "" },
            account: account
                ? { customerNo: account.chp_bccustomerno || "", customerName: account.name || "", company: account.chp_bccompanyname || "" }
                : null,
            roles: roleNames(user.Roles)
        });
    } catch (err) {
        Server.Logger.Error("me GET failed: " + err.message);
        // Customers see this text; internal details stay in the log.
        throw new Error("We couldn't load your account details.");
    }
}
