import contextlib,copy,hashlib,io,json,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from original_archive import OriginalArchive
from resolve_effect_bindings import main

class ExactBindingTests(unittest.TestCase):
    def test_only_exact_resource_and_action_match_and_sequence_stays_separate(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);source=root/'source';project=root/'project';prepared=root/'prepared'
            config='assets/battle/Effect.xml';logical='assets/battle/effect/test.swf'
            (source/'manifestos').mkdir(parents=True);project.mkdir();prepared.mkdir()
            rows=[{'original_path':name,'version':'v','category':'graphics'} for name in (config,logical)]
            (source/'manifestos/inventory.json').write_text(json.dumps(rows))
            for name,data in [(config,b'<root><effect id="7" type="0" res="assets/battle/effect/test.swf" frontAction="exact"/><effect id="8" type="0" res="assets/battle/effect/test.swf" frontAction="exact "/><effect id="9" type="0" res="assets/battle/effect/test.swf" frontAction="oversize"/></root>'),(logical,b'graphics-only-fixture')]:
                path=source/'graphics/v'/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
            archive=OriginalArchive(source);entries={}
            for action,sequence in [('exact',False),('oversize',True)]:
                folder=prepared/action;folder.mkdir();(folder/'manifest.json').write_text('{}')
                layer={'action':action,'plane':'front','validation':{'allFramesPixelExact':True},'artifactsSha256':{'manifest.json':hashlib.sha256(b'{}').hexdigest()}}
                if sequence:layer['sourceSequence']={'manifestPath':action+'/manifest.json','runtimeAdapterRequired':True}
                else:layer['animation']={'url':'/assets/effects/native/'+action+'/atlas.png'}
                entries['source:'+action]={'sourceOnly':True,'source':archive.record(logical),'layers':[layer]}
            original=copy.deepcopy(entries)
            (prepared/'index.json').write_text(json.dumps({'effects':{},'deferred':{},'sourceExports':entries}))
            with patch.object(sys,'argv',['resolve_effect_bindings.py','--source',str(source),'--project',str(project),'--prepared',str(prepared)]),contextlib.redirect_stdout(io.StringIO()):main()
            index=json.loads((prepared/'index.json').read_bytes())
            self.assertEqual(set(index['effects']),{'7'});self.assertEqual(set(index['sourceBundles']),{'9'})
            self.assertEqual(index['sourceExports'],original);self.assertNotIn('8',index['effects'])
            self.assertTrue(index['sourceBundles']['9']['layers'][0]['sourceSequence']['runtimeAdapterRequired'])

if __name__=='__main__':unittest.main()
