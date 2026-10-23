import contextlib,copy,hashlib,io,json,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from test_bitmap_cache import source_swf
from original_archive import OriginalArchive
from mme_config import read_config
from install_source_corrections import main

class SourceCorrectionTests(unittest.TestCase):
    def fixture(self,root):
        source=root/'source';project=root/'project';stage=root/'stage'
        logical='assets/role/npc/scene/npcres/1_outdoor.swf';core='flash/core/naruto.core.swf'
        (source/'manifestos').mkdir(parents=True)
        (source/'manifestos/inventory.json').write_text(json.dumps([{'original_path':p,'version':'v','category':'graphics'} for p in (logical,core)]))
        for name,data in ((logical,source_swf((255,0,0))),(core,b'static-core-evidence')):
            path=source/'graphics/v'/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
        archive=OriginalArchive(source);evidence=archive.record(logical);config=read_config(archive.raw(logical))[2]
        url='/assets/characters/demo/world/SP_skill1.png';manifest_url='/assets/characters/demo/manifest.json'
        old={'url':url,'timeline':[0],'frames':1,'frameWidth':2,'frameHeight':2,'origin':[0,1],'fps':24,'status':'partial'}
        before={'id':'1','collection':'review','capabilities':{'companion':False,'npc':True},'reserved':True,'modes':{'world':{'referenceHeight':2,'status':'partial','animations':{'SP_skill1':old,'idle_0':{'url':'leave-unchanged'}}}}}
        after=copy.deepcopy(before);new=after['modes']['world']['animations']['SP_skill1']
        new.update({'status':'ready','sourceAction':'SP_skill1','rendererRevision':'preferred-fixture','sourceEvidence':evidence,'sourceConfiguration':config,'configurationPreferenceEvidence':archive.record(core)})
        for base,color,manifest in ((project,'blue',before),(stage,'red',after)):
            image=base/'public'/url.lstrip('/');image.parent.mkdir(parents=True);Image.new('RGBA',(2,2),color).save(image)
            (base/'public'/manifest_url.lstrip('/')).write_text(json.dumps(manifest))
        old_sha=hashlib.sha256((project/'public'/url.lstrip('/')).read_bytes()).hexdigest();new_sha=hashlib.sha256((stage/'public'/url.lstrip('/')).read_bytes()).hexdigest()
        (stage/'report.json').write_text(json.dumps({'models':{'1':{'mode':'world','manifest':manifest_url,'source':evidence,'replacedExistingActions':[{'action':'SP_skill1','before':old,'beforeBitmapSha256':old_sha}]}}}))
        (stage/'reports').mkdir();(stage/'reports/proof.json').write_text(json.dumps({'allTimelineFrames':True,'actions':[{'id':'1','mode':'world','action':'SP_skill1','rendererRevision':'preferred-fixture','atlasSha256':new_sha,'sourceConfiguration':config,'sampledTimelineFrames':[0],'timingAndTimelineMatch':True,'groundOffsetsAndPixelsMatch':True,'sourceHashesPreserved':True}]}))
        return source,project,stage,before,manifest_url,url

    def run_install(self,source,project,stage):
        with patch.object(sys,'argv',['install','--source',str(source),'--project',str(project),'--staging',str(stage),'--label','fixture']),contextlib.redirect_stdout(io.StringIO()):main()

    def test_correction_changes_only_requested_action_preserves_old_pixels_and_can_resume(self):
        with tempfile.TemporaryDirectory() as temp:
            source,project,stage,before,manifest_url,url=self.fixture(Path(temp));old_bytes=(project/'public'/url.lstrip('/')).read_bytes()
            self.run_install(source,project,stage);manifest=project/'public'/manifest_url.lstrip('/');after=json.loads(manifest.read_bytes())
            new=after['modes']['world']['animations']['SP_skill1'];self.assertNotEqual(new['url'],url)
            self.assertEqual((project/'public'/url.lstrip('/')).read_bytes(),old_bytes)
            after['modes']['world']['animations']['SP_skill1']=before['modes']['world']['animations']['SP_skill1'];self.assertEqual(after,before)
            expected=manifest.read_bytes();self.run_install(source,project,stage);self.assertEqual(manifest.read_bytes(),expected)

    def test_stale_edits_corrupt_pixels_or_partial_proof_cannot_replace_current_action(self):
        for case in ('edit','bitmap','coverage'):
            with self.subTest(case=case),tempfile.TemporaryDirectory() as temp:
                source,project,stage,before,manifest_url,url=self.fixture(Path(temp));manifest=project/'public'/manifest_url.lstrip('/')
                if case=='edit':
                    before['modes']['world']['animations']['SP_skill1']['currentEdit']=True;manifest.write_text(json.dumps(before))
                elif case=='bitmap':(stage/'public'/url.lstrip('/')).write_bytes(b'changed')
                else:
                    path=stage/'reports/proof.json';data=json.loads(path.read_bytes());data['actions'][0]['sampledTimelineFrames']=[];path.write_text(json.dumps(data))
                expected=manifest.read_bytes()
                with self.assertRaises(ValueError):self.run_install(source,project,stage)
                self.assertEqual(manifest.read_bytes(),expected)

if __name__=='__main__':unittest.main()
