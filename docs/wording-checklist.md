# Wording and naming checklist (S1-11 → verified at S5-04)

Customer-facing text follows the wireframe (`docs/Standard_Portal_Flow_v47_ForDevBuildGuide.html`) and the renames in the developer packages. Add a row whenever a screen applies a rename.

| Rename / rule | Source | Applied in | Verified (S5-04) |
|---|---|---|---|
| Portal name **Concreat Connect** (not "Concreat Hub") | Wireframe; decision 2026-10-04 | Topbar, sign-in heading and card title, Help title, `document.title` (`src/lib/usePageTitle.ts`), `index.html` | ☐ |
| Nav order: Dashboard, Delivery Sites, Orders, Customer Ledger, Document Center, Requests, Complaints & Feedback, Account and User Management | PP package, Navigation item | `src/layout/sections.ts` | ☐ |
| "Account" → **Account and User Management** | PP package, Navigation item | `src/layout/sections.ts` | ☐ |
| Sign-in field "User ID or email" → **Email**, placeholder `j.santos@sample-customer.ph` | Client request 2026-10-04 (differs from wireframe) | `src/modules/signin/SignIn.tsx` | ☐ |
| Help overviews verbatim from the wireframe help modal | Wireframe `#help-modal` | `src/layout/sections.ts` (`help`) | ☐ |
| Activate / Set password copy (no wireframe) | Spec 2026-10-04, pending client review | `src/modules/signin/Activate.tsx`, `SetPassword.tsx` | ☐ |
| "+ New Multiple Order" | PP package | Orders (S3-13), not built yet | ☐ |
| No BC jargon (location codes, table names) and no internal service-center system name | CLAUDE.md | All screens | ☐ |
