import hashlib,os,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
import parallel_sequence_encode as encoding

class WindowsPathRegression(unittest.TestCase):
    def test_short_codec_temporary_preserves_pixels_near_windows_path_limit(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp).resolve();name='frame-'+'f'*24+'.webp'
            extension=max(1,245-len(str(root/name))-1)
            folder=root/('x'*extension);folder.mkdir()
            source=root/'source.png';target=folder/name
            Image.new('RGBA',(4,4),(17,29,43,123)).save(source)
            with Image.open(source) as image:rgba=hashlib.sha256(image.convert('RGBA').tobytes()).hexdigest()
            job={'source':str(source),'target':str(target),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
                'canvas':[4,4],'rgba':rgba}
            names=[];original=Image.Image.save
            def save(image,path,*a,**kw):
                names.append(Path(path));return original(image,path,*a,**kw)
            with patch.object(Image.Image,'save',save):encoding._encode(job)
            self.assertEqual(len(names),1);self.assertLessEqual(len(names[0].name),16)
            self.assertLessEqual(len(str(names[0])),250)
            self.assertGreater(len(str(target))+38,260)
            with Image.open(target) as image:self.assertEqual(hashlib.sha256(image.convert('RGBA').tobytes()).hexdigest(),rgba)
            self.assertFalse(names[0].exists());self.assertTrue(source.exists())

if __name__=='__main__':unittest.main()
