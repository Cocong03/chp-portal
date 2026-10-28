"""Dev environment variables for sub-project C (S1-03 / S1-06). Idempotent. Dev only.

chp_BCClientId and chp_BCClientSecret are created EMPTY on purpose: the developer types their values in
make.powerapps.com → Solutions → ConcreatHub → Environment variables. They are never passed to this script,
never printed, never committed.

Usage (from the repo root): python scripts/dataverse/env_vars.py --sender <developer mailbox>
"""
import argparse

from dv import Dataverse

STRING = 100000000  # environmentvariabledefinition.type: String
SECRET_LIKE = {'chp_BCClientId', 'chp_BCClientSecret'}

parser = argparse.ArgumentParser()
parser.add_argument('--sender', required=True, help='mailbox that sends activation emails and ops notices (Dev)')
args = parser.parse_args()

dv = Dataverse()

# Existing definitions whose Dev value changes (BC environment renamed TRAINING → DEV, 2026-10-04).
VALUES = {
    'chp_BCEnvironmentName': 'DEV',
    'chp_SenderMailbox': args.sender,
    'chp_PowerPagesSiteId': 'f44e98b4-3da3-4f8d-8f79-fbb244454741',
    # Public PNG for emails (the private portal can't serve it to mail clients). Dev: public image host (2026-10-07).
    'chp_EmailLogoUrl': 'https://i.ibb.co/hFmK4Hd3/concreat-logo-email.png',
}
# New definitions: (schema name, display name). Values: only chp_PowerPagesSiteId above; the two BC ones by hand.
NEW = [
    ('chp_BCClientId', 'BC Client ID'),
    ('chp_BCClientSecret', 'BC Client Secret (Dev: plain text, no default; Key Vault before UAT, S1-14)'),
    ('chp_PowerPagesSiteId', 'Power Pages Site ID'),
    ('chp_EmailLogoUrl', 'Email Logo URL'),
]


def definition_id(schema):
    rows = dv.get(f"environmentvariabledefinitions?$select=environmentvariabledefinitionid&$filter=schemaname eq '{schema}'")['value']
    return rows[0]['environmentvariabledefinitionid'] if rows else None


for schema, display in NEW:
    if definition_id(schema):
        print(f'= {schema} exists')
    else:
        dv.post('environmentvariabledefinitions', {'schemaname': schema, 'displayname': display, 'type': STRING})
        print(f'+ {schema}')

for schema, value in VALUES.items():
    def_id = definition_id(schema)
    rows = dv.get(f"environmentvariablevalues?$select=environmentvariablevalueid&$filter=_environmentvariabledefinitionid_value eq {def_id}")['value']
    if rows:
        dv.patch(f"environmentvariablevalues({rows[0]['environmentvariablevalueid']})", {'value': value})
    else:
        dv.post('environmentvariablevalues', {'schemaname': schema, 'value': value,
                                              'EnvironmentVariableDefinitionId@odata.bind': f'/environmentvariabledefinitions({def_id})'})
    print(f'= {schema} = {value}')

for schema in sorted(SECRET_LIKE):
    def_id = definition_id(schema)
    rows = dv.get(f"environmentvariablevalues?$select=value&$filter=_environmentvariabledefinitionid_value eq {def_id}")['value']
    print(f"= {schema}: {'set' if rows and rows[0].get('value') else 'EMPTY — set it in the maker portal'}")
