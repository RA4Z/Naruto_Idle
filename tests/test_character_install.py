import contextlib,copy,hashlib,io,json,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from original_archive import OriginalArchive
from install_character_actions import main

class CharacterInstallTests(unittest.TestCase):
    def fixture(self,root):
        source=root/'originals';project=root/'project';stage=root/'stage';logical='assets/battle/role/left/1.swf'
        (source/'manifestos').mkdir(parents=True);(source/'manifestos/inventory.json').write_text(json.dumps([{'original_path':logical,'version':'v1','category':'characters'}]))
        raw=source/'characters/v1'/logical;raw.parent.mkdir(parents=True);raw.write_bytes(b'original-graphics')
        evidence=OriginalArchive(source).record(logical);url='/assets/characters/one/battle/old.png';manifest_url='/assets/characters/one/manifest.json'
        current={'id':'1','reserved':True,'custom':{'collection':'review'},'modes':{'battle':{'referenceHeight':200,'animations':{'C_idle':{'url':url}}}}}
        for base,color in [(project,'red'),(stage,'green')]:
            image=base/'public'/url.lstrip('/');image.parent.mkdir(parents=True);Image.new('RGBA',(2,2),color).save(image)
        prepared=copy.deepcopy(current);prepared['modes']['battle']['animations']['SP_skill2']={'url':url,'timeline':[0,0],'frames':1,'status':'partial','externalEffects':['shadow.png']}
        for base,value in [(project,current),(stage,prepared)]:
            (base/'public'/manifest_url.lstrip('/')).write_text(json.dumps(value))
        sha=hashlib.sha256((stage/'public'/url.lstrip('/')).read_bytes()).hexdigest();(stage/'reports').mkdir()
        (stage/'reports/pixels.json').write_text(json.dumps({'allTimelineFrames':True,'actions':[{'id':'1','mode':'battle','action':'SP_skill2','groundOffsetsAndPixelsMatch':True,'sourceHashesPreserved':True,'atlasSha256':sha,'sampledTimelineFrames':[0,1]}]}))
        (stage/'report.json').write_text(json.dumps({'models':{'1':{'mode':'battle','manifest':manifest_url,'source':evidence,'added':[{'action':'SP_skill2'}],'deferred':[],'markers':[]}}}))
        return source,project,stage,current,url,manifest_url

    def run_install(self,source,project,stage):
        with patch.object(sys,'argv',['install','--source',str(source),'--project',str(project),'--staging',str(stage),'--label','fixture']),contextlib.redirect_stdout(io.StringIO()):main()

    def test_verified_addition_preserves_reservation_existing_actions_and_collision_bytes(self):
        with tempfile.TemporaryDirectory() as temp:
            source,project,stage,before,url,manifest_url=self.fixture(Path(temp));old=(project/'public'/url.lstrip('/')).read_bytes()
            self.run_install(source,project,stage);after=json.loads((project/'public'/manifest_url.lstrip('/')).read_bytes())
            added=after['modes']['battle']['animations'].pop('SP_skill2')
            self.assertEqual(after,before);self.assertNotEqual(added['url'],url)
            self.assertEqual((project/'public'/url.lstrip('/')).read_bytes(),old)
            self.assertEqual((project/'public'/added['url'].lstrip('/')).read_bytes(),(stage/'public'/url.lstrip('/')).read_bytes())

    def test_tampered_or_incompletely_checked_bitmap_cannot_change_manifest(self):
        for tamper in ('bytes','coverage'):
            with self.subTest(tamper=tamper),tempfile.TemporaryDirectory() as temp:
                source,project,stage,before,url,manifest_url=self.fixture(Path(temp))
                if tamper=='bytes':(stage/'public'/url.lstrip('/')).write_bytes(b'changed')
                else:
                    path=stage/'reports/pixels.json';data=json.loads(path.read_bytes());data['allTimelineFrames']=False;path.write_text(json.dumps(data))
                with self.assertRaises(ValueError):self.run_install(source,project,stage)
                self.assertEqual(json.loads((project/'public'/manifest_url.lstrip('/')).read_bytes()),before)

if __name__=='__main__':unittest.main()
