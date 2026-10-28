"""S4-01 / S4-02 Requests and Complaints schema, monday.com env vars and taxonomy seed, in ConcreatHubRequests.
Idempotent: existing parts are skipped. Runs ONLY against org1945492c (the Requests/Complaints dev environment).

Usage (from the repo root; .env holds DATAVERSE_URL=https://org1945492c.crm.dynamics.com and
TENANT_ID=5a4137bf-7862-4197-9431-fd17f2b264d9):
    CHP_SOLUTION=ConcreatHubRequests python scripts/dataverse/requests_schema.py

chp_MondayAPIToken is created by hand (Reco, in ConcreatHub): this script only adds that definition to the
solution and never reads, sets or prints its value.
"""
import json
import os
from urllib.parse import quote
from pathlib import Path

from dv import SOLUTION, label, load_env, odata_literal, required  # dv puts scripts/ on sys.path

load_env()
assert 'org1945492c' in os.environ.get('DATAVERSE_URL', ''), 'DATAVERSE_URL must be https://org1945492c.crm.dynamics.com'
assert os.environ.get('CHP_SOLUTION') == 'ConcreatHubRequests', 'set CHP_SOLUTION=ConcreatHubRequests'

from identity_schema import choice, dv, ensure_attribute, ensure_lookup, ensure_table, text  # noqa: E402

STRING = 100000000  # environmentvariabledefinition.type: String
TAXONOMY = Path(__file__).resolve().parents[2] / 'src' / 'mocks' / 'serviceTaxonomy.json'

STATUS = [(775000000, 'Submitted'), (775000001, 'In Review'), (775000002, 'Resolved')]
SYNC = [(775000000, 'Pending'), (775000001, 'Sent'), (775000002, 'Failed')]
CONTACT_METHOD = [(775000000, 'Email'), (775000001, 'Mobile')]


def memo(schema, display, max_length):
    return {'@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata', 'SchemaName': schema,
            'DisplayName': label(display), 'RequiredLevel': required(False), 'MaxLength': max_length}


def date_only(schema, display):
    return {'@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata', 'SchemaName': schema,
            'DisplayName': label(display), 'RequiredLevel': required(False), 'Format': 'DateOnly'}


def boolean(schema, display, default):
    return {'@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata', 'SchemaName': schema,
            'DisplayName': label(display), 'RequiredLevel': required(False), 'DefaultValue': default,
            'OptionSet': {'TrueOption': {'Value': 1, 'Label': label('Yes')}, 'FalseOption': {'Value': 0, 'Label': label('No')}}}


def whole(schema, display, max_value=2147483647):
    return {'@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata', 'SchemaName': schema,
            'DisplayName': label(display), 'RequiredLevel': required(False), 'Format': 'None',
            'MinValue': 0, 'MaxValue': max_value}


def autonumber_primary(fmt):
    attr = text('chp_Reference', 'Reference', 20, is_required=True, primary=True)
    attr['AutoNumberFormat'] = fmt
    return attr


def ensure_solution():
    if dv.get(f"solutions?$select=uniquename&$filter=uniquename eq '{SOLUTION}'")['value']:
        print(f'  = solution {SOLUTION} exists')
        return
    pub = dv.get("publishers?$select=publisherid&$filter=customizationprefix eq 'chp'")['value']
    assert pub, 'publisher with prefix chp not found'
    dv.session.headers.pop('MSCRM.SolutionUniqueName')  # the header names a solution that doesn't exist yet
    dv.post('solutions', {'uniquename': SOLUTION, 'friendlyname': 'Concreat Hub Requests', 'version': '1.0.0.0',
                          'publisherid@odata.bind': f"/publishers({pub[0]['publisherid']})"})
    dv.session.headers['MSCRM.SolutionUniqueName'] = SOLUTION
    print(f'  + solution {SOLUTION}')


