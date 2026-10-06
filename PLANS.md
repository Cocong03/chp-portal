# Active: S1 Foundation Tasks

See implementation plans at docs\Concreat_Hub_Implementation_Plan.md

## Requirements and Context

- if portal access have a same email in contacts are both true. Add a message that doesnt proceed in activation. "Multiple accounts found" suggest better message wording for this
  - ✅ Built and deployed (Dev): "We couldn't activate this email automatically" + service center line. Live check pending a BC email on two portal-enabled customers.
- If the user already confirmed the link. It should be expired and not be able to activate again
  - ✅ Done (Dev): a used, expired or superseded link shows the expired card as soon as it is opened; each new request cancels older links; links last 24 hours.
- When setting password, the email should be auto populated not manual typed
  - ✅ Done (Dev): the email comes from the link, pre-filled and read-only.
- In access grant app, the customer no. and email should be auto populated
  - ⏸ Out of scope by decision (2026-10-06): keep the current app.
- Forgot password feature
  - ✅ Done (Dev): branded "Reset your password" / "Set a new password" screens and email; verified end to end 2026-10-06.
- If the email is already activated and tried to activate it. Add a message that already activated
  - ✅ Done (Dev): "Your account is already active" with Sign in / Reset password; verified live.
- if the user is already activated and portal access = false and user tried to login, add a message blocked
  - ✅ Done (Dev): live BC check on every request; "Your access has been turned off" card; verified with a contact without BC access. Flag on→off→on check pending.
