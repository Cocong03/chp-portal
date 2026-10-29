"""Register the monday.com webhooks that call the status webhook flow (S4-07, real-time status). Dev only. Idempotent.
Dev only (dv.py refuses any other org), after `requests_flows.py --only WEBHOOK` has created the flow.

The flow's trigger URL carries its own signature, so it is a secret like the token: both are read in memory and never
printed. Each board gets one `change_specific_column_value` webhook on its status column (from the column map env var), so
other column edits don't run the flow; the flow re-reads the item, so only real status reaches Dataverse.

Usage (from the repo root; .env or the shell holds DATAVERSE_URL=<Dev org URL>):
    python scripts/dataverse/monday_webhooks.py
"""
import json
import os
import sys

import requests

sys.path.insert(0, os.path.dirname(__file__))
from dv import Dataverse, load_env  # noqa: E402

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from auth import get_token  # noqa: E402

load_env()

WEBHOOK_FLOW = 'Concreat Connect – Service center status webhook'  # as named in requests_flows.py
TRIGGER = 'monday_webhook'
EVENT = 'change_specific_column_value'
dv = Dataverse()


def env_value(schema):
    definition = dv.get("environmentvariabledefinitions?$select=environmentvariabledefinitionid,defaultvalue"
                        f"&$filter=schemaname eq '{schema}'")['value'][0]
    rows = dv.get("environmentvariablevalues?$select=value"
                  f"&$filter=_environmentvariabledefinitionid_value eq {definition['environmentvariabledefinitionid']}")['value']
    return ((rows[0]['value'] if rows else '') or definition.get('defaultvalue') or '').strip()


flow_id = dv.get(f"workflows?$select=workflowid&$filter=name eq '{WEBHOOK_FLOW}' and category eq 5")['value'][0]['workflowid']
env_id = dv.get("RetrieveCurrentOrganization(AccessType=@p)?@p=Microsoft.Dynamics.CRM.EndpointAccessType'Default'")['Detail']['EnvironmentId']
callback = requests.post(
    f'https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/{env_id}/flows/{flow_id}'
    f'/triggers/{TRIGGER}/listCallbackUrl?api-version=2016-11-01',
    headers={'Authorization': 'Bearer ' + get_token('https://service.flow.microsoft.com//.default')}, timeout=60)
if not callback.ok:
    raise SystemExit(f'listCallbackUrl failed: HTTP {callback.status_code}')
url = callback.json()['response']['value']

token = env_value('chp_MondayAPIToken')
if not token:
    raise SystemExit('chp_MondayAPIToken has no value')


def gql(query, variables):
    answer = requests.post(env_value('chp_MondayApiUrl'), json={'query': query, 'variables': variables}, timeout=60,
                           headers={'Authorization': token, 'API-Version': '2026-10', 'Content-Type': 'application/json'}).json()
    if answer.get('errors') or answer.get('error_message'):
        # monday errors can echo inputs; print only their messages.
        raise SystemExit('monday: ' + '; '.join(e.get('message', '') for e in answer.get('errors', [])) + (answer.get('error_message') or ''))
    return answer['data']


for schema, columns in (('chp_MondayRequestsBoardId', 'chp_MondayRequestsColumns'),
                        ('chp_MondayComplaintsBoardId', 'chp_MondayComplaintsColumns')):
    board = env_value(schema)
    config = {'columnId': json.loads(env_value(columns))['status']['id']}
    hooks = gql('query ($b: ID!) { webhooks(board_id: $b) { id event config } }', {'b': board})['webhooks']
    # The URL is not returned by monday, so an existing hook of this event on the status column is taken as ours;
    # delete it in monday to re-register.
    # monday returns config as a Ruby-style hash ('{"columnId" => "status"}'), not JSON, so match the quoted id.
    mine = [h for h in hooks if h['event'] == EVENT and f'"{config["columnId"]}"' in (h.get('config') or '')]
    if mine:
        print(f'= {schema} {board}: webhook {mine[0]["id"]} already registered')
        continue
    created = gql('mutation ($b: ID!, $u: String!, $c: JSON!) '
                  '{ create_webhook(board_id: $b, url: $u, event: change_specific_column_value, config: $c) { id } }',
                  {'b': board, 'u': url, 'c': json.dumps(config)})['create_webhook']
    print(f'+ {schema} {board}: webhook {created["id"]} on column {config["columnId"]}')
