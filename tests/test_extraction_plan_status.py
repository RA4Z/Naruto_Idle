import copy
import hashlib
import sys
from pathlib import Path
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from extraction_plan_status import inventory


def job(action):
    path = 'assets/battle/effect/fixture.swf'
    key = ('source:' + hashlib.sha256(path.encode()).hexdigest()[:16]
           + ':' + hashlib.sha256(action.encode()).hexdigest()[:12])
    return {'key': key, 'action': action, 'resource': path,
            'source': {'path': path, 'sha256': 'a' * 64, 'bytes': 1, 'tag': 'fixture'}}


def entry(row):
    return {'id': row['key'], 'source': copy.deepcopy(row['source']),
            'state': 'source-frames-complete-runtime-adapter-pending',
            'layers': [{'action': row['action'], 'validation': {'nativeFrames': 2,
                'frameRgbaSha256': ['0' * 64, '1' * 64], 'allFramesPixelExact': True,
                'originalCoordinatesPreserved': True, 'sourcePixelScale': 1}}]}


class PlanStatusTest(unittest.TestCase):
    def test_partitions_overlap_without_counting_staging_as_published(self):
        jobs = [job(str(i)) for i in range(5)]
        public = {'sourceExports': {jobs[0]['key']: entry(jobs[0]), 'other': {}}}
        staged = {'sourceExports': {j['key']: entry(j) for j in jobs[:2]},
                  'deferred': {j['key']: {'reason': 'Timeline or canvas budget exceeded'} for j in jobs[:4]}}
        reviewed = {'rows': [dict(jobs[2], allFramesTransparent=True,
            state='source-empty-display-timeline-reviewed-not-an-animation')]}
        result = inventory({'jobs': jobs}, public, staged, reviewed)['summary']
        self.assertEqual(result['publishedPlanPercent'], 20)
        self.assertEqual(result['publishedOutsidePlan'], 1)
        self.assertEqual(set(result['partition'].values()), {1})
        self.assertEqual(result['deferredReasonCounts'], {'canvas-budget': 1})

    def test_mismatched_original_is_never_counted_as_completed(self):
        row = job('1'); wrong = entry(row); wrong['source']['sha256'] = 'b' * 64
        with self.assertRaisesRegex(ValueError, 'differs from plan'):
            inventory({'jobs': [row]}, {'sourceExports': {row['key']: wrong}}, {})

    def test_incomplete_pixel_metadata_fails_closed(self):
        row = job('1'); wrong = entry(row); wrong['layers'][0]['validation']['frameRgbaSha256'].pop()
        with self.assertRaisesRegex(ValueError, 'pixel metadata'):
            inventory({'jobs': [row]}, {'sourceExports': {row['key']: wrong}}, {})
        wrong = entry(row); wrong['layers'][0]['validation']['frameRgbaSha256'][0] = 'not-a-digest'
        with self.assertRaisesRegex(ValueError, 'pixel metadata'):
            inventory({'jobs': [row]}, {'sourceExports': {row['key']: wrong}}, {})

    def test_duplicate_or_forged_plan_identity_is_rejected(self):
        row = job('1')
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            inventory({'jobs': [row, row]}, {}, {})
        row['key'] = 'source:wrong'
        with self.assertRaisesRegex(ValueError, 'Plan identity'):
            inventory({'jobs': [row]}, {}, {})

    def test_nonvisual_requires_exact_source_and_explicit_review(self):
        row = job('1')
        with self.assertRaisesRegex(ValueError, 'Nonvisual review'):
            inventory({'jobs': [row]}, {}, {}, {'rows': [dict(row, allFramesTransparent=True)]})

    def test_empty_plan_has_no_misleading_completion_percentage(self):
        summary = inventory({'batches': []}, {}, {})['summary']
        self.assertIsNone(summary['publishedPlanPercent'])
        self.assertEqual(summary['plannedActions'], 0)

    def test_pinned_snapshot_review_format_remains_separate_from_publication(self):
        row = job('1')
        review = {'reviewedNonvisualSourceActions': [{'proof': dict(row,
            allFramesTransparent=True, state='source-empty-display-timeline-reviewed-not-an-animation')}]}
        result = inventory({'jobs': [row]}, {}, {}, review)['summary']
        self.assertEqual(result['partition']['reviewed-nonvisual'], 1)
        self.assertEqual(result['publishedPlanPercent'], 0)


if __name__ == '__main__':
    unittest.main()
