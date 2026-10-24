import copy
import hashlib
from pathlib import Path
import struct
import sys
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from role_export_data import source_data, source_key


def tag(kind, payload=b''):
    return struct.pack('<H', (kind << 6) | len(payload)) + payload if len(payload) < 63 else struct.pack('<HI', (kind << 6) | 63, len(payload)) + payload


class Archive:
    def __init__(self, raw): self.data = raw
    def raw(self, logical): return self.data
    def record(self, logical): return {'path': logical, 'sha256': hashlib.sha256(self.data).hexdigest()}


class RoleDataTests(unittest.TestCase):
    def fixture(self, content=None, frames=3, flags=0x36):
        logical, action = 'assets/battle/role/left/13000101.swf', 'skillAttack_Data'
        marker = struct.pack('<HH', 1, 1) + tag(26, b'\x06\x01\x00\x03\x00\x00') + tag(1) + tag(0)
        placement = bytes([flags]) + struct.pack('<HH', 1, 1) + b'\x00' + struct.pack('<H', 15) + b'referPoint\0'
        if content is None:
            content = tag(26, placement) + tag(43, b'e:hit\0') + tag(1) + tag(1) + tag(28, struct.pack('<H', 1)) + tag(43, b'anchor\0\x01') + tag(1)
        sprite = struct.pack('<HH', 2, frames) + content + tag(0)
        sibling = struct.pack('<HH', 4, 7) + tag(1) * 7 + tag(0)
        exports = struct.pack('<HH', 2, 2) + action.encode() + b'\0' + struct.pack('<H', 4) + b'skillAttack\0'
        body = b'\x08\x00\x00\x18\x01\x00' + tag(39, marker) + tag(39, sprite) + tag(39, sibling) + tag(76, exports) + tag(0)
        archive = Archive(b'FWS\x09' + struct.pack('<I', 8 + len(body)) + body)
        return archive, {'resource': logical, 'action': action, 'key': source_key(logical, action), 'sourceKind': 'role-left-exported-data',
            'symbolId': 2, 'authoredFrames': frames, 'rootFps': 24., 'source': archive.record(logical)}

    def test_ratio_persistence_removal_and_inert_labels(self):
        archive, job = self.fixture()
        result = source_data(archive, job)
        self.assertEqual(result['frames'][0]['points'], result['frames'][1]['points'])
        self.assertEqual(result['frames'][0]['points'][0]['ratio'], 15)
        self.assertEqual(result['frames'][2]['points'], [])
        self.assertEqual(result['frames'][0]['labels'][0]['name'], 'e:hit')
        self.assertIsNone(result['frames'][0]['labels'][0]['namedAnchor'])
        self.assertTrue(result['frames'][2]['labels'][0]['namedAnchor'])
        self.assertFalse(result['sourceExecution'])
        self.assertFalse(result['combatBindingChanged'])
        self.assertEqual(result['referencedMarkerSprites'][0]['tagCounts']['26'], 1)
        self.assertEqual(result['visualSiblingHint']['authoredFrames'], 7)
        self.assertEqual(result['authoredFrames'], 3)

    def test_unknown_scripts_move_flags_and_unresolved_removals_rejected(self):
        for content in (tag(12) + tag(1), tag(70) + tag(1), tag(28, b'\x05\x00') + tag(1)):
            archive, job = self.fixture(content=content, frames=1)
            with self.assertRaises(ValueError): source_data(archive, job)
        archive, job = self.fixture(flags=0x37)
        with self.assertRaisesRegex(ValueError, 'placement flags'): source_data(archive, job)

    def test_frame_count_and_trailing_unshown_labels_rejected(self):
        for content in (tag(1), tag(1) * 4, tag(1) * 3 + tag(43, b'e:hit\0')):
            archive, job = self.fixture(content=content)
            with self.assertRaises(ValueError): source_data(archive, job)

    def test_source_identity_and_explicit_scope_required(self):
        for field, value in (('sourceKind', 'battle'), ('resource', 'assets/battle/role/right/13000101.swf'),
                ('action', 'skillAttack'), ('key', 'other'), ('symbolId', 99), ('rootFps', 30), ('source', {})):
            archive, job = self.fixture(); job[field] = value
            with self.subTest(field=field), self.assertRaises(ValueError): source_data(archive, job)

    def test_full_fixed_matrix_and_signed_twips(self):
        placement = b'\x26' + struct.pack('<HH', 1, 1) + bytes.fromhex('1c0025a580') + b'referPoint\0'
        archive, job = self.fixture(content=tag(26, placement) + tag(1), frames=1)
        point = source_data(archive, job)['frames'][0]['points'][0]
        self.assertEqual((point['x'], point['y']), (.2, -241))
        self.assertEqual(point['matrix']['translateYTwips'], -4820)
        self.assertIsNone(point['ratio'])


if __name__ == '__main__': unittest.main()
