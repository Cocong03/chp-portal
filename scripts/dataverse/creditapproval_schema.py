"""S3-04 Credit Approval table in ConcreatHub. Idempotent. Dev only.

Credit orders held for the credit team; sent to BC only when approved. Server Logic sets contact and account from the session.
Usage (from the repo root): python scripts/dataverse/creditapproval_schema.py
"""
from dv import label, required
from identity_schema import choice, dv, ensure_attribute, ensure_lookup, ensure_table, text

T = 'chp_creditapproval'


def memo(schema, display, max_length):
    return {'@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata', 'SchemaName': schema,
            'DisplayName': label(display), 'RequiredLevel': required(False), 'MaxLength': max_length}


def money(schema, display):
    return {'@odata.type': 'Microsoft.Dynamics.CRM.DecimalAttributeMetadata', 'SchemaName': schema,
            'DisplayName': label(display), 'RequiredLevel': required(False),
            'Precision': 2, 'MinValue': -100000000000, 'MaxValue': 100000000000}


print('Credit Approval')
ensure_table('chp_CreditApproval', 'Credit Approval', 'Credit Approvals',
             'Credit orders held for the credit team (S3-04). Sent to BC only when approved.',
             text('chp_Name', 'Name', 100, is_required=True, primary=True))
ensure_lookup(T, 'chp_Account', 'Account', 'account', 'chp_account_chp_creditapproval', True, 'Cascade')
ensure_lookup(T, 'chp_Contact', 'Contact', 'contact', 'chp_contact_chp_creditapproval', True, 'Restrict')
ensure_attribute(T, choice('chp_Status', 'Status', [
    (775000000, 'Awaiting credit approval'), (775000001, 'Approved'), (775000002, 'Declined')],
    default=775000000, is_required=True))
for schema, display, length in [('chp_Reason', 'Reason', 200), ('chp_PORef', 'PO reference', 35), ('chp_Site', 'Site', 20),
                                ('chp_SalesOrderNo', 'Sales order no.', 20), ('chp_ApproverName', 'Approver name', 200),
                                ('chp_ApproverEmail', 'Approver email', 200)]:
    ensure_attribute(T, text(schema, display, length))
ensure_attribute(T, memo('chp_Payload', 'Payload', 100000))
ensure_attribute(T, memo('chp_Comment', 'Comment', 4000))
for schema, display in [('chp_EstimatedTotal', 'Estimated total'), ('chp_AvailableCredit', 'Available credit'),
                        ('chp_OverdueAmount', 'Overdue amount')]:
    ensure_attribute(T, money(schema, display))
ensure_attribute(T, {
    '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata', 'SchemaName': 'chp_DecidedOn',
    'DisplayName': label('Decided on'), 'RequiredLevel': required(False), 'Format': 'DateAndTime'})

print('Publishing')
dv.post('PublishXml', {'ParameterXml': f'<importexportxml><entities><entity>{T}</entity></entities></importexportxml>'})
print('Done.')
