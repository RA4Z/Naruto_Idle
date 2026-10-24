import hashlib
import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from review_empty_source_export import review_empty_export


def tag(kind, payload=b''):
    return struct.pack('<H', (kind << 6) | len(payload)) + payload


class Archive:
    def __init__(self, raw):
        self.data = raw
    def raw(self, logical):
        return self.data
    def record(self, logical):
        return {'path': logical, 'sha256': hashlib.sha256(self.data).hexdigest()}


class EmptyTimelineTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.work = Path(self.temporary.name)
        self.logical = 'assets/battle/effect/fixture.swf'
        self.action = 'data'
        self.source_key = hashlib.sha256(self.logical.encode()).hexdigest()[:16]
        self.key = 'source:' + self.source_key + ':' + hashlib.sha256(self.action.encode()).hexdigest()[:12]
        self.folder = self.work / self.source_key / '7'
        self.folder.mkdir(parents=True)
        (self.folder / 'render.json').write_text(json.dumps({'symbolId': 7, 'frameCount': 1,
            'staticOnly': True, 'rectTwips': [0, 0, 0, 0]}))
        (self.folder / 'named-instances.json').write_text('[]')
        Image.new('RGBA', (1, 1)).save(self.folder / '0000.png')

    def fixture(self, body=None, declared=1):
        body = tag(1) + tag(0) if body is None else body
        sprite = struct.pack('<HH', 7, declared) + body
        exports = struct.pack('<HH', 1, 7) + self.action.encode() + b'\0'
        content = b'\x08\x00\x00\x18\x01\x00' + tag(39, sprite) + tag(76, exports) + tag(0)
        archive = Archive(b'FWS\x09' + struct.pack('<I', 8 + len(content)) + content)
        return archive, {'key': self.key, 'resource': self.logical, 'action': self.action,
                         'source': archive.record(self.logical)}

    def test_empty_timeline_and_labels_have_independent_source_and_frame_proof(self):
        archive, job = self.fixture(tag(43, b'idle\0') + tag(1) + tag(0))
        proof = review_empty_export(archive, job, self.work)
        self.assertEqual(proof['state'], 'source-empty-display-timeline-reviewed-not-an-animation')
        self.assertTrue(proof['allFramesTransparent'])
        self.assertEqual(len(proof['frameProofs']), 1)
        self.assertEqual(proof['source'], archive.record(self.logical))

    def test_changed_source_rejected(self):
        archive, job = self.fixture()
        job['source'] = dict(job['source'], sha256='0' * 64)
        with self.assertRaisesRegex(ValueError, 'Source or job changed'):
            review_empty_export(archive, job, self.work)

    def test_placements_and_scripts_are_not_classified_as_empty(self):
        for kind in (26, 12, 82, 39, 99):
            with self.subTest(kind=kind):
                archive, job = self.fixture(tag(kind) + tag(1) + tag(0))
                with self.assertRaisesRegex(ValueError, 'strictly empty'):
                    review_empty_export(archive, job, self.work)

    def test_visible_pixels_are_rejected(self):
        archive, job = self.fixture()
        Image.new('RGBA', (1, 1), (1, 2, 3, 255)).save(self.folder / '0000.png')
        with self.assertRaisesRegex(ValueError, 'visible or oversized'):
            review_empty_export(archive, job, self.work)

    def test_missing_or_extra_frames_are_rejected(self):
        archive, job = self.fixture()
        Image.new('RGBA', (1, 1)).save(self.folder / '0001.png')
        with self.assertRaisesRegex(ValueError, 'frame set'):
            review_empty_export(archive, job, self.work)

    def test_source_frame_mismatch_is_rejected(self):
        archive, job = self.fixture(declared=2)
        with self.assertRaisesRegex(ValueError, 'frame count'):
            review_empty_export(archive, job, self.work)

    def test_truncated_nested_tag_is_rejected(self):
        archive, job = self.fixture(tag(1) + struct.pack('<H', (43 << 6) | 5) + b'x')
        with self.assertRaisesRegex(ValueError, 'Truncated sprite'):
            review_empty_export(archive, job, self.work)


if __name__ == '__main__':
    unittest.main()