def shared_columns(table):
    """Contact, status, sync and attachment columns both submission tables carry."""
    for a in (text('chp_ContactValue', 'Contact value', 200), text('chp_ContactPerson', 'Contact person', 200),
              choice('chp_ContactMethod', 'Contact method', CONTACT_METHOD),
              choice('chp_Status', 'Status', STATUS, default=775000000),
              choice('chp_SyncState', 'Sync state', SYNC, default=775000000),
              memo('chp_SyncError', 'Sync error', 2000), whole('chp_SyncAttempts', 'Sync attempts'),
              text('chp_AttachmentName', 'Attachment name', 260), text('chp_MondayItemId', 'monday item ID', 50),
              date_only('chp_DateResolved', 'Date resolved')):
        ensure_attribute(table, a)


def submission_table(schema, display, plural, number_format):
    logical = schema.lower()
    ensure_table(schema, display, plural, f'{display} submitted from the portal (S4-01). Synced to monday.com.',
                 autonumber_primary(number_format), has_notes=True)
    ensure_lookup(logical, 'chp_Account', 'Account', 'account', f'chp_account_{logical}', True, 'Cascade')
    ensure_lookup(logical, 'chp_Contact', 'Contact', 'contact', f'chp_contact_{logical}', False, 'RemoveLink')
    return logical


def taxonomy_table(schema, display, plural):
    logical = schema.lower()
    ensure_table(schema, display, plural, f'{display} taxonomy (S4-02), seeded from the wireframe.',
                 text('chp_Name', 'Name', 200, is_required=True, primary=True))
    for a in (text('chp_Category', 'Category', 200), text('chp_AssignedGroup', 'Assigned group', 200),
              boolean('chp_Active', 'Active', True), whole('chp_SortOrder', 'Sort order', 100000)):
        ensure_attribute(logical, a)
    return logical


def schema_tables():
    print('Request')
    t = submission_table('chp_Request', 'Request', 'Requests', 'RQ-{SEQNUM:5}')
    for a in (text('chp_Category', 'Category', 200), text('chp_RequestType', 'Request type', 200),
              text('chp_AssignedGroup', 'Assigned group', 200), memo('chp_Details', 'Details', 4000),
              memo('chp_AdditionalInfo', 'Additional info', 4000), memo('chp_Fields', 'Fields (JSON)', 10000)):
        ensure_attribute(t, a)
    shared_columns(t)

    print('Complaint')
    t = submission_table('chp_Complaint', 'Complaint', 'Complaints', 'CMP-{SEQNUM:5}')
    for a in (text('chp_Category', 'Category', 200), text('chp_ComplaintType', 'Complaint type', 200),
              text('chp_AssignedGroup', 'Assigned group', 200), date_only('chp_IncidentDate', 'Incident date'),
              text('chp_SiteCode', 'Site code', 20), text('chp_SiteLabel', 'Site', 300),
              text('chp_RelatedOrder', 'Related order', 20), text('chp_Subject', 'Subject', 200),
              memo('chp_Description', 'Description', 4000), boolean('chp_Consent', 'Consent', False),
              memo('chp_Resolution', 'Resolution', 4000)):
        ensure_attribute(t, a)
    shared_columns(t)

    print('Request type')
    t = taxonomy_table('chp_RequestType', 'Request Type', 'Request Types')
    ensure_attribute(t, memo('chp_FieldConfig', 'Field config (JSON)', 2000))
    print('Complaint type')
    taxonomy_table('chp_ComplaintType', 'Complaint Type', 'Complaint Types')

    print('Publishing')
    dv.post('PublishXml', {'ParameterXml': '<importexportxml><entities>' + ''.join(
        f'<entity>{e}</entity>' for e in ('chp_request', 'chp_complaint', 'chp_requesttype', 'chp_complainttype'))
        + '</entities></importexportxml>'})


def definition_id(schema):
    rows = dv.get(f"environmentvariabledefinitions?$select=environmentvariabledefinitionid&$filter=schemaname eq '{schema}'")['value']
    return rows[0]['environmentvariabledefinitionid'] if rows else None


