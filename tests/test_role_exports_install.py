import copy,hashlib,json,struct,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from original_archive import OriginalArchive
from role_export_contract import role_export_facts
from install_source_exports import publish,entry_digest

def tag(kind,payload=b''):return struct.pack('<H',(kind<<6)|len(payload))+payload

class RoleVisualInstallTests(unittest.TestCase):
    def fixture(self,root):
        original=root/'original';project=root/'project';stage=root/'stage';logical='assets/battle/role/left/13000101.swf'
        (original/'manifestos').mkdir(parents=True)
        (original/'manifestos/inventory.json').write_text(json.dumps([{'original_path':logical,'version':'v1','category':'effects'}]))
        sprite=struct.pack('<HH',7,2)+tag(1)+tag(1)+tag(0)
        body=b'\x08\x00\x00\x18\x01\x00'+tag(39,sprite)+tag(76,struct.pack('<HH',1,7)+b'shang\0')+tag(0)
        source=original/'effects/v1'/logical;source.parent.mkdir(parents=True);source.write_bytes(b'FWS\x09'+struct.pack('<I',8+len(body))+body)
        archive=OriginalArchive(original);evidence=archive.record(logical)
        ident='source:'+hashlib.sha256(logical.encode()).hexdigest()[:16]+':'+hashlib.sha256(b'shang').hexdigest()[:12]
        job={'key':ident,'resource':logical,'action':'shang','sourceKind':'role-left-exported-sprite','source':evidence,'symbolId':7,'authoredFrames':2,'rootFps':24.0}
        relative='rolehash/actionhash/atlas.webp';bitmap=stage/relative;bitmap.parent.mkdir(parents=True);bitmap.write_bytes(b'previously-proven-graphics')
        (bitmap.parent/'manifest.json').write_text('{}');(bitmap.parent/'effect-atlas.json').write_text('{}')
        entry={'id':ident,'sourceOnly':True,'sourceKind':'role-left-exported-sprite','bindingOrigin':'exported-source-action-not-a-skill-id',
               'source':evidence,'sourceConfig':evidence,'sourceExport':role_export_facts(archive,job),'definition':{'frontAction':'shang'},
               'layers':[{'action':'shang','plane':'front','namedInstances':[],'validation':{'nativeFrames':2},
               'animation':{'url':'/assets/effects/native/'+relative,'packedAtlasUrl':'/assets/effects/native/rolehash/actionhash/effect-atlas.json','sourcePixelScale':1,'fps':24,'timeline':[0,0]},
               'artifactsSha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in bitmap.parent.iterdir()}}]}
        (stage/'index.json').write_text(json.dumps({'sourceExports':{ident:entry}}))
        before={'version':1,'effects':{'2015':{'preserve':True}},'sourceBundles':{},'deferred':{'custom':{'preserve':True}}}
        index=project/'public/assets/effects/native/index.json';index.parent.mkdir(parents=True);index.write_text(json.dumps(before))
        proof=stage/'proof.json';proof.write_text(json.dumps({'rows':[{'id':ident,'action':'shang','plane':'front','frames':2,'sourcePixelScale':1,'sourceRoleExportMatch':True,'sourceEntrySha256':entry_digest(entry),'allSourceRenderedFramesReconstructed':True,'artifactsSha256Match':True,'originalArchiveVerified':True}]}))
        return project,stage,archive,ident,proof,before,index

    def test_explicit_role_publication_preserves_live_bindings_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as temp:
            p,s,a,i,proof,before,index=self.fixture(Path(temp))
            result=publish(p,s,a,[i],[proof],source_kind='role-left-exported-sprite');self.assertEqual(result['added'],[i])
            after=json.loads(index.read_bytes());self.assertIn(i,after.pop('sourceExports'));self.assertEqual(after,before)
            saved=index.read_bytes();result=publish(p,s,a,[i],[proof],source_kind='role-left-exported-sprite');self.assertEqual(result['alreadyCurrent'],[i]);self.assertEqual(index.read_bytes(),saved)

    def test_default_battle_publication_never_accepts_role(self):
        with tempfile.TemporaryDirectory() as temp:
            p,s,a,i,proof,before,index=self.fixture(Path(temp));saved=index.read_bytes()
            with self.assertRaisesRegex(ValueError,'explicit publication'):publish(p,s,a,[i],[proof])
            self.assertEqual(index.read_bytes(),saved)

    def test_original_role_proof_is_required_even_if_generic_pixel_proof_exists(self):
        with tempfile.TemporaryDirectory() as temp:
            p,s,a,i,proof,before,index=self.fixture(Path(temp));saved=index.read_bytes()
            data=json.loads(proof.read_bytes());del data['rows'][0]['sourceRoleExportMatch'];proof.write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError,'role export proof'):publish(p,s,a,[i],[proof],source_kind='role-left-exported-sprite')
            self.assertEqual(index.read_bytes(),saved)

    def test_forged_source_facts_are_rejected_even_with_matching_entry_hash(self):
        for field,value in [('symbolId',8),('fps',12),('authoredFrames',1)]:
            with self.subTest(field=field),tempfile.TemporaryDirectory() as temp:
                p,s,a,i,proof,before,index=self.fixture(Path(temp));saved=index.read_bytes()
                data=json.loads((s/'index.json').read_bytes());entry=data['sourceExports'][i];entry['sourceExport'][field]=value;(s/'index.json').write_text(json.dumps(data))
                report=json.loads(proof.read_bytes());report['rows'][0]['sourceEntrySha256']=entry_digest(entry);proof.write_text(json.dumps(report))
                with self.assertRaises(ValueError):publish(p,s,a,[i],[proof],source_kind='role-left-exported-sprite')
                self.assertEqual(index.read_bytes(),saved)

if __name__=='__main__':unittest.main()
