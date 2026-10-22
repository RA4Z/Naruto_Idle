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

if __name__=='__main__':unittest.main()
