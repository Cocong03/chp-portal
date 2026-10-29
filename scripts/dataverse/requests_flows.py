"""Create or update the S4-07 service-center (monday.com) flows in ConcreatHubRequests. Dev only. Idempotent.
Runs ONLY against org1945492c (the Requests/Complaints dev environment), like requests_schema.py.

Each flow's definition is the JSON file named in FLOWS (next to this file). Environment-specific values (monday API URL,
board ids, column maps, token) come from environment variables at run time; the definitions hold none of them. The token
(chp_MondayAPIToken) is set by hand and never read, set or printed here.

Usage (from the repo root; .env or the shell holds DATAVERSE_URL=https://org1945492c.crm.dynamics.com):
    CHP_SOLUTION=ConcreatHubRequests python scripts/dataverse/requests_flows.py [--columns <map.json>] [--only <key>]
--columns sets chp_MondayRequestsColumns / chp_MondayComplaintsColumns from a JSON file keyed by those schema names
(the Task 0 spike's monday_columns_map.json), before the flows are turned on so they load the new values.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from dv import SOLUTION, Dataverse, load_env  # noqa: E402

load_env()
assert 'org1945492c' in os.environ.get('DATAVERSE_URL', ''), 'DATAVERSE_URL must be https://org1945492c.crm.dynamics.com'
assert SOLUTION == 'ConcreatHubRequests', 'set CHP_SOLUTION=ConcreatHubRequests'

API = 'shared_commondataserviceforapps'
REF = 'chp_dataverse'
COLUMN_MAPS = ('chp_MondayRequestsColumns', 'chp_MondayComplaintsColumns')
FLOWS = [
    # (key, name, definition file, description)
    ('SEND_REQUEST', 'Concreat Connect – Send request to service center', 'request_send_flow.json',
     'Creates the monday.com item for a new portal request (Pending, no item yet) and writes back the item id. S4-07.'),
    ('SEND_COMPLAINT', 'Concreat Connect – Send complaint to service center', 'complaint_send_flow.json',
     'Creates the monday.com item for a new portal complaint (Pending, no item yet) and writes back the item id. S4-07.'),
    ('SYNC', 'Concreat Connect – Sync with service center', 'service_sync_flow.json',
     'Every hour (backstop for a missed webhook): reads the status of the portal\'s monday.com items back into Dataverse, '
     'and re-sends Failed or stuck Pending rows by bumping chp_syncattempts. S4-07. shortcut: re-sends every hour without '
     'a cap; add a max-attempts stop if ops see repeat failures.'),
    ('WEBHOOK', 'Concreat Connect – Service center status webhook', 'service_webhook_flow.json',
     'Called by the monday.com boards\' webhooks when the status column changes: re-reads that one item from monday and writes its '
     'status back to Dataverse in real time. S4-07. The trigger URL is the secret; monday_webhooks.py registers it.'),
]

parser = argparse.ArgumentParser()
parser.add_argument('--columns', help='JSON file with the two column maps, keyed by env var schema name')
parser.add_argument('--only', help='deploy only this flow key, e.g. SEND_REQUEST')
args = parser.parse_args()

dv = Dataverse()
here = os.path.dirname(__file__)
solution_id = dv.get(f"solutions?$select=solutionid&$filter=uniquename eq '{SOLUTION}'")['value'][0]['solutionid']

if args.columns:
    maps = json.load(open(args.columns, encoding='utf-8'))
    for schema in COLUMN_MAPS:
        value = json.dumps(maps[schema], separators=(',', ':'))
        def_id = dv.get("environmentvariabledefinitions?$select=environmentvariabledefinitionid"
                        f"&$filter=schemaname eq '{schema}'")['value'][0]['environmentvariabledefinitionid']
        rows = dv.get("environmentvariablevalues?$select=environmentvariablevalueid"
                      f"&$filter=_environmentvariabledefinitionid_value eq {def_id}")['value']
        if rows:
            dv.patch(f"environmentvariablevalues({rows[0]['environmentvariablevalueid']})", {'value': value})
        else:
            dv.post('environmentvariablevalues', {'schemaname': schema, 'value': value,
                                                  'EnvironmentVariableDefinitionId@odata.bind': f'/environmentvariabledefinitions({def_id})'})
        print(f'= {schema} = {value}')

if not dv.get(f"connectionreferences?$select=connectionreferenceid&$filter=connectionreferencelogicalname eq '{REF}'")['value']:
    raise SystemExit(f'connection reference {REF} is missing in this environment')
print(f'= connection reference {REF} exists')
clientrefs = {API: {'runtimeSource': 'embedded', 'connection': {'connectionReferenceLogicalName': REF}, 'api': {'name': API}}}

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
    in_sol = dv.get(f"solutioncomponents?$select=objectid&$filter=objectid eq {wf} and _solutionid_value eq {solution_id}")['value']
    print(f'  on, in {SOLUTION}: {bool(in_sol)}')
    print(f'{key}_FLOW_ID={wf}')
