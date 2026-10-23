import copy,hashlib,json,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from original_archive import OriginalArchive
from install_source_exports import publish,entry_digest

class SourceExportInstallTests(unittest.TestCase):
    def fixture(self,root):
        original=root/'original';project=root/'project';stage=root/'stage';logical='assets/battle/effect/demo.swf'
        (original/'manifestos').mkdir(parents=True)
        (original/'manifestos/inventory.json').write_text(json.dumps([{'original_path':logical,'version':'v1','category':'effects'}]))
        source=original/'effects/v1'/logical;source.parent.mkdir(parents=True);source.write_bytes(b'original-static-graphics')
        archive=OriginalArchive(original);evidence=archive.record(logical);ident='source:'+hashlib.sha256(logical.encode()).hexdigest()[:16]+':'+hashlib.sha256(b'1').hexdigest()[:12]
        relative='sourcehash/actionhash/atlas.webp';bitmap=stage/relative;bitmap.parent.mkdir(parents=True);bitmap.write_bytes(b'previously-validated-raster')
        (bitmap.parent/'manifest.json').write_text('{}');(bitmap.parent/'effect-atlas.json').write_text('{}')
        hashes={path.name:hashlib.sha256(path.read_bytes()).hexdigest() for path in bitmap.parent.iterdir()}
        entry={'id':ident,'sourceOnly':True,'bindingOrigin':'exported-source-action-not-a-skill-id','source':evidence,'sourceConfig':evidence,'definition':{'frontAction':'1'},'layers':[{'action':'1','plane':'front','animation':{'url':'/assets/effects/native/'+relative,'packedAtlasUrl':'/assets/effects/native/sourcehash/actionhash/effect-atlas.json','sourcePixelScale':1,'timeline':[0,0]},'artifactsSha256':hashes}]}
        (stage/'index.json').write_text(json.dumps({'sourceExports':{ident:entry}}))
        current={'version':1,'effects':{'2015':{'preserveBinding':True}},'sourceBundles':{'2213':{'adapterPending':True}},'deferred':{'custom':{'preserve':True}},'custom':{'playerState':'untouched'}}
        index=project/'public/assets/effects/native/index.json';index.parent.mkdir(parents=True);index.write_text(json.dumps(current))
        proof=stage/'proof.json';proof.write_text(json.dumps({'rows':[{'id':ident,'action':'1','plane':'front','frames':2,'sourcePixelScale':1,'sourceEntrySha256':entry_digest(entry),'allSourceRenderedFramesReconstructed':True,'artifactsSha256Match':True,'originalArchiveVerified':True}]}))
        return project,stage,archive,ident,proof,current,bitmap,source

    def test_review_only_addition_preserves_live_bindings_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as temp:
            project,stage,archive,ident,proof,before,bitmap,source=self.fixture(Path(temp))
            result=publish(project,stage,archive,[ident],[proof]);self.assertEqual(result['added'],[ident])
            index=project/'public/assets/effects/native/index.json';after=json.loads(index.read_bytes());self.assertIn(ident,after.pop('sourceExports'));self.assertEqual(after,before)
            unchanged=index.read_bytes();again=publish(project,stage,archive,[ident],[proof]);self.assertEqual(again['alreadyCurrent'],[ident]);self.assertEqual(index.read_bytes(),unchanged)

    def test_stale_entry_changed_pixels_or_source_and_existing_collision_do_not_modify_index(self):
        for kind in ('entry','pixels','original','target','proof'):
            with self.subTest(kind=kind),tempfile.TemporaryDirectory() as temp:
                project,stage,archive,ident,proof,before,bitmap,source=self.fixture(Path(temp));index=project/'public/assets/effects/native/index.json';unchanged=index.read_bytes()
                if kind=='entry':
                    data=json.loads((stage/'index.json').read_bytes());data['sourceExports'][ident]['custom']='changed';(stage/'index.json').write_text(json.dumps(data))
                elif kind=='pixels':bitmap.write_bytes(b'tampered')
                elif kind=='original':source.write_bytes(b'changed-original')
                elif kind=='target':
                    target=project/'public/assets/effects/native/sourcehash/actionhash/atlas.webp';target.parent.mkdir(parents=True);target.write_bytes(b'preserve-current')
                else:
                    data=json.loads(proof.read_bytes());data['rows'][0]['allSourceRenderedFramesReconstructed']=False;proof.write_text(json.dumps(data))
                with self.assertRaises(ValueError):publish(project,stage,archive,[ident],[proof])
                self.assertEqual(index.read_bytes(),unchanged)

    def test_generated_artifact_cannot_escape_review_folder(self):
        with tempfile.TemporaryDirectory() as temp:
            project,stage,archive,ident,proof,before,bitmap,source=self.fixture(Path(temp));data=json.loads((stage/'index.json').read_bytes());entry=data['sourceExports'][ident]
            entry['layers'][0]['animation']['url']='/assets/effects/native/../../escape.png';(stage/'index.json').write_text(json.dumps(data))
            data=json.loads(proof.read_bytes());data['rows'][0]['sourceEntrySha256']=entry_digest(entry);proof.write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError,'escapes'):publish(project,stage,archive,[ident],[proof])

    def test_existing_manual_review_change_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as temp:
            project,stage,archive,ident,proof,before,bitmap,source=self.fixture(Path(temp));publish(project,stage,archive,[ident],[proof])
            index=project/'public/assets/effects/native/index.json';data=json.loads(index.read_bytes());data['sourceExports'][ident]['reviewNote']='preserve current edit';index.write_text(json.dumps(data));unchanged=index.read_bytes()
            with self.assertRaisesRegex(ValueError,'Existing review entry changed'):publish(project,stage,archive,[ident],[proof])
            self.assertEqual(index.read_bytes(),unchanged)

    def test_full_frame_sequence_stays_outside_public_and_keeps_adapter_pending(self):
        with tempfile.TemporaryDirectory() as temp:
            project,stage,archive,ident,proof,before,bitmap,source=self.fixture(Path(temp));data=json.loads((stage/'index.json').read_bytes());entry=data['sourceExports'][ident];layer=entry['layers'][0]
            folder=stage/'sourcehash/actionhash/source-sequence';folder.mkdir();(folder/'0.webp').write_bytes(bitmap.read_bytes())
            (folder/'manifest.json').write_text(json.dumps({'state':'source-frames-complete-runtime-adapter-pending','frameFiles':['0.webp'],'timeline':[0,0]}))
            del layer['animation'];layer['sourceSequence']={'manifestPath':'sourcehash/actionhash/source-sequence/manifest.json','runtimeAdapterRequired':True}
            layer['artifactsSha256']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in folder.iterdir()};(stage/'index.json').write_text(json.dumps(data))
            record=json.loads(proof.read_bytes());record['rows'][0]['sourceEntrySha256']=entry_digest(entry);proof.write_text(json.dumps(record))
            result=publish(project,stage,archive,[ident],[proof]);self.assertEqual(result['added'],[ident])
            self.assertTrue((project/'asset-source/native-effects/sourcehash/actionhash/source-sequence/0.webp').is_file())
            self.assertFalse((project/'public/assets/effects/native/sourcehash/actionhash/source-sequence/0.webp').exists())

if __name__=='__main__':unittest.main()
