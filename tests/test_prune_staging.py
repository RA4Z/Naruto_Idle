import gzip,hashlib,json,sys,tempfile,unittest
from pathlib import Path
from PIL import Image
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from prune_installed_staging import prune

class StagingPruneTests(unittest.TestCase):
    def test_only_verified_installed_duplicate_can_be_deleted(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);project=root/'project';stage=root/'stage';url='/assets/characters/demo/battle/old.png';other='/assets/characters/demo/battle/new.png'
            manifest_url='/assets/characters/demo/manifest.json';canonical_url='/assets/characters/demo/battle/renamed-native.png'
            for value in (url,other):
                path=stage/'public'/value.lstrip('/');path.parent.mkdir(parents=True,exist_ok=True);Image.new('RGBA',(2,2),'red').save(path)
            payload=(stage/'public'/url.lstrip('/')).read_bytes();sha=hashlib.sha256(payload).hexdigest()
            canonical=project/'public'/canonical_url.lstrip('/');canonical.parent.mkdir(parents=True);canonical.write_bytes(payload)
            lfs=project/'.git/lfs/objects'/sha[:2]/sha[2:4]/sha;lfs.parent.mkdir(parents=True);lfs.write_bytes(payload)
            manifest=stage/'public'/manifest_url.lstrip('/');manifest.write_text(json.dumps({'modes':{'battle':{'animations':{'old':{'url':url},'new':{'url':other}}}}}))
            (stage/'report.json').write_text(json.dumps({'models':{'1':{'mode':'battle','manifest':manifest_url,'added':[{'action':'old'},{'action':'new'}]}}}))
            milestone=root/'milestone.json.gz';milestone.write_bytes(gzip.compress(json.dumps({'models':{'1':{'mode':'battle','added':[{'action':'old','url':canonical_url,'atlasSha256':sha}]}}}).encode()))
            dry=prune(project,stage,milestone);self.assertEqual(dry['safeCandidates'],1);self.assertTrue((stage/'public'/url.lstrip('/')).exists())
            canonical.write_bytes(b'changed');bad=prune(project,stage,milestone,True)
            self.assertEqual(len(bad['removed']),0);self.assertTrue((stage/'public'/url.lstrip('/')).exists())
            canonical.write_bytes(payload);result=prune(project,stage,milestone,True)
            self.assertEqual(len(result['removed']),1);self.assertFalse((stage/'public'/url.lstrip('/')).exists())
            self.assertTrue((stage/'public'/other.lstrip('/')).exists());self.assertTrue(manifest.exists())
            self.assertEqual(canonical.read_bytes(),payload);self.assertEqual(lfs.read_bytes(),payload)

if __name__=='__main__':unittest.main()
