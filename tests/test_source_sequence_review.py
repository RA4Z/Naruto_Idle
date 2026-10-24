import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from source_sequence_review import SequenceCatalog


class SequenceReviewTests(unittest.TestCase):
    def fixture(self, root):
        folder=root/'asset-source/native-effects/hash/action/source-sequence';folder.mkdir(parents=True)
        name='frame-'+'a'*24+'.webp';payload=b'previously-proven-frame';(folder/name).write_bytes(payload)
        proof={'allFramesPixelExact':True,'nativeFrames':3}
        data={'state':'source-frames-complete-runtime-adapter-pending','sourcePixelScale':1,'validation':proof,'fps':24,
            'frameSize':[10,20],'sourceBounds':[-10,-20,190,380],'frameFiles':[name],'timeline':[0,0,0]}
        manifest=folder/'manifest.json';manifest.write_text(json.dumps(data))
        layer={'action':'original','plane':'front','validation':proof,'sourceSequence':{'manifestPath':'hash/action/source-sequence/manifest.json'},
            'artifactsSha256':{'manifest.json':hashlib.sha256(manifest.read_bytes()).hexdigest(),name:hashlib.sha256(payload).hexdigest()}}
        index=root/'public/assets/effects/native/index.json';index.parent.mkdir(parents=True);index.write_text(json.dumps({'sourceExports':{'source:test':{'source':{'path':'assets/battle/effect/original.swf'},'layers':[layer]}}}))
        catalog=SequenceCatalog(root);key=next(iter(catalog.items));return catalog,key,folder,name

    def test_only_pinned_sequence_is_accessible_without_eager_frame_reads(self):
        with tempfile.TemporaryDirectory() as tmp:
            c,key,folder,name=self.fixture(Path(tmp));self.assertEqual(c.describe(key)['timeline'],[0,0,0]);self.assertEqual(c.frame(key,0),b'previously-proven-frame')
            (folder/name).unlink();self.assertEqual(len(c.catalog()),1);self.assertEqual(c.describe(key)['fps'],24)
            with self.assertRaises(OSError):c.frame(key,0)

    def test_unknown_ids_indices_path_traversal_and_modified_files_are_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            c,key,folder,name=self.fixture(Path(tmp))
            for index in (-1,1,True):
                with self.assertRaises(ValueError):c.frame(key,index)
            with self.assertRaises(ValueError):c.describe('../source.swf')
            c.items[key][2]['sourceSequence']['manifestPath']='../../credentials.json'
            with self.assertRaises(ValueError):c.describe(key)
        with tempfile.TemporaryDirectory() as tmp:
            c,key,folder,name=self.fixture(Path(tmp));(folder/name).write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError,'changed'):c.frame(key,0)

    def test_manifest_mutation_and_oversized_canvas_never_become_a_preview(self):
        with tempfile.TemporaryDirectory() as tmp:
            c,key,folder,name=self.fixture(Path(tmp));path=folder/'manifest.json';data=json.loads(path.read_bytes());data['frameSize']=[9000,9000];path.write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError,'manifest changed'):c.describe(key)
            c.items[key][2]['artifactsSha256']['manifest.json']=hashlib.sha256(path.read_bytes()).hexdigest()
            with self.assertRaisesRegex(ValueError,'budgets'):c.describe(key)


if __name__=='__main__':unittest.main()
