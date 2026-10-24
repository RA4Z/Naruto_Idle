import copy
import hashlib
from pathlib import Path
import struct
import sys
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from role_mme_contract import role_mme_facts, validate_role_mme_entry
from role_export_data import source_key
from test_role_export_data import Archive, tag


class RoleMmeContractTests(unittest.TestCase):
    def fixture(self, attrs='blendMode="add"', asset_attrs='x="-1.5" y="2"'):
        logical = 'assets/battle/role/right/11001601.swf'
        xml = ('<actions frameRate="24"><asset id="1" className="Bitmap" '+asset_attrs+'/>'
            '<action name="C_callup_dead"><layer><frame index="0" length="2" event="e:hit">'
            '<element assetId="1" '+attrs+'/></frame></layer></action></actions>').encode()
        body = b'\x08\x00\x00\x18\x01\x00' + tag(87, struct.pack('<HI', 1, 0) + xml) + tag(76, struct.pack('<HH', 1, 1) + b'Config\0') + tag(0)
        archive = Archive(b'FWS\x09' + struct.pack('<I', 8 + len(body)) + body)
        job = {'resource': logical, 'action': 'C_callup_dead', 'key': source_key(logical, 'C_callup_dead'),
            'sourceKind': 'role-mme-action', 'source': archive.record(logical), 'authoredFrames': 2, 'rootFps': 24,
            'configuration': {'configuration': 'Config', 'configurationSha256': hashlib.sha256(xml).hexdigest()},
            'core': archive.record('flash/core/naruto.core.swf')}
        return archive, job

    def test_original_blend_events_and_asset_registration_are_preserved_as_data(self):
        archive, job = self.fixture()
        facts = role_mme_facts(archive, job)
        self.assertEqual((facts['authoredFrames'], facts['fps']), (2, 24))
        self.assertIn('blendMode="add"', facts['sourceActionData']['actionXml'])
        self.assertIn('event="e:hit"', facts['sourceActionData']['actionXml'])
        self.assertEqual(facts['sourceActionData']['assetRegistrations'][0]['x'], '-1.5')
        self.assertFalse(facts['sourceExecution'])

    def test_nonfinite_fields_and_external_names_are_rejected(self):
        for attrs, asset in [('x="NaN"', 'x="0"'), ('extname="yingzi"', 'x="0"'), ('alpha="Infinity"', 'x="0"'), ('x="0"', 'x="NaN"')]:
            archive, job = self.fixture(attrs, asset)
            with self.subTest(attrs=attrs, asset=asset), self.assertRaises(ValueError): role_mme_facts(archive, job)

    def test_original_source_core_kind_timing_and_configuration_cannot_drift(self):
        for field, value in [('sourceKind', 'role-left-exported-sprite'), ('source', {}), ('core', {}), ('configuration', {}), ('rootFps', 30), ('authoredFrames', 3), ('key', 'changed')]:
            archive, job = self.fixture(); job[field] = value
            with self.subTest(field=field), self.assertRaises(ValueError): role_mme_facts(archive, job)

    def test_publication_revalidates_authored_metadata_without_changing_combat(self):
        archive, job = self.fixture(); fact = role_mme_facts(archive, job)
        entry = {'id': job['key'], 'sourceKind': job['sourceKind'], 'sourceOnly': True, 'source': job['source'], 'sourceConfig': job['source'],
            'definition': {'frontAction': job['action']}, 'sourceExport': fact,
            'layers': [{'action': job['action'], 'namedInstances': [], 'sourceActionData': fact['sourceActionData'],
                'rendererSemanticEvidence': fact['rendererSemanticEvidence'], 'configurationEvidence': fact['configurationEvidence'],
                'validation': {'nativeFrames': 2}, 'animation': {'timeline': [0, 1], 'fps': 24}}]}
        self.assertTrue(validate_role_mme_entry(archive, entry))
        bad = copy.deepcopy(entry); bad['layers'][0]['sourceActionData']['actionXml'] = '<invented/>'
        with self.assertRaises(ValueError): validate_role_mme_entry(archive, bad)


if __name__ == '__main__': unittest.main()
