"""Tiny Dataverse Web API helper for the scripts in this folder (Dev only)."""
import os
import sys

import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from auth import get_token, load_env  # noqa: E402

DEV_ORGS = ('org380257ac', 'org1945492c')
SOLUTION = os.environ.get('CHP_SOLUTION', 'ConcreatHub')


class Dataverse:
    def __init__(self):
        load_env()
        self.base = os.environ['DATAVERSE_URL'].rstrip('/') + '/api/data/v9.2/'
        if not any(org in self.base for org in DEV_ORGS):
            raise SystemExit(f'Refusing to run against {self.base}: these scripts are for Dev only.')
        self.session = requests.Session()
        self.session.headers.update({
            'Authorization': 'Bearer ' + get_token(),
            'Accept': 'application/json',
            'Content-Type': 'application/json; charset=utf-8',
            'OData-MaxVersion': '4.0',
            'OData-Version': '4.0',
            'MSCRM.SolutionUniqueName': SOLUTION,  # new components land in the solution
        })

    def get(self, path):
        """GET; returns parsed JSON, or None on 404."""
        r = self.session.get(self.base + path)
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return r.json()

    def post(self, path, body):
        r = self.session.post(self.base + path, json=body)
        if not r.ok:
            raise SystemExit(f'POST {path} failed {r.status_code}: {r.text}')
        return r.headers.get('OData-EntityId')

    def patch(self, path, body):
        r = self.session.patch(self.base + path, json=body)
        if not r.ok:
            raise SystemExit(f'PATCH {path} failed {r.status_code}: {r.text}')


def label(text):
    return {'@odata.type': 'Microsoft.Dynamics.CRM.Label',
            'LocalizedLabels': [{'@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', 'Label': text, 'LanguageCode': 1033}]}


def required(flag):
    return {'Value': 'ApplicationRequired' if flag else 'None', 'CanBeChanged': True,
            'ManagedPropertyLogicalName': 'canmodifyrequirementlevelsettings'}


def odata_literal(value):
    """Escape a value for an OData string literal (architecture rule 4)."""
    return value.replace("'", "''")
