"""Read-only BC DEV field probe for S2 sub-project A (ship-to, customer card, contacts). Dev only.

Prints field NAMES and how many sampled rows fill each one. Never prints the BC secret, the token or
personal values; only the enum-like fields in SHOW_VALUES print their values.

Usage (from the repo root): python scripts/dataverse/bc_probe.py C00000009
"""
import sys

import requests

from dv import Dataverse

SHOW_VALUES = {'type', 'linktoTable', 'customerPortalAccess', 'privacyBlocked', 'documentNo', 'code'}

dv = Dataverse()


def env(schema):
    row = dv.get(f"environmentvariabledefinitions?$select=defaultvalue&$filter=schemaname eq '{schema}'"
                 "&$expand=environmentvariabledefinition_environmentvariablevalue($select=value)")['value'][0]
    values = row['environmentvariabledefinition_environmentvariablevalue']
    return (values[0]['value'] if values else row['defaultvalue'] or '').strip()


tenant = env('chp_BCTenantId')
token_response = requests.post(f'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token', data={
    'grant_type': 'client_credentials', 'client_id': env('chp_BCClientId'),
    'client_secret': env('chp_BCClientSecret'), 'scope': 'https://api.businesscentral.dynamics.com/.default'}, timeout=30)
if not token_response.ok:
    raise SystemExit(f'token request failed: {token_response.status_code}')
headers = {'Authorization': 'Bearer ' + token_response.json()['access_token'], 'Accept': 'application/json'}
root = (f"https://api.businesscentral.dynamics.com/v2.0/{tenant}/{env('chp_BCEnvironmentName')}"
        f"{env('chp_BCApiBasePath')}/companies({env('chp_BCSolidCementCompanyId')})/")
customer = sys.argv[1]


def probe(entity, params):
    response = requests.get(root + entity, params=params, headers=headers, timeout=30)
    print(f'\n== {entity} {params} -> {response.status_code}')
    if not response.ok:
        print('  ' + response.text[:300])
        return []
    rows = response.json().get('value', [])
    print(f'  {len(rows)} row(s)')
    for key in (rows[0].keys() if rows else []):
        filled = sum(1 for row in rows if row.get(key) not in (None, ''))
        sample = f" values {sorted({str(row.get(key)) for row in rows})}" if key in SHOW_VALUES else ''
        print(f'  {key}: {filled}/{len(rows)} filled{sample}')
    return rows


probe('mcrmShipToAddress', {'$top': '5'})
probe('mcrmShipToAddress', {'$filter': f"documentNo eq '{customer}'"})  # documentNo holds the customer no.
probe('mcrmCustomers', {'$filter': f"Customer_No eq '{customer}'"})
relations = probe('mcrmBusinessRelation', {'$filter': f"vendorNo eq '{customer}' and linktoTable eq 'Customer'"})
if relations:
    company_no = relations[0]['contactNo']
    probe('MCRMContacts', {'$filter': f"companyNo eq '{company_no}'", '$top': '10'})
    probe('MCRMContacts', {'$filter': f"companyNo eq '{company_no}' and type eq 'Person'", '$top': '10'})
