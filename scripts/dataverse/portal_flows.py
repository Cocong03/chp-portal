"""Create or update the solution-aware Concreat Connect portal flows in ConcreatHub. Dev only. Idempotent.

Each flow's definition is the JSON file named in FLOWS (next to this file). Environment-specific values come from
the ConcreatHub environment variables at run time; the definitions hold none of them.

Usage (from the repo root):
  python scripts/dataverse/portal_flows.py [--outlook-connection <name>] [--approvals-connection <name>] [--only <key>]
--outlook-connection and --approvals-connection are needed only the first time, to create the chp_outlook and
chp_approvals connection references.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from dv import Dataverse  # noqa: E402  (sets MSCRM.SolutionUniqueName: ConcreatHub)

SOLUTION_ID = 'ed4d4ea0-74bd-f111-aaad-7ced8dfe9114'
REFS = {
    'shared_commondataserviceforapps': ('chp_dataverse', 'Concreat Hub – Dataverse'),
    'shared_office365': ('chp_outlook', 'Concreat Hub – Office 365 Outlook'),
    'shared_approvals': ('chp_approvals', 'Concreat Hub – Approvals'),
}
FLOWS = [
    # (key, name, definition file, description)
    ('ACTIVATION', 'Concreat Connect – Request activation', 'activation_flow.json',
     'Activation request from the portal: BC match, Q10, account/contact/link, pending grants, single-use invitation email. S1-03.'),
    ('CHECK_LINK', 'Concreat Connect – Check activation link', 'check_link_flow.json',
     'Tells the Set password page whether an activation link is still valid (valid | invalid). S1-03.'),
    ('PASSWORD_RESET', 'Concreat Connect – Send password reset', 'password_reset_flow.json',
     "Delivers Power Pages' password reset email as a branded Outlook email. S1-03."),
    ('CREDIT_APPROVAL', 'Concreat Connect – Credit approval', 'credit_approval_flow.json',
     'Credit orders held by the portal: Outlook approval by the credit team, BC order on Approve. S3-04.'),
]

parser = argparse.ArgumentParser()
parser.add_argument('--outlook-connection', help='Office 365 Outlook connection name')
parser.add_argument('--approvals-connection', help='Approvals connection name')
parser.add_argument('--only', help='deploy only this flow key, e.g. CHECK_LINK')
args = parser.parse_args()

dv = Dataverse()
here = os.path.dirname(__file__)

CONNECTION_ARGS = {'shared_office365': ('outlook_connection', '--outlook-connection'),
                   'shared_approvals': ('approvals_connection', '--approvals-connection')}
for api, (ref, display) in REFS.items():
    arg, flag = CONNECTION_ARGS.get(api, (None, None))
    if dv.get(f"connectionreferences?$select=connectionreferenceid&$filter=connectionreferencelogicalname eq '{ref}'")['value']:
        print(f'= connection reference {ref} exists')
    elif arg and getattr(args, arg):
        dv.post('connectionreferences', {'connectionreferencelogicalname': ref, 'connectionreferencedisplayname': display,
                                         'connectorid': f'/providers/Microsoft.PowerApps/apis/{api}',
                                         'connectionid': getattr(args, arg)})
        print(f'+ connection reference {ref}')
    else:
        raise SystemExit(f'connection reference {ref} is missing' +
                         (f' — pass {flag} <name>' if flag else ' — run grant_flow.py first'))

clientrefs = {api: {'runtimeSource': 'embedded', 'connection': {'connectionReferenceLogicalName': ref}, 'api': {'name': api}}
              for api, (ref, _) in REFS.items()}

for key, name, file, description in FLOWS:
    if args.only and key != args.only:
        continue
    path = os.path.join(here, file)
    if not os.path.exists(path):
        print(f'- {key}: {file} not written yet, skipped')
        continue
    definition = json.load(open(path, encoding='utf-8'))
    clientdata = {'properties': {'connectionReferences': clientrefs, 'definition': definition}, 'schemaVersion': '1.0.0.0'}
    found = dv.get(f"workflows?$select=workflowid&$filter=name eq '{name}' and category eq 5")['value']
    if found:
        wf = found[0]['workflowid']
        dv.patch(f'workflows({wf})', {'statecode': 0, 'statuscode': 1})  # a flow must be off to change its definition
        try:
            dv.patch(f'workflows({wf})', {'clientdata': json.dumps(clientdata)})
        except SystemExit:
            dv.patch(f'workflows({wf})', {'statecode': 1, 'statuscode': 2})  # keep the previous definition running
            print(f'! {key}: definition rejected; flow turned back on with its previous definition')
            raise
        print(f'= {key}: flow exists ({wf}), definition updated')
    else:
        entity = dv.post('workflows', {'name': name, 'category': 5, 'type': 1, 'primaryentity': 'none',
                                       'description': description, 'clientdata': json.dumps(clientdata)})
        wf = entity.split('(')[-1].rstrip(')')
        print(f'+ {key}: flow {wf}')
    # Turning the flow on (re)loads the environment variable values into it.
    dv.patch(f'workflows({wf})', {'statecode': 1, 'statuscode': 2})
    in_sol = dv.get(f"solutioncomponents?$select=objectid&$filter=objectid eq {wf} and _solutionid_value eq {SOLUTION_ID}")['value']
    print(f'  on, in ConcreatHub: {bool(in_sol)}')
    print(f'{key}_FLOW_ID={wf}')
