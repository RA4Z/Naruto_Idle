import copy,hashlib,json,math,sys,tempfile,unittest
from pathlib import Path
from PIL import Image
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from reviewed_native_budget import reviewed_limit,preflight_atlas
from static_effect_export_contract import static_effect_export_facts
import test_static_effect_export_contract as fixture_source


class ReviewedNativeBudgetTests(unittest.TestCase):
    def fixture(self):
        archive,job=fixture_source.StaticEffectExportContractTests().fixture()
        fact=static_effect_export_facts(archive,job)
        bounds={'symbolId':7,'frames':2,'fps':24.0,'rectTwips':[-50000,0,50000,80000],
            'width':5001,'height':4001,'pixels':5001*4001,'rasterRendered':False}
        entry={'id':job['key'],'source':job['source'],'sourceConfig':job['source'],'sourceOnly':True,
            'sourceKind':job['sourceKind'],'definition':{'frontAction':'shang'},'sourceExport':fact,
            'offlineRenderBudget':{'maximumNativePixels':32_000_000,'maximumRuntimePagePixels':16_000_000,
                'maximumRuntimeAtlasPixels':64_000_000,'scope':'offline-native-render-and-proof-only','independentBounds':bounds},
            'layers':[{'action':'shang','namedInstances':[],'animation':{'sourceBounds':bounds['rectTwips'],'fps':24.0,'url':'/fixture.webp'},
                'validation':{'nativeFrames':2,'nativeCanvasSize':[5000,4000],'atlasPixels':64,'atlasPages':1}}]}
        return archive,entry,bounds

    def test_offline_limit_requires_original_source_and_fresh_independent_bounds(self):
        archive,entry,bounds=self.fixture();seen=[]
        def probe(job):seen.append(job);return copy.deepcopy(bounds)
        self.assertEqual(reviewed_limit(archive,entry,probe),32_000_000)
        self.assertEqual(seen[0]['source'],entry['source'])
        self.assertEqual(seen[0]['symbolId'],7)
        with self.assertRaises(ValueError):reviewed_limit(None,entry,probe)
        changed=dict(bounds,width=5002)
        with self.assertRaisesRegex(ValueError,'Fresh independent'):
            reviewed_limit(archive,entry,lambda _:changed)

    def test_runtime_limits_cannot_be_raised_or_replaced_by_large_sequence(self):
        archive,entry,bounds=self.fixture()
        for key,value in [('maximumNativePixels',64_000_000),('maximumRuntimePagePixels',32_000_000),
                          ('maximumRuntimeAtlasPixels',128_000_000)]:
            bad=copy.deepcopy(entry);bad['offlineRenderBudget'][key]=value
            with self.assertRaises(ValueError):reviewed_limit(archive,bad,lambda _:bounds)
        bad=copy.deepcopy(entry);bad['layers'][0]['sourceSequence']={'manifestPath':'large.json'}
        with self.assertRaisesRegex(ValueError,'bounded atlases'):
            reviewed_limit(archive,bad,lambda _:bounds)
        bad=copy.deepcopy(entry);bad['layers'][0]['validation'].pop('atlasPixels')
        with self.assertRaisesRegex(ValueError,'atlas limits'):
            reviewed_limit(archive,bad,lambda _:bounds)

    def test_original_fps_bounds_and_native_allocation_remain_exact(self):
        archive,entry,bounds=self.fixture()
        for key,value in [('fps',23),('sourceBounds',[0,0,1,1])]:
            bad=copy.deepcopy(entry);bad['layers'][0]['animation'][key]=value
            with self.assertRaises(ValueError):reviewed_limit(archive,bad,lambda _:bounds)
        bad=copy.deepcopy(entry);bad['layers'][0]['validation']['nativeCanvasSize']=[5001,4000]
        with self.assertRaisesRegex(ValueError,'allocation'):
            reviewed_limit(archive,bad,lambda _:bounds)

    def test_streaming_preflight_accounts_for_registration_and_repeated_crops(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);frames=[]
            for frame,x in enumerate((0,1,0)):
                image=Image.new('RGBA',(3,2));image.putpixel((x,1),(255,0,0,255))
                path=root/f'{frame:04d}.png';image.save(path)
                frames.append({'path':path.name,'rgbaSha256':hashlib.sha256(image.tobytes()).hexdigest()})
            identity={'facts':{'authoredFrames':3}}
            verified=lambda *_:(frames,{'rectTwips':[-20,0,40,40]})
            result=preflight_atlas(root,{},identity,verified)
            self.assertEqual(result['uniqueCrops'],2)
            self.assertEqual(result['uniqueCropPixels'],2)
            with self.assertRaises(ValueError):preflight_atlas(root,{},identity,verified,atlas_pixels=1)
            frames[0]['rgbaSha256']='0'*64
            with self.assertRaisesRegex(ValueError,'pixels changed'):
                preflight_atlas(root,{},identity,verified)


if __name__=='__main__':unittest.main()
