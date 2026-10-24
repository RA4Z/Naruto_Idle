import hashlib
from pathlib import Path
import struct
import sys
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from role_export_contract import role_export_facts
from test_role_export_data import Archive, tag
from role_export_data import source_key


class RoleVisualContractTests(unittest.TestCase):
    def fixture(self, content=None):
        logical, action = 'assets/battle/role/left/13000101.swf', 'skillAttack'
        content = tag(1) * 2 if content is None else content
        sprite = struct.pack('<HH', 2, 2) + content + tag(0)
        data = struct.pack('<HH', 3, 1) + tag(43, b'e:hit\0') + tag(1) + tag(0)
        exports = struct.pack('<HH', 2, 2) + b'skillAttack\0' + struct.pack('<H', 3) + b'skillAttack_Data\0'
        body = b'\x08\x00\x00\x18\x01\x00' + tag(39, sprite) + tag(39, data) + tag(76, exports) + tag(0)
        archive = Archive(b'FWS\x09' + struct.pack('<I', 8 + len(body)) + body)
        return archive, {'resource': logical, 'action': action, 'key': source_key(logical, action),
            'sourceKind': 'role-left-exported-sprite', 'symbolId': 2, 'authoredFrames': 2,
            'rootFps': 24., 'source': archive.record(logical)}

    def test_preserves_authored_timing_with_unbound_data_hint(self):
        archive, job = self.fixture()
        result = role_export_facts(archive, job)
        self.assertEqual((result['authoredFrames'], result['fps']), (2, 24))
        self.assertEqual(result['dataCompanionHint']['authoredFrames'], 1)
        self.assertEqual(result['dataCompanionHint']['basis'], 'exact-export-name-only-no-runtime-binding')
        self.assertFalse(result['sourceExecution'])

    def test_rejects_wrong_kind_scope_identity_and_data_action(self):
        for field, value in (('sourceKind', 'scene-exported-sprite'), ('resource', 'assets/battle/role/right/13000101.swf'),
                ('key', 'other'), ('symbolId', 3), ('authoredFrames', 3), ('rootFps', 30), ('action', 'skillAttack_Data')):
            archive, job = self.fixture(); job[field] = value
            with self.subTest(field=field), self.assertRaises(ValueError): role_export_facts(archive, job)

    def test_rejects_scripts_and_named_visual_placements(self):
        for content in (tag(12) + tag(1) * 2, tag(26, b'\x26\x01\x00\x01\x00\x00name\0') + tag(1) * 2):
            archive, job = self.fixture(content)
            with self.assertRaises(ValueError): role_export_facts(archive, job)

    def test_keeps_original_frame_label_and_named_anchor(self):
        archive, job = self.fixture(tag(43, b'original\0\x01') + tag(1) * 2)
        self.assertEqual(role_export_facts(archive, job)['frameLabels'], [{'frame': 0, 'name': 'original', 'namedAnchor': True}])


if __name__ == '__main__': unittest.main()
