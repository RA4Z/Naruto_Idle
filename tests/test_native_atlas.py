import json,sys,tempfile,unittest
from pathlib import Path
from PIL import Image
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from pack_native_frames import pack

class NativeAtlasTests(unittest.TestCase):
    def test_pixels_transparency_registration_and_repeated_timeline_are_preserved(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);source=root/'frames';source.mkdir()
            for index,x in enumerate((2,2,5,None)):
                frame=Image.new('RGBA',(12,10))
                if x is not None:frame.putpixel((x,3),(45,167,220,126))
                frame.save(source/f'{index:04d}.png')
            (source/'render.json').write_text(json.dumps({'staticOnly':True,'frameCount':4,'rectTwips':[-80,-100,160,100],'fps':24}))
            animation,proof=pack(source,root/'packed','/assets/effects/test')
            self.assertEqual(animation['timeline'],[0,0,1,2])
            self.assertNotEqual(animation['frameOrigins'][0],animation['frameOrigins'][1])
            self.assertTrue(proof['allFramesPixelExact'])
            self.assertTrue(proof['originalCoordinatesPreserved'])
            self.assertEqual(proof['sourcePixelScale'],1)
            self.assertEqual(animation['frameSizes'],[(1,1)]*3)

    def test_no_silent_downscale_when_atlas_budget_is_exceeded(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);Image.new('RGBA',(20,20),'red').save(root/'0000.png')
            (root/'render.json').write_text(json.dumps({'staticOnly':True,'frameCount':1,'rectTwips':[0,0,400,400],'fps':24}))
            with self.assertRaisesRegex(ValueError,'no automatic downscaling'):
                pack(root,root/'packed','/test',pixel_budget=100)

    def test_missing_native_frames_are_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/'render.json').write_text(json.dumps({'staticOnly':True,'frameCount':2}))
            with self.assertRaisesRegex(ValueError,'incomplete'):pack(root,root/'packed','/test')

    def test_multiple_pages_preserve_timeline_without_downscaling(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);source=root/'frames';source.mkdir()
            for index,color in enumerate(('red','green','blue')):
                Image.new('RGBA',(80,80),color).save(source/f'{index:04d}.png')
            (source/'render.json').write_text(json.dumps({'staticOnly':True,'frameCount':3,'rectTwips':[-800,-800,800,800],'fps':24}))
            animation,proof=pack(source,root/'packed','/test',pixel_budget=12_000,atlas_format='webp',allow_pages=True)
            self.assertTrue(animation['multiAtlas'])
            self.assertEqual(animation['framePages'],[0,1,2])
            self.assertEqual(animation['timeline'],[0,1,2])
            self.assertEqual(len(animation['atlasPageUrls']),3)
            self.assertTrue(proof['allFramesPixelExact'])
            data=json.loads((root/'packed/effect-atlas.json').read_bytes())
            self.assertEqual([p['frames'][0]['filename'] for p in data['textures']],['0','1','2'])
            self.assertTrue(all(p['size']['w']*p['size']['h']<=12_000 for p in data['textures']))

    def test_lossless_webp_preserves_native_pixels_alpha_and_registration(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);source=root/'frames';source.mkdir()
            for index,x in enumerate((2,5,2)):
                frame=Image.new('RGBA',(12,10))
                for y in range(4):frame.putpixel((x,y),(17+y,111,230,37+y*60))
                frame.save(source/f'{index:04d}.png')
            (source/'render.json').write_text(json.dumps({'staticOnly':True,'frameCount':3,'rectTwips':[-80,-100,160,100],'fps':24}))
            png,first=pack(source,root/'png','/png')
            webp,second=pack(source,root/'webp','/webp',atlas_format='webp')
            self.assertEqual(first['frameRgbaSha256'],second['frameRgbaSha256'])
            self.assertEqual(png['timeline'],webp['timeline'])
            self.assertEqual(png['frameOrigins'],webp['frameOrigins'])
            self.assertTrue(second['allFramesPixelExact'])
            self.assertTrue(webp['url'].endswith('.webp'))
            self.assertEqual(json.loads((root/'webp/effect-atlas.json').read_text())['meta']['image'],'effect.webp')
            with Image.open(root/'png/effect.png') as a, Image.open(root/'webp/effect.webp') as b:
                self.assertEqual(a.convert('RGBA').tobytes(),b.convert('RGBA').tobytes())

if __name__=='__main__':unittest.main()
