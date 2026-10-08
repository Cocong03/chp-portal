# Wording and naming checklist (S1-11 → verified at S5-04)

Customer-facing text follows the wireframe (`docs/Standard_Portal_Flow_v47_ForDevBuildGuide.html`) and the renames in the developer packages. Add a row whenever a screen applies a rename.

| Rename / rule | Source | Applied in | Verified (S5-04) |
|---|---|---|---|
| Portal name **Concreat Connect** (not "Concreat Hub") | Wireframe; decision 2026-10-04 | Topbar, sign-in heading and card title, Help title, `document.title` (`src/lib/usePageTitle.ts`), `index.html` | ☐ |
| Nav order: Dashboard, Delivery Sites, Orders, Customer Ledger, Document Center, Requests, Complaints & Feedback, Account and User Management | PP package, Navigation item | `src/layout/sections.ts` | ☐ |
| "Account" → **Account and User Management** | PP package, Navigation item | `src/layout/sections.ts` | ☐ |
| Sign-in field "User ID or email" → **Email**, placeholder `j.santos@sample-customer.ph` | Client request 2026-10-04 (differs from wireframe) | `src/modules/signin/SignIn.tsx` | ☐ |
| Failed sign-in: Power Pages "Invalid sign-in attempt." → **Incorrect email or password. Please try again.** | Client request 2026-10-04 | `src/auth/session.ts` | ☐ |
| Help overviews verbatim from the wireframe help modal | Wireframe `#help-modal` | `src/layout/sections.ts` (`help`) | ☐ |
| Activate / Set password copy (no wireframe) | Spec 2026-10-04, pending client review | `src/modules/signin/Activate.tsx`, `SetPassword.tsx` | ☐ |
| "+ New Multiple Order" | PP package | Orders (S3-13), not built yet | ☐ |
| No BC jargon (location codes, table names) and no internal service-center system name | CLAUDE.md | All screens | ☐ |
| Delivery Sites: "Active Delivery Sites", search placeholder *Search site name, code, or city*, "Showing N delivery sites.", *No delivery sites match your search.* | Mockup v2 `#panel-sites` | `src/modules/sites/SitesPage.tsx` | ☐ |
| New copy (not in the mockup), **for Rene to confirm**: *No delivery sites are registered on your account yet.* · *No contacts are registered on your account yet.* · load error *We couldn't load this information. Please try again.* + **Try again** | S2-A spec 2026-10-08 | `SitesPage.tsx`, `AccountPage.tsx`, `src/ui/QueryError.tsx` | ☐ |
| Account and User Management: "Company Information", "Contacts & Portal Access", columns Name · Title · Phone · Email · Portal access · Permissions · Actions, "You" pill, *Can see: …* hint | Mockup v2 `#panel-account` | `src/modules/account/AccountPage.tsx` | ☐ |
| Dashboard announcement eyebrow "Announcement"; no greeting (removed in mockup v2, 2026-09-29) | Mockup v2 `#dash-announcement` | `src/modules/dashboard/` | ☐ |
| Page load failure (new copy, **for Rene to confirm**): *We couldn't load this page. Please reload.* + **Reload** | S2-A final review 2026-10-08 | `src/layout/PageErrorBoundary.tsx` | ☐ |
