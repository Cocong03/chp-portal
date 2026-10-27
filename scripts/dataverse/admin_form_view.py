"""Access Grant main form + "Active Access Grants" view for Concreat Connect Admin (S1-13). Idempotent. Dev only.

Edits the Main form and default view Dataverse generated for chp_accessgrant (template-and-mutate,
per the dv-metadata skill) and publishes.

Usage (from the repo root): python scripts/dataverse/admin_form_view.py
"""
import re
import uuid

from dv import Dataverse

TABLE = 'chp_accessgrant'
TEXT = '{4273EDBD-AC1D-40d3-9FB2-095C621B552D}'
CHOICE = '{3EF39988-22BB-4f0b-BBBE-64B5A3748AEE}'
LOOKUP = '{270BD3DB-D9AF-4782-9025-509E298DEC0A}'
DATETIME = '{5B773807-9FB2-42db-97C3-7A91EFF8ADFF}'
MEMO = '{E0DECE4B-6FC8-4a8f-A065-082708572369}'

# (logical name, label, control classid, read-only)
FORM_FIELDS = [
    ('chp_email', 'Email', TEXT, False),
    ('chp_bccustomerno', 'BC Customer No.', TEXT, False),
    ('chp_webrole', 'Role', CHOICE, False),
    ('chp_status', 'Status', CHOICE, True),
    ('chp_contact', 'Applied to contact', LOOKUP, True),
    ('chp_appliedon', 'Applied on', DATETIME, True),
    ('chp_note', 'Note', MEMO, False),
]
VIEW_COLUMNS = [('chp_email', 250), ('chp_bccustomerno', 120), ('chp_webrole', 150),
                ('chp_status', 140), ('chp_appliedon', 150), ('modifiedon', 150)]

dv = Dataverse()


def row(name, text, classid, read_only):
    disabled = ' disabled="true"' if read_only else ''
    return (f'<row><cell id="{{{uuid.uuid4()}}}"><labels><label description="{text}" languagecode="1033" /></labels>'
            f'<control id="{name}" classid="{classid}" datafieldname="{name}"{disabled} /></cell></row>')


# Main form: replace the generated section's rows with ours; keep the server's envelope and ids.
form = dv.get(f"systemforms?$select=formid,formxml&$filter=objecttypecode eq '{TABLE}' and type eq 2")['value'][0]
rows = '<rows>' + ''.join(row(*field) for field in FORM_FIELDS) + '</rows>'
form_xml = re.sub(r'<rows>.*?</rows>', lambda _: rows, form['formxml'], count=1, flags=re.S)
dv.patch(f"systemforms({form['formid']})", {'formxml': form_xml})
print(f"= main form {form['formid']}: {len(FORM_FIELDS)} fields")

# Default public view: same filter (active only), our columns, newest change first.
view = dv.get(f"savedqueries?$select=savedqueryid,layoutxml&$filter=returnedtypecode eq '{TABLE}' "
              "and querytype eq 0 and name eq 'Active Access Grants'")['value'][0]
attributes = ''.join(f'<attribute name="{name}" />' for name, _ in VIEW_COLUMNS)
fetch_xml = (f'<fetch version="1.0" mapping="logical"><entity name="{TABLE}"><attribute name="{TABLE}id" />{attributes}'
             '<order attribute="modifiedon" descending="true" />'
             '<filter type="and"><condition attribute="statecode" operator="eq" value="0" /></filter></entity></fetch>')
object_code = re.search(r'object="(\d+)"', view['layoutxml']).group(1)
cells = ''.join(f'<cell name="{name}" width="{width}" />' for name, width in VIEW_COLUMNS)
layout_xml = (f'<grid name="resultset" object="{object_code}" jump="chp_email" select="1" icon="1" preview="1">'
              f'<row name="result" id="{TABLE}id">{cells}</row></grid>')
dv.patch(f"savedqueries({view['savedqueryid']})", {'fetchxml': fetch_xml, 'layoutxml': layout_xml})
print(f"= view {view['savedqueryid']}: {len(VIEW_COLUMNS)} columns, newest first")

dv.post('PublishXml', {'ParameterXml': f'<importexportxml><entities><entity>{TABLE}</entity></entities></importexportxml>'})
print('= published')