def ensure_in_solution(def_id):
    """Adds an existing env var definition to the solution (it also stays in ConcreatHub)."""
    if dv.get(f"solutioncomponents?$select=solutioncomponentid&$filter=objectid eq {def_id} and componenttype eq 380"
              f" and _solutionid_value eq {solution_id()}")['value']:
        print('    = in solution')
        return
    dv.post('AddSolutionComponent', {'ComponentId': def_id, 'ComponentType': 380, 'SolutionUniqueName': SOLUTION,
                                     'AddRequiredComponents': False})
    print('    + added to solution')


def solution_id():
    return dv.get(f"solutions?$select=solutionid&$filter=uniquename eq '{SOLUTION}'")['value'][0]['solutionid']


def env_vars():
    print('Environment variables')
    # The token is created by hand and never by this script; only add its definition to the solution.
    token_id = definition_id('chp_MondayAPIToken')
    if not token_id:
        raise SystemExit('chp_MondayAPIToken is missing — create it in the maker portal first')
    print('  = chp_MondayAPIToken exists')
    ensure_in_solution(token_id)
    for schema, display, value in (
            ('chp_MondayApiUrl', 'monday.com API URL', 'https://api.monday.com/v2'),
            ('chp_MondayRequestsBoardId', 'monday.com Requests board ID', '18435036978'),
            ('chp_MondayComplaintsBoardId', 'monday.com Complaints board ID', '18435203449'),
            ('chp_MondayRequestsColumns', 'monday.com Requests column map (JSON)', '{}'),
            ('chp_MondayComplaintsColumns', 'monday.com Complaints column map (JSON)', '{}')):
        def_id = definition_id(schema)
        if def_id:
            print(f'  = {schema} exists')
        else:
            dv.post('environmentvariabledefinitions', {'schemaname': schema, 'displayname': display, 'type': STRING})
            def_id = definition_id(schema)
            print(f'  + {schema}')
        rows = dv.get("environmentvariablevalues?$select=environmentvariablevalueid"
                      f"&$filter=_environmentvariabledefinitionid_value eq {def_id}")['value']
        if rows:
            print(f'  = {schema} value exists')  # kept as is: the columns spike may have filled the JSON maps
        else:
            dv.post('environmentvariablevalues', {'schemaname': schema, 'value': value,
                                                  'EnvironmentVariableDefinitionId@odata.bind': f'/environmentvariabledefinitions({def_id})'})
            print(f'  + {schema} value')


def seed(table, plural, name, category, group, sort, field_config=None, active=True):
    body = {'chp_name': name, 'chp_category': category, 'chp_assignedgroup': group, 'chp_active': active, 'chp_sortorder': sort}
    if field_config is not None:
        body['chp_fieldconfig'] = json.dumps(field_config, separators=(',', ':'))
    flt = f"chp_category eq '{odata_literal(category)}' and chp_name eq '{odata_literal(name)}'"
    rows = dv.get(f"{plural}?$filter={quote(flt)}")['value']
    if not rows:
        dv.post(plural, body)
        print(f'  + {table} {category} / {name}')
        return
    if all(rows[0].get(k) == v for k, v in body.items()):
        print(f'  = {table} {category} / {name}')
        return
    dv.patch(f"{plural}({rows[0][table + 'id']})", body)
    print(f'  ~ {table} {category} / {name}')


def seed_taxonomy():
    print('Taxonomy rows')
    data = json.loads(TAXONOMY.read_text(encoding='utf-8'))
    n = 0
    for cat in data['requests']:
        for t in cat['types']:
            seed('chp_requesttype', 'chp_requesttypes', t['type'], cat['category'], t['group'], n, cat['fields'], cat['active'])
            n += 1
    n = 0
    for cat in data['complaints']:
        for t in cat['types']:
            seed('chp_complainttype', 'chp_complainttypes', t['type'], cat['category'], t['group'], n)
            n += 1


def main():
    print(f'Solution {SOLUTION}')
    ensure_solution()
    schema_tables()
    env_vars()
    seed_taxonomy()
    print('Done.')


if __name__ == '__main__':
    main()
