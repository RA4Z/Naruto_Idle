import io,unittest,json,tempfile,hashlib
from pathlib import Path
from PIL import Image
from recover_native_foreground import compose_foreground,recover

class NativeForegroundTests(unittest.TestCase):
    def test_uses_alpha_palette_and_source_rect_without_covering_ground(self):
        alpha=Image.new('P',(256,256));alpha.putpalette([0,0,0]*256);alpha.info['transparency']=bytes([0,85,170])
        alpha.paste(2,(40,30,90,80));alpha.paste(1,(45,30,55,40))
        front=[{'imgX':'0','imgY':'0','offsetX':'40','offsetY':'30','width':'50','height':'50','url':'virtual.png'}]
        def source(_):return Image.new('RGB',(256,256),(40,120,180))
        fg=compose_foreground([{'imgX':'0','imgY':'0','url':'real.jpg'}],front,alpha,(512,256),source)
        self.assertEqual(fg.getpixel((60,50)),(40,120,180,170))
        self.assertEqual(fg.getpixel((50,35)),(40,120,180,85))
        self.assertEqual(fg.getpixel((20,20))[3],0)
        self.assertEqual(fg.getpixel((300,20))[3],0)
        self.assertEqual(fg.getbbox(),(40,30,90,80))

    def test_rejects_rectangles_crossing_source_tile(self):
        with self.assertRaises(ValueError):
            compose_foreground([{'imgX':'0','imgY':'0','url':'real.jpg'}],[{'imgX':'0','imgY':'0','offsetX':'250','offsetY':'0','width':'20','height':'10'}],Image.new('RGBA',(256,256)),(256,256),lambda _:Image.new('RGB',(256,256)))

    def test_recovers_genuinely_empty_native_front_without_inventing_pixels(self):
        alpha=io.BytesIO();Image.new('RGBA',(8,8)).save(alpha,format='PNG')
        data={'assets/scene/map/123/_scene_bg.xml':b'<map/>',
              'assets/scene/map/123/_scene_fg.xml':b'<map/>',
              'assets/scene/map/123/alphaMap.png':alpha.getvalue()}
        class Archive:
            def raw(self,name):return data[name]
            def data(self,name):return data[name]
            def record(self,name):return {'path':name,'sha256':hashlib.sha256(data[name]).hexdigest()}
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);folder=root/'public/assets/maps/123';folder.mkdir(parents=True)
            (root/'public/assets/catalog').mkdir(parents=True)
            Image.new('RGB',(8,8),(120,140,160)).save(folder/'background.png')
            Image.new('RGBA',(8,8)).save(folder/'foreground.png')
            (folder/'manifest.json').write_text(json.dumps({'background':'/assets/maps/123/background.png','layers':{}}),encoding='utf-8')
            row,manifest=recover(Archive(),'123',root)
            self.assertTrue(manifest['layers']['nativeForeground']['emptyNativeLayer'])
            self.assertEqual(row['foreground']['alphaLevels'],[0])
            self.assertEqual(row['foreground']['nontransparentPixels'],0)
            with Image.open(folder/'foreground.webp') as result:self.assertIsNone(result.getbbox())

if __name__=='__main__':unittest.main()
