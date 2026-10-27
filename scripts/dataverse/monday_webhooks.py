"""Register the monday.com webhooks that call the status webhook flow (S4-07, real-time status). Dev only. Idempotent.
Runs ONLY against org1945492c, after `requests_flows.py --only WEBHOOK` has created the flow.

The flow's trigger URL carries its own signature, so it is a secret like the token: both are read in memory and never
printed. Each board gets one `change_column_value` webhook; the flow re-reads the item, so only real status reaches Dataverse.

Usage (from the repo root; .env or the shell holds DATAVERSE_URL=https://org1945492c.crm.dynamics.com):
    CHP_SOLUTION=ConcreatHubRequests python scripts/dataverse/monday_webhooks.py
"""
import os
import sys

import requests

sys.path.insert(0, os.path.dirname(__file__))
from dv import SOLUTION, Dataverse, load_env  # noqa: E402

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from auth import get_token  # noqa: E402

load_env()
assert 'org1945492c' in os.environ.get('DATAVERSE_URL', ''), 'DATAVERSE_URL must be https://org1945492c.crm.dynamics.com'
assert SOLUTION == 'ConcreatHubRequests', 'set CHP_SOLUTION=ConcreatHubRequests'

WEBHOOK_FLOW = 'Concreat Connect – Service center status webhook'  # as named in requests_flows.py
TRIGGER = 'monday_webhook'
EVENT = 'change_column_value'
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


for schema in ('chp_MondayRequestsBoardId', 'chp_MondayComplaintsBoardId'):
    board = env_value(schema)
    hooks = gql('query ($b: ID!) { webhooks(board_id: $b) { id event config } }', {'b': board})['webhooks']
    # The URL is not returned by monday, so an existing hook of this event is taken as ours; delete it in monday to re-register.
    mine = [h for h in hooks if h['event'] == EVENT]
    if mine:
        print(f'= {schema} {board}: webhook {mine[0]["id"]} already registered')
        continue
    created = gql('mutation ($b: ID!, $u: String!) { create_webhook(board_id: $b, url: $u, event: change_column_value) { id } }',
                  {'b': board, 'u': url})['create_webhook']
    print(f'+ {schema} {board}: webhook {created["id"]}')
