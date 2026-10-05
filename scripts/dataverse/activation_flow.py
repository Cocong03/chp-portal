"""Create or update the solution-aware 'Concreat Connect – Request activation' flow in ConcreatHub (S1-03). Dev only.

Definition: activation_flow.json (next to this file). Idempotent. Environment-specific values come from the
ConcreatHub environment variables at run time; the definition holds none of them.

Usage (from the repo root):
  python scripts/dataverse/activation_flow.py [--outlook-connection <connection name>]
--outlook-connection is needed only the first time, to create the chp_outlook connection reference
(the Office 365 Outlook connection that sends the activation email; in Dev, the developer's own).
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from dv import Dataverse  # noqa: E402  (sets MSCRM.SolutionUniqueName: ConcreatHub)

NAME = 'Concreat Connect – Request activation'
SOLUTION_ID = 'ed4d4ea0-74bd-f111-aaad-7ced8dfe9114'
REFS = {
    'shared_commondataserviceforapps': ('chp_dataverse', 'Concreat Hub – Dataverse'),
    'shared_office365': ('chp_outlook', 'Concreat Hub – Office 365 Outlook'),
}

parser = argparse.ArgumentParser()
parser.add_argument('--outlook-connection', help='Office 365 Outlook connection name, e.g. shared-office365-…')
args = parser.parse_args()

dv = Dataverse()

for api, (ref, display) in REFS.items():
    if dv.get(f"connectionreferences?$select=connectionreferenceid&$filter=connectionreferencelogicalname eq '{ref}'")['value']:
        print(f'= connection reference {ref} exists')
    elif api == 'shared_office365' and args.outlook_connection:
        dv.post('connectionreferences', {'connectionreferencelogicalname': ref, 'connectionreferencedisplayname': display,
                                         'connectorid': f'/providers/Microsoft.PowerApps/apis/{api}',
                                         'connectionid': args.outlook_connection})
        print(f'+ connection reference {ref}')
    else:
        raise SystemExit(f'connection reference {ref} is missing' +
                         (' — pass --outlook-connection <name>' if api == 'shared_office365' else ' — run grant_flow.py first'))

definition = json.load(open(os.path.join(os.path.dirname(__file__), 'activation_flow.json'), encoding='utf-8'))
clientdata = {'properties': {'connectionReferences': {
    api: {'runtimeSource': 'embedded', 'connection': {'connectionReferenceLogicalName': ref}, 'api': {'name': api}}
    for api, (ref, _) in REFS.items()}, 'definition': definition}, 'schemaVersion': '1.0.0.0'}

found = dv.get(f"workflows?$select=workflowid&$filter=name eq '{NAME}' and category eq 5")['value']
if found:
    wf = found[0]['workflowid']
    dv.patch(f'workflows({wf})', {'statecode': 0, 'statuscode': 1})  # a flow must be off to change its definition
    try:
        dv.patch(f'workflows({wf})', {'clientdata': json.dumps(clientdata)})
    except SystemExit:
        dv.patch(f'workflows({wf})', {'statecode': 1, 'statuscode': 2})  # keep the previous definition running
        print('! definition rejected; flow turned back on with its previous definition')
        raise
    print(f'= flow exists ({wf}), definition updated')
else:
    entity = dv.post('workflows', {'name': NAME, 'category': 5, 'type': 1, 'primaryentity': 'none',
                                   'description': 'Activation request from the portal: BC match, Q10 block, account/contact/link, '
                                                  'pending grants, single-use invitation email. S1-03.',
                                   'clientdata': json.dumps(clientdata)})
    wf = entity.split('(')[-1].rstrip(')')
    print(f'+ flow {wf}')

# Turning the flow on (re)loads the environment variable values into it.
dv.patch(f'workflows({wf})', {'statecode': 1, 'statuscode': 2})
print('= flow turned on')
in_sol = dv.get(f"solutioncomponents?$select=objectid&$filter=objectid eq {wf} and _solutionid_value eq {SOLUTION_ID}")['value']
print('in ConcreatHub:', bool(in_sol))
print(f'FLOW_ID={wf}')
