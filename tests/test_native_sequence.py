import hashlib,json,sys,tempfile,unittest
from pathlib import Path
from PIL import Image
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from pack_native_sequence import pack_sequence
from validate_native_effects import validate_sequence

class NativeSequenceTests(unittest.TestCase):
    def test_full_frames_registration_transparency_and_repeats_are_lossless(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);native=root/'native';native.mkdir()
            for index,x in enumerate((2,2,7)):
                image=Image.new('RGBA',(12,10));image.putpixel((x,3),(12,80,190,81));image.save(native/f'{index:04d}.png')
            (native/'render.json').write_text(json.dumps({'staticOnly':True,'frameCount':3,'rectTwips':[-80,-100,160,100],'fps':24}))
            data,proof=pack_sequence(native,root/'out')
            self.assertEqual(data['timeline'],[0,0,1]);self.assertEqual(len(data['frameFiles']),2)
            self.assertEqual(data['origin'],[4/12,5/10]);self.assertEqual(data['frameSize'],[12,10])
            self.assertEqual(data['state'],'source-frames-complete-runtime-adapter-pending')
            self.assertTrue(proof['allFramesPixelExact'])
            for time,unique in enumerate(data['timeline']):
                with Image.open(native/f'{time:04d}.png') as a,Image.open(root/'out'/data['frameFiles'][unique]) as b:
                    self.assertEqual(a.convert('RGBA').tobytes(),b.convert('RGBA').tobytes())

    def test_independent_validation_rejects_timing_origin_and_pixel_corruption(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);native=root/'native';native.mkdir();output=root/'out'
            for index in range(2):Image.new('RGBA',(8,6),(20,40,180,120+index)).save(native/f'{index:04d}.png')
            (native/'render.json').write_text(json.dumps({'staticOnly':True,'frameCount':2,'rectTwips':[-40,-60,120,60],'fps':24}))
            data,proof=pack_sequence(native,output)
            layer={'validation':proof}
            def hashes():layer['artifactsSha256']={name:hashlib.sha256((output/name).read_bytes()).hexdigest() for name in (*data['frameFiles'],'manifest.json')}
            hashes();self.assertEqual(validate_sequence(output,layer),2)
            original=(output/'manifest.json').read_bytes()
            data['origin'][0]=0.9;(output/'manifest.json').write_text(json.dumps(data));hashes()
            with self.assertRaises(AssertionError):validate_sequence(output,layer)
            (output/'manifest.json').write_bytes(original);data=json.loads(original)
            data['timeline']=[0,0];(output/'manifest.json').write_text(json.dumps(data));hashes()
            with self.assertRaises(AssertionError):validate_sequence(output,layer)
            (output/'manifest.json').write_bytes(original);data=json.loads(original)
            Image.new('RGBA',(8,6),(10,10,10,255)).save(output/data['frameFiles'][0],lossless=True,exact=True);hashes()
            with self.assertRaises(AssertionError):validate_sequence(output,layer)

if __name__=='__main__':unittest.main()
