"""S1-02 / S1-13 schema in the ConcreatHub solution. Idempotent: existing parts are skipped. Dev only.

Usage (from the repo root): python scripts/dataverse/identity_schema.py
"""
from dv import Dataverse, label, required

dv = Dataverse()


def text(schema, display, max_length, is_required=False, primary=False):
    attr = {'@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata', 'SchemaName': schema,
            'DisplayName': label(display), 'RequiredLevel': required(is_required),
            'MaxLength': max_length, 'FormatName': {'Value': 'Text'}}
    if primary:
        attr['IsPrimaryName'] = True
    return attr


def choice(schema, display, options, default=None, is_required=False):
    attr = {'@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata', 'SchemaName': schema,
            'DisplayName': label(display), 'RequiredLevel': required(is_required),
            'OptionSet': {'@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata', 'IsGlobal': False,
                          'OptionSetType': 'Picklist',
                          'Options': [{'Value': v, 'Label': label(t)} for v, t in options]}}
    if default is not None:
        attr['DefaultFormValue'] = default
    return attr


def ensure_attribute(table, attr):
    logical = attr['SchemaName'].lower()
    if dv.get(f"EntityDefinitions(LogicalName='{table}')/Attributes(LogicalName='{logical}')?$select=LogicalName"):
        print(f'  = {table}.{logical} exists')
        return
    dv.post(f"EntityDefinitions(LogicalName='{table}')/Attributes", attr)
    print(f'  + {table}.{logical}')


def ensure_table(schema, display, plural, description, primary):
    logical = schema.lower()
    if dv.get(f"EntityDefinitions(LogicalName='{logical}')?$select=LogicalName"):
        print(f'  = table {logical} exists')
        return
    dv.post('EntityDefinitions', {
        '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata', 'SchemaName': schema,
        'DisplayName': label(display), 'DisplayCollectionName': label(plural), 'Description': label(description),
        'OwnershipType': 'OrganizationOwned', 'IsActivity': False, 'HasActivities': False, 'HasNotes': False,
        'Attributes': [primary],
    })
    print(f'  + table {logical}')


def ensure_lookup(referencing, lookup_schema, display, referenced, relationship, is_required, cascade_delete):
    if dv.get(f"RelationshipDefinitions(SchemaName='{relationship}')?$select=SchemaName"):
        print(f'  = relationship {relationship} exists')
        return
    dv.post('RelationshipDefinitions', {
        '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata', 'SchemaName': relationship,
        'ReferencedEntity': referenced, 'ReferencingEntity': referencing,
        'CascadeConfiguration': {'Assign': 'NoCascade', 'Share': 'NoCascade', 'Unshare': 'NoCascade',
                                 'Reparent': 'NoCascade', 'Delete': cascade_delete, 'Merge': 'NoCascade'},
        'Lookup': {'@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata', 'SchemaName': lookup_schema,
                   'DisplayName': label(display), 'RequiredLevel': required(is_required)},
    })
    print(f'  + lookup {referencing}.{lookup_schema.lower()} ({relationship})')


def ensure_key(table, schema, display, columns):
    existing = dv.get(f"EntityDefinitions(LogicalName='{table}')/Keys?$select=SchemaName")
    if any(k['SchemaName'].lower() == schema.lower() for k in existing['value']):
        print(f'  = key {schema} exists')
        return
    dv.post(f"EntityDefinitions(LogicalName='{table}')/Keys", {
        'SchemaName': schema, 'DisplayName': label(display), 'KeyAttributes': columns})
    print(f'  + key {schema} on {table}({", ".join(columns)})')


print('Account columns')
ensure_attribute('account', text('chp_BCCustomerNo', 'BC Customer No.', 20))
ensure_attribute('account', text('chp_BCCompanyId', 'BC Company ID', 36))
ensure_attribute('account', text('chp_BCCompanyName', 'BC Company', 100))
ensure_key('account', 'chp_bccustomer', 'BC customer', ['chp_bccustomerno', 'chp_bccompanyid'])

print('Account Link')
ensure_table('chp_AccountLink', 'Account Link', 'Account Links',
             'Contact ↔ Account links (one per contact for Nov 15; Phase 2 switcher adds more).',
             text('chp_Name', 'Name', 200, is_required=True, primary=True))
ensure_lookup('chp_accountlink', 'chp_Contact', 'Contact', 'contact', 'chp_contact_chp_accountlink', True, 'Cascade')
ensure_lookup('chp_accountlink', 'chp_Account', 'Account', 'account', 'chp_account_chp_accountlink', True, 'Restrict')  # one parental (cascade) relationship per table: contact has it
ensure_key('chp_accountlink', 'chp_contact_account', 'Contact and account', ['chp_contact', 'chp_account'])

print('Access Grant')
ensure_table('chp_AccessGrant', 'Access Grant', 'Access Grants',
             'Pre-granted portal roles by email (S1-13). Applied by the "Concreat Connect – Apply access grant" flow.',
             text('chp_Email', 'Email', 100, is_required=True, primary=True))
ensure_attribute('chp_accessgrant', text('chp_BCCustomerNo', 'BC Customer No.', 20, is_required=True))
ensure_attribute('chp_accessgrant', choice('chp_WebRole', 'Role', [
    (775000000, 'Full Access'), (775000001, 'Orders & Delivery'),
    (775000002, 'Finance & Documents'), (775000003, 'View Only')], is_required=True))
ensure_attribute('chp_accessgrant', choice('chp_Status', 'Status', [
    (775000000, 'Pending'), (775000001, 'Applied'),
    (775000002, 'Customer mismatch'), (775000003, 'Duplicate email')], default=775000000))
ensure_attribute('chp_accessgrant', {
    '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata', 'SchemaName': 'chp_AppliedOn',
    'DisplayName': label('Applied on'), 'RequiredLevel': required(False), 'Format': 'DateAndTime'})
ensure_attribute('chp_accessgrant', {
    '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata', 'SchemaName': 'chp_Note',
    'DisplayName': label('Note'), 'RequiredLevel': required(False), 'MaxLength': 2000})
ensure_lookup('chp_accessgrant', 'chp_Contact', 'Applied to contact', 'contact', 'chp_contact_chp_accessgrant', False, 'RemoveLink')

print('Publishing')
dv.post('PublishXml', {'ParameterXml': '<importexportxml><entities><entity>account</entity>'
                                        '<entity>chp_accountlink</entity><entity>chp_accessgrant</entity>'
                                        '</entities></importexportxml>'})
print('Done.')
