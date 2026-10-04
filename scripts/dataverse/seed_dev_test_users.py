"""Dev test data for sub-project B: 1 Account, 5 Contacts, Account Links, web roles, single-use invitations.
Idempotent: re-running reuses rows and only issues a new invitation when the old one is used or expired.

Usage (from the repo root): python scripts/dataverse/seed_dev_test_users.py
"""
import secrets
from datetime import datetime, timedelta, timezone

from dv import Dataverse, odata_literal

SITE_ID = 'f44e98b4-3da3-4f8d-8f79-fbb244454741'
SITE_URL = 'https://chp-portal-dev.powerappsportals.com'
# Real BC DEV customer (its contacts use the developer's own address). 10482 was the wireframe sample.
CUSTOMER = {'no': 'C00000009', 'name': 'BESTRADE COMMODITY SALES CORP.', 'company': 'Solid Cement'}
RETIRED_TEST_CUSTOMERS = ['10482']
USERS = [
    ('full@example.com', 'Test Full Access', 'Full Access'),
    ('orders@example.com', 'Test Orders', 'Orders & Delivery'),
    ('finance@example.com', 'Test Finance', 'Finance & Documents'),
    ('viewonly@example.com', 'Test View Only', 'View Only'),
    ('norole@example.com', 'Test No Role', None),
]

dv = Dataverse()

# BC company id comes from the environment variable, never hardcoded.
definition = dv.get("environmentvariabledefinitions?$select=defaultvalue&$filter=schemaname eq 'chp_BCSolidCementCompanyId'"
                    "&$expand=environmentvariabledefinition_environmentvariablevalue($select=value)")['value'][0]
values = definition['environmentvariabledefinition_environmentvariablevalue']
company_id = values[0]['value'] if values else definition['defaultvalue']

roles = {r['mspp_name']: r['mspp_webroleid'] for r in dv.get(
    f"mspp_webroles?$select=mspp_name&$filter=_mspp_websiteid_value eq {SITE_ID}")['value']}
missing = {r for _, _, r in USERS if r} - roles.keys()
if missing:
    raise SystemExit(f'Web roles not deployed yet: {sorted(missing)} — run Task 7 first.')

# Account: upsert through the alternate key so it exists exactly once.
key = f"chp_bccustomerno='{CUSTOMER['no']}',chp_bccompanyid='{odata_literal(company_id)}'"
dv.patch(f'accounts({key})', {'name': CUSTOMER['name'], 'chp_bccompanyname': CUSTOMER['company']})
account_id = dv.get(f'accounts({key})?$select=accountid')['accountid']
print(f"Account {CUSTOMER['no']} · {CUSTOMER['name']} ({account_id})")

# Retire earlier test accounts: drop their links, deactivate them (chp_accountlink → account is Restrict on delete).
for old_no in RETIRED_TEST_CUSTOMERS:
    for old in dv.get(f"accounts?$select=accountid&$filter=chp_bccustomerno eq '{odata_literal(old_no)}' and statecode eq 0")['value']:
        for link in dv.get(f"chp_accountlinks?$select=chp_accountlinkid&$filter=_chp_account_value eq {old['accountid']}")['value']:
            dv.session.delete(dv.base + f"chp_accountlinks({link['chp_accountlinkid']})").raise_for_status()
        dv.patch(f"accounts({old['accountid']})", {'statecode': 1, 'statuscode': 2})
        print(f"retired test account {old_no} ({old['accountid']})")

# CLAUDE.md warns of Business Required rpn_ columns on Contact from another project; send them empty only if they exist here.
legacy_required = [c for c in ('rpn_quickbooksid', 'rpn_vendordisplayname')
                   if dv.get(f"EntityDefinitions(LogicalName='contact')/Attributes(LogicalName='{c}')?$select=LogicalName")]

now = datetime.now(timezone.utc)
for email, last_name, role in USERS:
    found = dv.get(f"contacts?$select=contactid&$filter=emailaddress1 eq '{odata_literal(email)}'")['value']
    if len(found) > 1:
        raise SystemExit(f'{email} is on {len(found)} contacts — fix before continuing (Power Pages blocks duplicate emails).')
    body = {'lastname': last_name, 'emailaddress1': email, 'parentcustomerid_account@odata.bind': f'/accounts({account_id})',
            **{c: '' for c in legacy_required}}
    if found:
        contact_id = found[0]['contactid']
        dv.patch(f'contacts({contact_id})', {'parentcustomerid_account@odata.bind': f'/accounts({account_id})'})
    else:
        contact_id = dv.post('contacts', body).split('(')[-1].rstrip(')')

    link_filter = f'_chp_contact_value eq {contact_id} and _chp_account_value eq {account_id}'
    if not dv.get(f'chp_accountlinks?$select=chp_accountlinkid&$filter={link_filter}')['value']:
        dv.post('chp_accountlinks', {'chp_name': f"{CUSTOMER['no']} · {last_name}",
                                     'chp_Contact@odata.bind': f'/contacts({contact_id})',
                                     'chp_Account@odata.bind': f'/accounts({account_id})'})

    if role:
        current = dv.get(f'contacts({contact_id})/powerpagecomponent_mspp_webrole_contact?$select=powerpagecomponentid')['value']
        if roles[role] not in {c['powerpagecomponentid'] for c in current}:
            dv.post(f'contacts({contact_id})/powerpagecomponent_mspp_webrole_contact/$ref',
                    {'@odata.id': f"{dv.base}powerpagecomponents({roles[role]})"})

    open_invites = dv.get(
        f"adx_invitations?$select=adx_invitationcode,adx_expirydate,adx_redemptions&$filter=_adx_invitecontact_value eq {contact_id}"
        f" and (adx_redemptions eq null or adx_redemptions eq 0) and adx_expirydate gt {now.strftime('%Y-%m-%dT%H:%M:%SZ')}")['value']
    if open_invites:
        code = open_invites[0]['adx_invitationcode']
    else:
        code = secrets.token_hex(16)
        dv.post('adx_invitations', {
            'adx_name': f'Dev test invitation – {email}', 'adx_type': 756150000, 'adx_invitationcode': code,
            'adx_maximumredemptions': 1, 'adx_expirydate': (now + timedelta(days=7)).strftime('%Y-%m-%dT%H:%M:%SZ'),
            'adx_inviteContact@odata.bind': f'/contacts({contact_id})',
            'mspp_websiteid@odata.bind': f'/powerpagesites({SITE_ID})'})
    print(f"{email:24} {role or '(no role)':22} {SITE_URL}/activate/complete?code={code}")
