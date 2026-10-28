"""S1-12 BC Companies table + required Company on access grants, in the ConcreatHub solution. Idempotent. Dev only.

One row per BC company the portal serves; activation searches the active rows (adding a company = adding a row).
Existing grants are backfilled to Solid Cement before the Company lookup becomes required.

Usage (from the repo root): python scripts/dataverse/companies_schema.py
"""
import time

from identity_schema import dv, ensure_attribute, ensure_key, ensure_lookup, ensure_table, text

# Dev BC companies (BC environment DEV): (name written to Account chp_bccompanyname, BC company id).
COMPANIES = [
    ('Solid Cement', 'd2e4496e-be79-f111-8070-6045bd2058e3'),
    ('APO Cement', '6b92847e-637e-f111-8071-6045bd2051b9'),
]
LOOKUP = ("EntityDefinitions(LogicalName='chp_accessgrant')/Attributes(LogicalName='chp_company')"
          '/Microsoft.Dynamics.CRM.LookupAttributeMetadata')


def publish(*tables):
    entities = ''.join(f'<entity>{t}</entity>' for t in tables)
    dv.post('PublishXml', {'ParameterXml': f'<importexportxml><entities>{entities}</entities></importexportxml>'})


def wait_for_key(table, schema):
    """Upserts by alternate key need the key's index to be Active."""
    for _ in range(24):
        keys = dv.get(f"EntityDefinitions(LogicalName='{table}')/Keys?$select=SchemaName,EntityKeyIndexStatus")['value']
        status = next(k['EntityKeyIndexStatus'] for k in keys if k['SchemaName'].lower() == schema.lower())
        if status == 'Active':
            return
        if status == 'Failed':
            raise SystemExit(f'key {schema} failed to build')
        time.sleep(5)
    raise SystemExit(f'key {schema} still not active after 2 minutes')


def main():
    print('BC Company')
    ensure_table('chp_BCCompany', 'BC Company', 'BC Companies',
                 'BC companies the portal serves, one row per company per environment (S1-12).',
                 text('chp_Name', 'Name', 100, is_required=True, primary=True))
    ensure_attribute('chp_bccompany', text('chp_BCCompanyGuid', 'BC Company ID', 36, is_required=True))
    ensure_key('chp_bccompany', 'chp_bccompanyguid_key', 'BC company ID', ['chp_bccompanyguid'])
    ensure_lookup('chp_accessgrant', 'chp_Company', 'Company', 'chp_bccompany', 'chp_bccompany_chp_accessgrant',
                  False, 'Restrict')
    publish('chp_bccompany', 'chp_accessgrant')

    entity_set = dv.get("EntityDefinitions(LogicalName='chp_bccompany')?$select=EntitySetName")['EntitySetName']
    print(f'  entity set {entity_set}')
    wait_for_key('chp_bccompany', 'chp_bccompanyguid_key')
    for name, guid in COMPANIES:
        dv.patch(f"{entity_set}(chp_bccompanyguid='{guid}')", {'chp_name': name})
        print(f'  = company {name}')

    print('Backfill grants')
    solid = dv.get(f"{entity_set}(chp_bccompanyguid='{COMPANIES[0][1]}')?$select=chp_bccompanyid")['chp_bccompanyid']
    grants = dv.get('chp_accessgrants?$select=chp_accessgrantid&$filter=_chp_company_value eq null')['value']
    for grant in grants:
        dv.patch(f"chp_accessgrants({grant['chp_accessgrantid']})", {'chp_Company@odata.bind': f'/{entity_set}({solid})'})
    print(f'  backfilled {len(grants)} grants')

    attr = dv.get(LOOKUP)
    if attr['RequiredLevel']['Value'] == 'ApplicationRequired':
        print('  = chp_accessgrant.chp_company required')
    else:
        attr['RequiredLevel']['Value'] = 'ApplicationRequired'
        r = dv.session.put(dv.base + LOOKUP, json=attr, headers={'MSCRM.MergeLabels': 'true'})
        if not r.ok:
            raise SystemExit(f'PUT chp_company failed {r.status_code}: {r.text}')
        publish('chp_accessgrant')
        print('  + chp_accessgrant.chp_company required')
    print('Done.')


if __name__ == '__main__':
    main()
