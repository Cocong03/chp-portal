"""Create or update the solution-aware 'Concreat Connect – Apply access grant' flow in ConcreatHub (S1-13). Dev only.

Definition: grant_flow.json (next to this file). Idempotent.
Usage (from the repo root): python scripts/dataverse/grant_flow.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from dv import Dataverse  # noqa: E402  (sets MSCRM.SolutionUniqueName: ConcreatHub)

NAME = 'Concreat Connect – Apply access grant'
REF = 'chp_dataverse'
CONNECTION = 'shared-commondataser-95e3979e'
API = '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps'

dv = Dataverse()

refs = dv.get(f"connectionreferences?$select=connectionreferenceid&$filter=connectionreferencelogicalname eq '{REF}'")['value']
if refs:
    print(f'= connection reference {REF} exists')
else:
    dv.post('connectionreferences', {'connectionreferencelogicalname': REF,
                                     'connectionreferencedisplayname': 'Concreat Hub – Dataverse',
                                     'connectorid': API, 'connectionid': CONNECTION})
    print(f'+ connection reference {REF}')

definition = json.load(open(os.path.join(os.path.dirname(__file__), 'grant_flow.json'), encoding='utf-8'))
clientdata = {'properties': {'connectionReferences': {'shared_commondataserviceforapps': {
    'runtimeSource': 'embedded', 'connection': {'connectionReferenceLogicalName': REF},
    'api': {'name': 'shared_commondataserviceforapps'}}}, 'definition': definition}, 'schemaVersion': '1.0.0.0'}

found = dv.get(f"workflows?$select=workflowid&$filter=name eq '{NAME}' and category eq 5")['value']
if found:
    wf = found[0]['workflowid']
    dv.patch(f'workflows({wf})', {'statecode': 0, 'statuscode': 1})  # a flow must be off to change its definition
    dv.patch(f'workflows({wf})', {'clientdata': json.dumps(clientdata)})
    print(f'= flow exists ({wf}), definition updated')
else:
    entity = dv.post('workflows', {'name': NAME, 'category': 5, 'type': 1, 'primaryentity': 'none',
                                   'description': 'Applies a pre-granted portal role (chp_accessgrant) to the matching contact. S1-13.',
                                   'clientdata': json.dumps(clientdata)})
    wf = entity.split('(')[-1].rstrip(')')
    print(f'+ flow {wf}')

dv.patch(f'workflows({wf})', {'statecode': 1, 'statuscode': 2})
print('= flow turned on')
print(dv.get(f'workflows({wf})?$select=statecode,statuscode,solutionid'))
in_sol = dv.get(f"solutioncomponents?$select=objectid&$filter=objectid eq {wf} and _solutionid_value eq ed4d4ea0-74bd-f111-aaad-7ced8dfe9114")['value']
print('in ConcreatHub:', bool(in_sol))
