import hashlib,json,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from prune_effect_staging import prune

class PruneEffectStagingTests(unittest.TestCase):
    def fixture(self,root):
        project=root/'project';stage=root/'stage';binary=b'verified generated image';digest=hashlib.sha256(binary).hexdigest()
        entry={'layers':[{'animation':{'url':'/assets/effects/native/source/action/effect.webp'},'artifactsSha256':{'effect.webp':digest}}]}
        index={'sourceExports':{'source-id':entry}}
        temporary=stage/'source/action/effect.webp';published=project/'public/assets/effects/native/source/action/effect.webp';lfs=project/'.git/lfs/objects'/digest[:2]/digest[2:4]/digest
        for p in (temporary,published,lfs):p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(binary)
        (stage/'index.json').write_text(json.dumps(index));(project/'public/assets/effects/native/index.json').write_text(json.dumps(index))
        return project,stage,temporary,published,lfs
    def test_deletes_only_three_way_verified_temporary_copy(self):
        with tempfile.TemporaryDirectory() as tmp:
            p,s,t,target,lfs=self.fixture(Path(tmp));self.assertEqual(len(prune(p,s)['candidates']),1);self.assertTrue(t.exists())
            self.assertEqual(len(prune(p,s,True)['removed']),1);self.assertFalse(t.exists());self.assertTrue(target.is_file());self.assertTrue(lfs.is_file());self.assertTrue((s/'index.json').exists())
    def test_corrupt_or_missing_copies_are_preserved(self):
        for variant in ('target','lfs','temporary','missing-lfs'):
            with self.subTest(variant=variant),tempfile.TemporaryDirectory() as tmp:
                p,s,t,target,lfs=self.fixture(Path(tmp))
                if variant=='missing-lfs':lfs.unlink()
                else:{'target':target,'lfs':lfs,'temporary':t}[variant].write_bytes(b'changed')
                self.assertFalse(prune(p,s,True)['removed']);self.assertTrue(t.exists())
    def test_unpublished_entry_is_preserved(self):
        with tempfile.TemporaryDirectory() as tmp:
            p,s,t,target,lfs=self.fixture(Path(tmp));(p/'public/assets/effects/native/index.json').write_text('{}')
            self.assertFalse(prune(p,s,True)['removed']);self.assertTrue(t.exists())
