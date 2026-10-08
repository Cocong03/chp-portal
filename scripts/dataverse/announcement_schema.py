"""S2-14 Dashboard announcement table in ConcreatHub. Idempotent. Dev only.

The newest row with Active = Yes is shown on the Dashboard; no active row means no banner.
Usage (from the repo root): python scripts/dataverse/announcement_schema.py
"""
from dv import label, required
from identity_schema import dv, ensure_attribute, ensure_table, text

print('Announcement')
ensure_table('chp_Announcement', 'Announcement', 'Announcements',
             'Dashboard banner (S2-14). The newest active row is shown to every signed-in customer.',
             text('chp_Title', 'Title', 200, is_required=True, primary=True))
ensure_attribute('chp_announcement', {
    '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata', 'SchemaName': 'chp_Message',
    'DisplayName': label('Message'), 'RequiredLevel': required(False), 'MaxLength': 2000})
ensure_attribute('chp_announcement', {
    '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata', 'SchemaName': 'chp_Active',
    'DisplayName': label('Active'), 'RequiredLevel': required(False), 'DefaultValue': False,
    'OptionSet': {'@odata.type': 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata',
                  'TrueOption': {'Value': 1, 'Label': label('Yes')},
                  'FalseOption': {'Value': 0, 'Label': label('No')}}})

print('Publishing')
dv.post('PublishXml', {'ParameterXml': '<importexportxml><entities><entity>chp_announcement</entity></entities></importexportxml>'})
print('Done.')
