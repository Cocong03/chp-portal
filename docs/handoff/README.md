# Handoff — Requests, Complaints & Feedback, Document Center

This covers the work I built in a separate environment so it wouldn't get in the way of the main build. It now needs to move into the main environment. There are three pieces:

| Piece | Notes |
|---|---|
| Requests and Complaints & Feedback tabs | [requests-and-complaints.md](requests-and-complaints.md) |
| Sending them to the service center and getting status back | [service-center-sync.md](service-center-sync.md) |
| Document Center | [document-center.md](document-center.md) |

The code is in the `reco/handoff` branch, sitting on top of `main` as three commits, one per piece. The Dataverse parts (tables, flows, environment variables) are in the `ConcreatHubRequests` solution. I've exported that separately because it doesn't live in git.

## What you get outside git

I'll send these as a folder (`ConcreatConnect-Handoff`):

- `ConcreatHubRequests_1_0_0_0.zip`: the unmanaged solution. Four tables (`chp_request`, `chp_complaint`, `chp_requesttype`, `chp_complainttype`) plus their relationships to Account and Contact, the four service center flows, and six environment variable definitions. Nothing in it has a value set, so the monday token isn't in the file.
- `chp_requesttype.csv` and `chp_complainttype.csv`: the category / type / assigned group rows the two forms read. They're data, so they don't come with the solution.
- `environment-values.json`: the values the environment variables need (API URL, board IDs, column maps). The token is left as a placeholder on purpose.

## Moving it over

1. **Merge the branch.** `reco/handoff` is based on the latest `main`, so it should merge cleanly. The only files outside the new modules it touches are `src/api/types.ts`, `src/layout/SectionRoute.tsx`, `src/mocks/index.ts`, `scripts/dataverse/dv.py`, `scripts/dataverse/identity_schema.py` and `test/server-logic/permissions.test.ts`, and those are additions only.
2. **Check the connection reference.** The flows use the `chp_dataverse` connection reference. It's already in `ConcreatHub`, so it should be there, but confirm before importing.
3. **Import the solution** into the target environment (unmanaged). When it asks, leave the environment variable values empty. They're set in the next step.
4. **Set the environment variables** from `environment-values.json`. `chp_MondayAPIToken` is set by hand. It's the token for the monday integration user, and it never goes in a file or in chat.
5. **Load the type rows.** Import the two CSVs into `chp_requesttype` and `chp_complainttype` (Power Apps → table → Import → Import data from Excel/CSV). The `chp_fieldconfig` column holds JSON, so check it came through intact on a couple of rows.
6. **Turn the flows on.** Turning a flow off and on again is also how it picks up changed environment variable values.
7. **Deploy the site** as usual (`pac pages upload-code-site --rootPath .` after `pac auth who`). The Server Logic endpoints, table permissions and pages all come with the code.
8. **Register the monday webhooks** for the new environment. The webhook flow has a new URL in every environment, so the old registration won't reach it. See [service-center-sync.md](service-center-sync.md#webhooks).
9. **Smoke test.** Submit one request and one complaint, check both show up on the boards, change a status on the board and watch it change in the portal.

## Things to know

- The scripts under `scripts/dataverse/` for this work (`requests_schema.py`, `requests_flows.py`, `monday_webhooks.py`) only run against the dev environment they were written for, because they check the org URL first. If you want to run them against another environment, change that check. Otherwise the solution import does the same job.
- Web roles, the BC helpers and the overall Server Logic patterns are the existing ones. Nothing new there.
- What's still open is listed at the end of each page, mainly the Statement of Account and a BC posting question on the Document Center.
