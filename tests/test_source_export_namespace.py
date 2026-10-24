import hashlib,json,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from source_export_namespace import prepare_source_export_namespaces,entry_digest


class SourceExportNamespaceTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();root=Path(self.temp.name);self.project=root/'project';self.stage=root/'stage'
        self.key='source:'+'a'*16+':'+'b'*12;self.relative=Path('a'*16)/('b'*12)
        self.folder=self.stage/self.relative;self.folder.mkdir(parents=True)
        self.public=self.project/'public/assets/effects/native';self.public.mkdir(parents=True)
        self.prefix='/assets/effects/native/'+self.relative.as_posix()+'/'
        animation={'url':self.prefix+'effect.webp','packedAtlasUrl':self.prefix+'effect-atlas.json',
            'fps':23,'timeline':[0,1,0],'sourceBounds':[-20,0,20,20],'frameOrigins':[[0.5,0],[0.5,0]]}
        (self.folder/'effect.webp').write_bytes(b'fixed-pixel-encoded-bytes')
        (self.folder/'effect-atlas.json').write_text('{"meta":{"image":"effect.webp"}}',encoding='utf-8')
        (self.folder/'manifest.json').write_text(json.dumps({'animations':{'effect':animation}}),encoding='utf-8')
        hashes={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in self.folder.iterdir()}
        self.entry={'id':self.key,'sourceOnly':True,'source':{'path':'assets/battle/effect/test.swf'},
            'layers':[{'plane':'front','action':'1','animation':animation,'artifactsSha256':hashes,
                'validation':{'nativeFrames':3,'frameRgbaSha256':['0','1','0']}}]}
        self.save_stage();self.published={'effects':{},'sourceBundles':{},'sourceExports':{}};self.save_public()

    def save_stage(self):
        (self.stage/'index.json').write_text(json.dumps({'sourceExports':{self.key:self.entry}}),encoding='utf-8')
    def save_public(self):
        (self.public/'index.json').write_text(json.dumps(self.published),encoding='utf-8')
    def tearDown(self):self.temp.cleanup()

    def test_conflict_preserves_published_bundle_and_all_source_pixel_timing_fields(self):
        target=self.public/self.relative;target.mkdir(parents=True)
        (target/'effect-atlas.json').write_bytes(b'published-original')
        before_public=(self.public/'index.json').read_bytes();before_entry=json.loads(json.dumps(self.entry))
        result=prepare_source_export_namespaces(self.project,self.stage,[self.key])
        self.assertEqual(len(result['changed']),1)
        self.assertEqual((target/'effect-atlas.json').read_bytes(),b'published-original')
        self.assertEqual((self.public/'index.json').read_bytes(),before_public)
        after=json.loads((self.stage/'index.json').read_bytes())['sourceExports'][self.key]
        self.assertTrue(after['layers'][0]['animation']['url'].startswith('/assets/effects/native/source-exports/'))
        self.assertEqual(after['layers'][0]['validation'],before_entry['layers'][0]['validation'])
        for field in ('fps','timeline','sourceBounds','frameOrigins'):
            self.assertEqual(after['layers'][0]['animation'][field],before_entry['layers'][0]['animation'][field])
        self.assertEqual(prepare_source_export_namespaces(self.project,self.stage,[self.key])['changed'],[])

    def test_no_conflict_does_not_change_entry(self):
        before=(self.stage/'index.json').read_bytes()
        self.assertEqual(prepare_source_export_namespaces(self.project,self.stage,[self.key])['changed'],[])
        self.assertEqual((self.stage/'index.json').read_bytes(),before)

    def test_changed_prepared_bytes_and_already_published_identity_are_rejected(self):
        (self.folder/'effect.webp').write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError,'Prepared source artifact changed'):
            prepare_source_export_namespaces(self.project,self.stage,[self.key])
        self.setUp_published_case()
    def setUp_published_case(self):
        self.published['sourceExports'][self.key]=self.entry;self.save_public()
        with self.assertRaisesRegex(ValueError,'unpublished'):
            prepare_source_export_namespaces(self.project,self.stage,[self.key])

    def test_non_source_and_escaping_urls_are_never_relocated(self):
        self.entry['sourceOnly']=False;self.save_stage()
        with self.assertRaises(ValueError):prepare_source_export_namespaces(self.project,self.stage,[self.key])
        self.entry['sourceOnly']=True;self.entry['layers'][0]['animation']['url']='/assets/effects/native/../secret/effect.webp';self.save_stage()
        with self.assertRaises(ValueError):prepare_source_export_namespaces(self.project,self.stage,[self.key])

    def test_full_source_sequence_is_isolated_without_reencoding_or_changing_timeline(self):
        folder=self.folder/'source-sequence';folder.mkdir()
        (folder/'frame-a.webp').write_bytes(b'fixed-full-frame-pixels')
        data={'frameFiles':['frame-a.webp'],'timeline':[0,0,0],'fps':23}
        (folder/'manifest.json').write_text(json.dumps(data),encoding='utf-8')
        layer=self.entry['layers'][0];layer.pop('animation')
        layer['sourceSequence']={'manifestPath':(self.relative/'source-sequence/manifest.json').as_posix()}
        layer['artifactsSha256']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in folder.iterdir()}
        self.save_stage()
        old=self.project/'asset-source/native-effects'/self.relative/'source-sequence';old.mkdir(parents=True)
        (old/'manifest.json').write_bytes(b'published-sequence-kept')
        result=prepare_source_export_namespaces(self.project,self.stage,[self.key]);self.assertEqual(len(result['changed']),1)
        after=json.loads((self.stage/'index.json').read_bytes())['sourceExports'][self.key]['layers'][0]
        new=self.stage/Path(after['sourceSequence']['manifestPath']).parent
        self.assertEqual(json.loads((new/'manifest.json').read_bytes()),data)
        self.assertEqual((new/'frame-a.webp').read_bytes(),b'fixed-full-frame-pixels')
        self.assertEqual((old/'manifest.json').read_bytes(),b'published-sequence-kept')


if __name__=='__main__':unittest.main()
