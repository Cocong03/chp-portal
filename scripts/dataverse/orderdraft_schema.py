"""S3-12 Order Draft table in ConcreatHub. Idempotent. Dev only.

Personal New Order drafts: the drafts Server Logic sets contact and account from the session; never sent to BC.
Usage (from the repo root): python scripts/dataverse/orderdraft_schema.py
"""
from dv import label, required
from identity_schema import dv, ensure_attribute, ensure_lookup, ensure_table, text

print('Order Draft')
ensure_table('chp_OrderDraft', 'Order Draft', 'Order Drafts',
             'Personal New Order drafts (S3-12). Never sent to BC.',
             text('chp_Name', 'Name', 100, is_required=True, primary=True))
ensure_lookup('chp_orderdraft', 'chp_Contact', 'Contact', 'contact', 'chp_contact_chp_orderdraft', True, 'Cascade')
ensure_lookup('chp_orderdraft', 'chp_Account', 'Account', 'account', 'chp_account_chp_orderdraft', True, 'Restrict')  # one parental (cascade) relationship per table: contact has it
ensure_attribute('chp_orderdraft', {
    '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata', 'SchemaName': 'chp_Payload',
    'DisplayName': label('Payload'), 'RequiredLevel': required(False), 'MaxLength': 100000})

print('Publishing')
dv.post('PublishXml', {'ParameterXml': '<importexportxml><entities><entity>chp_orderdraft</entity></entities></importexportxml>'})
print('Done.')
