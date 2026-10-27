"""Read-only BC DEV probe of the Sales Order APIs for S2 sub-project B (Orders). Dev only.

Prints the API's entity sets, each order/line field's fill count, and values only for status/type/flag/date-like
fields (never names, addresses or amounts). Never prints the BC secret or token.
Usage (from the repo root): python scripts/dataverse/bc_probe_orders.py [customer no.] ["APO Cement"]  (company defaults to Solid Cement)
"""
import re
import sys
from collections import Counter

import requests

from dv import Dataverse

ENUM = re.compile(r'status|type|method|ship|invoic|archiv|blanket|trip|release|prepay|document|date', re.I)

dv = Dataverse()


def env(schema):
    row = dv.get(f"environmentvariabledefinitions?$select=defaultvalue&$filter=schemaname eq '{schema}'"
                 "&$expand=environmentvariabledefinition_environmentvariablevalue($select=value)")['value'][0]
    values = row['environmentvariabledefinition_environmentvariablevalue']
    return (values[0]['value'] if values else row['defaultvalue'] or '').strip()


tenant = env('chp_BCTenantId')
token = requests.post(f'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token', data={
    'grant_type': 'client_credentials', 'client_id': env('chp_BCClientId'),
    'client_secret': env('chp_BCClientSecret'), 'scope': 'https://api.businesscentral.dynamics.com/.default'}, timeout=30)
if not token.ok:
    raise SystemExit(f'token request failed: {token.status_code}')
headers = {'Authorization': 'Bearer ' + token.json()['access_token'], 'Accept': 'application/json'}
api = f"https://api.businesscentral.dynamics.com/v2.0/{tenant}/{env('chp_BCEnvironmentName')}{env('chp_BCApiBasePath')}"
company = sys.argv[2] if len(sys.argv) > 2 else 'Solid Cement'
root = f"{api}/companies({dv.get(f"chp_bccompanies?$select=chp_bccompanyguid&$filter=chp_name eq '{company}'")['value'][0]['chp_bccompanyguid']})/"


def get(url, params=None):
    r = requests.get(url, params=params, headers=headers, timeout=60)
    return r.status_code, (r.json() if r.ok else r.text[:300])


def fields(entity, rows):
    print(f'\n== {entity}: {len(rows)} row(s) sampled')
    for key in (rows[0].keys() if rows else []):
        if key.startswith('@odata'):
            continue
        vals = [row.get(key) for row in rows]
        filled = sum(1 for v in vals if v not in (None, '', '0001-01-01'))
        show = ''
        if isinstance(vals[0], bool) or ENUM.search(key):
            distinct = sorted({str(v) for v in vals})
            show = f'  values {distinct[:8]}' + (' …' if len(distinct) > 8 else '')
        print(f'  {key}: {filled}/{len(rows)}{show}')


status, doc = get(root.rstrip('/').rsplit('/companies', 1)[0] + '/')
names = [e['name'] for e in doc.get('value', [])] if status == 200 else []
print('entity sets:', names or f'{status} {doc}')

status, body = get(root + 'mcrmSalesOrders', {'$top': '50'})
orders = body.get('value', []) if status == 200 else []
print('\nmcrmSalesOrders ->', status if status != 200 else 'ok')
fields('mcrmSalesOrders', orders)
cust_key = next((k for k in (orders[0].keys() if orders else []) if re.search(r'sell.?to.?customer.?no|customer.?no', k, re.I)), None)
if cust_key:
    print(f'\ncustomer field: {cust_key}; orders per customer (sample of 50):', Counter(o[cust_key] for o in orders).most_common(8))
    if len(sys.argv) > 1:
        s, b = get(root + 'mcrmSalesOrders', {'$filter': f"{cust_key} eq '{sys.argv[1]}'", '$top': '50'})
        print(f'orders for {sys.argv[1]}:', len(b.get('value', [])) if s == 200 else f'{s} {b}')

for lines in [n for n in names if re.search(r'line', n, re.I) and re.search(r'sales', n, re.I)] or ['mcrmSalesOrderLines']:
    s, b = get(root + lines, {'$top': '30'})
    print(f'\n{lines} ->', s if s != 200 else 'ok')
    if s == 200:
        fields(lines, b.get('value', []))
for other in [n for n in names if re.search(r'^(?!.*vendor).*(archiv|blanket|salesorderstatus|ordercount)', n, re.I)]:
    s, b = get(root + other, {'$top': '20'})
    print(f'\n{other} ->', s if s != 200 else 'ok')
    if s == 200:
        fields(other, b.get('value', []))
