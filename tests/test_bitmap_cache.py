import struct,sys,tempfile,unittest,zlib
from pathlib import Path
from PIL import Image
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
import entity_pipeline as pipeline
from bitmap_cache import BitmapCache

def source_swf(color):
    xml=b'<actions frameRate="24"><asset id="0" className="body" x="0" y="0"/><action name="A_1hit"><layer><frame index="0" length="1"><element assetId="0" alpha=".5"/></frame></layer></action><action name="SP_skill1"><layer><frame index="0" length="1"><element assetId="0"/></frame></layer></action></actions>'
    def tag(kind,data):return struct.pack('<H',kind<<6|63)+struct.pack('<I',len(data))+data
    bitmap=struct.pack('<HBHH',7,5,2,2)+zlib.compress(bytes((255,*color))*4)
    data=b'\x08\x00'+struct.pack('<HH',24<<8,1)+tag(36,bitmap)+tag(87,struct.pack('<HI',8,0)+xml)+tag(76,struct.pack('<HH',2,7)+b'body\0'+struct.pack('<H',8)+b'Config\0')+b'\x00\x00'
    return b'FWS\x09'+struct.pack('<I',8+len(data))+data

class BitmapCacheTests(unittest.TestCase):
    def test_alpha_does_not_mutate_cached_source_and_equal_ids_cannot_mix_models(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);red=root/'red.swf';blue=root/'blue.swf';red.write_bytes(source_swf((255,0,0)));blue.write_bytes(source_swf((0,0,255)));cache=BitmapCache(8)
            values=[]
            for index,(path,action) in enumerate([(red,'A_1hit'),(red,'SP_skill1'),(blue,'SP_skill1')]):
                out=root/str(index);pipeline.convert(path,out,'/out','battle',only={action},compact=True,image_cache=cache)
                with Image.open(out/(action+'.png')) as image:values.append(image.convert('RGBA').getpixel((0,0)))
            self.assertEqual(values,[(255,0,0,128),(255,0,0,255),(0,0,255,255)])
            self.assertLessEqual(cache.pixels,8)
            with self.assertRaisesRegex(ValueError,'source-bitmap-pixel-budget'):pipeline.read_actions(red,max_image_pixels=3,only_actions={'SP_skill1'},image_cache=cache)

if __name__=='__main__':unittest.main()
