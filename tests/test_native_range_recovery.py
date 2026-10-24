import copy
import json
from pathlib import Path
import sys
import tempfile
import time
import unittest
from PIL import Image
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from native_range_recovery import inspect_range,verified_frames,pack_intervals,sha,contained,canvas_size


class NativeRangeRecoveryTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.facts={'symbolId':7,'authoredFrames':4,'fps':24.0,'namedInstances':[]}
        self.identity={'facts':self.facts,'source':'pinned-fixture'}
        self.metadata={'symbolId':7,'frameCount':4,'fps':24.0,'rectTwips':[-20,0,20,20],
            'staticOnly':True,'renderer':'JPEXS-26.4.0'}
        self.ledger={'identity':self.identity,'ranges':[],'packed':{}}
        for start,end in ((0,2),(2,4)):
            folder=self.root/str(start);folder.mkdir()
            for name,value in [('render.json',self.metadata),('named-instances.json',[]),
                    ('range.json',{'start':start,'endExclusive':end,'sourceExecution':False})]:
                (folder/name).write_text(json.dumps(value),encoding='utf-8')
            for frame in range(start,end):
                # Include repeated pixels at different authored frames.
                image=Image.new('RGBA',(3,2),[(255,0,0,255),(0,0,0,0),(0,255,0,128),(255,0,0,255)][frame])
                image.save(folder/f'{frame:04d}.png')
            self.ledger['ranges'].append(inspect_range(self.root,folder,start,end,self.facts))

    def tearDown(self):self.temp.cleanup()

    def test_intervals_preserve_full_canvas_order_transparency_and_repetition(self):
        frames,metadata=verified_frames(self.root,self.ledger,self.identity)
        output=self.root/'packed'
        data,proof=pack_intervals(self.root,output,self.ledger,self.identity,time.monotonic()+100)
        self.assertEqual(data['timeline'],[0,1,2,0])
        self.assertEqual(data['frameSize'],[3,2])
        self.assertEqual(data['origin'],[1/3,0])
        self.assertEqual(data['fps'],24)
        self.assertEqual(proof['frameRgbaSha256'],[f['rgbaSha256'] for f in frames])
        self.assertEqual(metadata,self.metadata)
        self.assertEqual(proof['nativeFrames'],4)
        self.assertEqual(canvas_size(dict(self.metadata,rectTwips=[-11528,-8264,8304,4274])),[992,627])

    def test_source_identity_overlap_gap_and_metadata_drift_are_rejected(self):
        bad=copy.deepcopy(self.identity);bad['source']='changed'
        with self.assertRaisesRegex(ValueError,'fingerprint changed'):
            verified_frames(self.root,self.ledger,bad)
        for field,value in [('start',1),('start',3),('metadata',dict(self.metadata,fps=12))]:
            bad=copy.deepcopy(self.ledger);bad['ranges'][1][field]=value
            with self.assertRaises(ValueError):verified_frames(self.root,bad,self.identity)

    def test_truncated_or_changed_native_frames_never_resume(self):
        path=self.root/'0/0000.png';path.write_bytes(path.read_bytes()[:20])
        with self.assertRaisesRegex(ValueError,'Range frame changed'):
            verified_frames(self.root,self.ledger,self.identity)
        with self.assertRaises(OSError):inspect_range(self.root,self.root/'0',0,2,self.facts)

    def test_incomplete_range_cannot_be_packed(self):
        self.ledger['ranges'].pop()
        self.assertIsNone(pack_intervals(self.root,self.root/'out',self.ledger,self.identity,time.monotonic()+100))
        self.assertFalse((self.root/'out/manifest.json').exists())

    def test_resume_only_accepts_byte_identical_previously_decoded_webp(self):
        output=self.root/'out'
        self.assertIsNone(pack_intervals(self.root,output,self.ledger,self.identity,time.monotonic()-1))
        self.assertEqual(self.ledger['packed'],{})
        result=pack_intervals(self.root,output,self.ledger,self.identity,time.monotonic()+100)
        self.assertIsNotNone(result)
        artifact=output/result[0]['frameFiles'][0];artifact.write_bytes(b'broken')
        with self.assertRaisesRegex(ValueError,'compressed frame artifact changed'):
            pack_intervals(self.root,output,self.ledger,self.identity,time.monotonic()+100)

    def test_forged_frame_receipt_missing_files_and_path_escape_fail_closed(self):
        bad=copy.deepcopy(self.ledger);bad['ranges'][0]['frames'].pop()
        with self.assertRaisesRegex(ValueError,'frame proof incomplete'):
            verified_frames(self.root,bad,self.identity)
        for relative in ('../other.png','C:/outside.png','/outside.png','..\\outside.png'):
            with self.assertRaises(ValueError):contained(self.root,relative)
        (self.root/'0/render.json').write_text('{}',encoding='utf-8')
        with self.assertRaisesRegex(ValueError,'metadata artifact changed'):
            verified_frames(self.root,self.ledger,self.identity)


if __name__=='__main__':unittest.main()
