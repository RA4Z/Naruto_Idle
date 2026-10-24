import copy
import hashlib
from pathlib import Path
import struct
import sys
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from scene_point_data import matrix, source_points


def tag(kind, payload=b''):
    if len(payload) < 63:
        return struct.pack('<H', (kind << 6) | len(payload)) + payload
    return struct.pack('<HI', (kind << 6) | 63, len(payload)) + payload


class Archive:
    def __init__(self, raw): self.data = raw
    def raw(self, logical): return self.data
    def record(self, logical): return {'path': logical, 'sha256': hashlib.sha256(self.data).hexdigest()}


class ScenePointsTests(unittest.TestCase):
    def fixture(self, *, flags=0x26, child_body=None, frames=1, sprite_tail=None):
        logical = 'assets/role/npc/scene/npcres/11006081_outdoor_effect.swf'
        child_body = tag(1) + tag(0) if child_body is None else child_body
        child = struct.pack('<HH', 1, 1) + child_body
        # Independent observed MATRIX bytes: (4,-4820) twips, identity linear part.
        placement = bytes([flags]) + struct.pack('<HH', 1, 1) + bytes.fromhex('1c0025a580') + b'head\0'
        tail = tag(1) + tag(0) if sprite_tail is None else sprite_tail
        sprite = struct.pack('<HH', 2, frames) + tag(26, placement) + tail
        exports = struct.pack('<HH', 1, 2) + b'posData\0'
        body = b'\x08\x00\x00\x18\x01\x00' + tag(39, child) + tag(39, sprite) + tag(76, exports) + tag(0)
        archive = Archive(b'FWS\x09' + struct.pack('<I', 8 + len(body)) + body)
        key = 'source:' + hashlib.sha256(logical.encode()).hexdigest()[:16] + ':' + hashlib.sha256(b'posData').hexdigest()[:12]
        return archive, {'key': key, 'resource': logical, 'action': 'posData', 'sourceKind': 'scene-exported-sprite',
                         'symbolId': 2, 'authoredFrames': 1, 'rootFps': 24.0, 'source': archive.record(logical)}

    def test_signed_twips_and_original_fps_remain_scene_local(self):
        archive, job = self.fixture()
        proof = source_points(archive, job)
        point = proof['points'][0]
        self.assertEqual((point['name'], point['x'], point['y']), ('head', .2, -241))
        self.assertEqual(point['matrix']['translateYTwips'], -4820)
        self.assertEqual(proof['fps'], 24)
        self.assertFalse(proof['sourceExecution'])
        self.assertFalse(proof['combatBindingChanged'])
        self.assertEqual(proof['state'], 'source-point-metadata-complete-runtime-attachment-pending')

    def test_fixed_scale_skew_and_signed_translation(self):
        def signed(value, width): return format(value & ((1 << width) - 1), f'0{width}b')
        fields = '1' + format(18, '05b') + signed(98304, 18) + signed(32768, 18)
        fields += '1' + format(17, '05b') + signed(-16384, 17) + signed(8192, 17)
        fields += format(7, '05b') + signed(-21, 7) + signed(45, 7)
        fields += '0' * ((-len(fields)) % 8)
        raw = int(fields, 2).to_bytes(len(fields) // 8, 'big')
        value, used = matrix(raw)
        self.assertEqual(used, len(raw))
        self.assertEqual((value['scaleXFixed16'], value['scaleYFixed16']), (98304, 32768))
        self.assertEqual((value['rotateSkew0Fixed16'], value['rotateSkew1Fixed16']), (-16384, 8192))
        self.assertEqual((value['translateXTwips'], value['translateYTwips']), (-21, 45))

    def test_truncated_matrix_rejected(self):
        with self.assertRaisesRegex(ValueError, 'MATRIX'):
            matrix(b'\xff')

    def test_source_and_job_identity_cannot_drift(self):
        for change in ('source', 'key', 'symbolId', 'rootFps'):
            with self.subTest(change=change):
                archive, job = self.fixture()
                job[change] = {'sha256': 'changed'} if change == 'source' else ('changed' if change == 'key' else 99)
                with self.assertRaises(ValueError): source_points(archive, job)

    def test_scripts_extra_flags_and_animated_data_are_rejected(self):
        for options in ({'flags': 0xa6}, {'frames': 2}, {'sprite_tail': tag(12) + tag(1) + tag(0)}):
            with self.subTest(options=options):
                archive, job = self.fixture(**options)
                with self.assertRaises(ValueError): source_points(archive, job)

    def test_nonempty_or_scripted_child_is_never_treated_as_point(self):
        for kind in (26, 12, 82, 43):
            with self.subTest(kind=kind):
                archive, job = self.fixture(child_body=tag(kind) + tag(1) + tag(0))
                with self.assertRaisesRegex(ValueError, 'visual, scripted or unresolved'):
                    source_points(archive, job)

    def test_explicit_scene_kind_and_path_required(self):
        for change in ({'sourceKind': 'battle'}, {'action': 'shang'}, {'resource': 'assets/role/npc/scene/npcres/../escape.swf'}):
            archive, job = self.fixture(); job.update(change)
            with self.assertRaisesRegex(ValueError, 'explicitly planned'):
                source_points(archive, job)


if __name__ == '__main__': unittest.main()
