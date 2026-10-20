import io,unittest
from PIL import Image
from recover_native_foreground import compose_foreground

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

if __name__=='__main__':unittest.main()
