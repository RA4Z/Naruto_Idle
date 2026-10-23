import copy,hashlib,json,sys,tempfile,unittest,xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import patch
from PIL import Image
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from original_archive import OriginalArchive
from recover_role_sources import source_key
from recover_bound_effects import source_action_data
from install_source_exports import entry_digest
from install_role_sources import publish

class RoleSourceInstallTests(unittest.TestCase):
    def fixture(self,root):
        original=root/'original';project=root/'project';stage=root/'stage';logical='assets/battle/role/right/demo.swf';core='flash/core/naruto.core.swf'
        (original/'manifestos').mkdir(parents=True);(original/'manifestos/inventory.json').write_text(json.dumps([{'original_path':p,'version':'v1','category':'characters'} for p in (logical,core)]))
        for value in (logical,core):
            path=original/'characters/v1'/value;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(value.encode())
        archive=OriginalArchive(original);evidence=archive.record(logical);core_evidence=archive.record(core);ident=source_key(logical);relative='assets/para-revisao/fontes-alternativas/'+ident
        folder=stage/'public'/relative;folder.mkdir(parents=True);bitmap=folder/'action/pose.png';bitmap.parent.mkdir();Image.new('RGBA',(2,2),'red').save(bitmap)
        configuration={'configuration':'ConfigAMF','configurationSha256':'original-config'}
        source_root=ET.fromstring('<actions frameRate="24"><asset id="7" className="Asset_7" x="0" y="0"/><action name="walk"><layer><frame index="0" length="2"><element assetId="7" x="0" y="0"/></frame></layer></action></actions>')
        definition={'url':'/'+relative+'/action/pose.png','timeline':[0,0],'sourceEvidence':evidence,'sourceConfiguration':configuration,'sourceAction':'walk','configurationPreferenceEvidence':core_evidence}
        manifest={'id':ident,'sourceOnly':True,'sourceGroup':'battle-right','sourceEvidence':evidence,'sourceConfiguration':configuration,'authoredActions':{'walk':source_action_data(source_root,configuration,'walk')},'dataOnlyActions':[],'deferredActions':[],'modes':{'source':{'animations':{'walk':definition}}}}
        (folder/'manifest.json').write_text(json.dumps(manifest));(stage/'report.json').write_text(json.dumps({'sourceOnly':True,'mechanicalUnlocksChanged':False,'models':{ident:{'source':evidence,'manifest':'/'+relative+'/manifest.json','preparedActions':['walk']}}}))
        proof=stage/'proof.json';proof.write_text(json.dumps({'allTimelineFrames':True,'actions':[{'id':ident,'mode':'source','action':'walk','timingAndTimelineMatch':True,'groundOffsetsAndPixelsMatch':True,'sourceHashesPreserved':True,'sampledTimelineFrames':[0,1],'animationDefinitionSha256':entry_digest(definition),'atlasSha256':hashlib.sha256(bitmap.read_bytes()).hexdigest()}]}))
        catalog=project/'public/assets/catalog/entities.json';catalog.parent.mkdir(parents=True);catalog.write_text(json.dumps({'entities':[{'id':'11000211','starter':'sasuke','reservedBlack':'11000201'}]}))
        return project,stage,archive,ident,proof,source_root,configuration,bitmap,folder/'manifest.json'

    def run_publish(self,fixture):
        project,stage,archive,ident,proof,source_root,configuration,*_=fixture
        with patch('install_role_sources.read_config',return_value=(source_root,{},configuration)):return publish(project,stage,archive,[ident],[proof])

    def test_source_graphics_publish_without_touching_live_catalog_and_are_idempotent(self):
        with tempfile.TemporaryDirectory() as temp:
            fixture=self.fixture(Path(temp));project=fixture[0];catalog=project/'public/assets/catalog/entities.json';before=catalog.read_bytes()
            result=self.run_publish(fixture);self.assertEqual(result['preparedActions'],1);self.assertEqual(result['sourceFramesVerified'],2);self.assertEqual(catalog.read_bytes(),before)
            index=project/'asset-source/role-source-exports/index.json';unchanged=index.read_bytes();again=self.run_publish(fixture);self.assertEqual(len(again['alreadyCurrent']),1);self.assertEqual(index.read_bytes(),unchanged)

    def test_modified_pixels_definition_or_authored_metadata_cannot_publish(self):
        for kind in ('pixels','definition','metadata'):
            with self.subTest(kind=kind),tempfile.TemporaryDirectory() as temp:
                fixture=self.fixture(Path(temp));project,stage,archive,ident,proof,source_root,configuration,bitmap,manifest=fixture
                if kind=='pixels':bitmap.write_bytes(b'tampered')
                else:
                    data=json.loads(manifest.read_bytes())
                    if kind=='definition':data['modes']['source']['animations']['walk']['timeline']=[0]
                    else:data['authoredActions']['walk']['fps']='60'
                    manifest.write_text(json.dumps(data))
                with self.assertRaises((ValueError,AssertionError)):self.run_publish(fixture)
                self.assertFalse((project/'asset-source/role-source-exports/index.json').exists())

    def test_current_review_artifact_is_preserved(self):
        with tempfile.TemporaryDirectory() as temp:
            fixture=self.fixture(Path(temp));self.run_publish(fixture);project,stage,archive,ident,proof,source_root,configuration,bitmap,manifest=fixture
            target=project/'public'/json.loads(manifest.read_bytes())['modes']['source']['animations']['walk']['url'].lstrip('/');target.write_bytes(b'current-edit')
            with self.assertRaisesRegex(ValueError,'Existing role review file changed'):self.run_publish(fixture)
            self.assertEqual(target.read_bytes(),b'current-edit')

if __name__=='__main__':unittest.main()
