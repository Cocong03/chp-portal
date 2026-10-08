"""Security role "Concreat Connect Admin" (S1-13) in ConcreatHub. Idempotent. Dev only.

Usage (from the repo root): python scripts/dataverse/admin_role.py
"""
from dv import SOLUTION, Dataverse

ROLE = 'Concreat Connect Admin'
# (privilege name, depth). Global = organization level.
PRIVILEGES = [
    ('prvCreatechp_accessgrant', 'Global'), ('prvReadchp_accessgrant', 'Global'),
    ('prvWritechp_accessgrant', 'Global'), ('prvDeletechp_accessgrant', 'Global'),
    ('prvAppendchp_accessgrant', 'Global'), ('prvAppendTochp_accessgrant', 'Global'),
    ('prvReadContact', 'Global'), ('prvAppendToContact', 'Global'),
    ('prvCreatechp_announcement', 'Global'), ('prvReadchp_announcement', 'Global'),
    ('prvWritechp_announcement', 'Global'), ('prvDeletechp_announcement', 'Global'),
]

dv = Dataverse()
root_bu = dv.get('businessunits?$select=businessunitid&$filter=_parentbusinessunitid_value eq null')['value'][0]['businessunitid']

existing = dv.get(f"roles?$select=roleid&$filter=name eq '{ROLE}' and _businessunitid_value eq {root_bu}")['value']
if existing:
    role_id = existing[0]['roleid']
    print(f'= role {ROLE} exists ({role_id})')
else:
    entity_id = dv.post('roles', {'name': ROLE, 'businessunitid@odata.bind': f'/businessunits({root_bu})'})
    role_id = entity_id.split('(')[-1].rstrip(')')
    print(f'+ role {ROLE} ({role_id})')

privs = []
for name, depth in PRIVILEGES:
    found = dv.get(f"privileges?$select=privilegeid&$filter=name eq '{name}'")['value']
    if not found:
        raise SystemExit(f'Privilege {name} not found — run identity_schema.py first.')
    privs.append({'PrivilegeId': found[0]['privilegeid'], 'BusinessUnitId': root_bu, 'Depth': depth})
dv.post(f'roles({role_id})/Microsoft.Dynamics.CRM.AddPrivilegesRole', {'Privileges': privs})
print(f'= {len(privs)} privileges set')

dv.post('AddSolutionComponent', {'ComponentId': role_id, 'ComponentType': 20, 'SolutionUniqueName': SOLUTION,
                                 'AddRequiredComponents': False, 'DoNotIncludeSubcomponents': False})
print(f'= role in {SOLUTION}')
