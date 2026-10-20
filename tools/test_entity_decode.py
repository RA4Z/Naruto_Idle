import unittest,struct,zlib
from entity_pipeline import lossless
def data(fmt,w,h,payload):return struct.pack('<HBHH',1,fmt,w,h)+payload
class LosslessTests(unittest.TestCase):
 def test_argb_unpremultiplication_and_zero_alpha(self):
  _,im=lossless(data(5,2,1,zlib.compress(bytes([128,64,32,16,0,255,255,255]))),True)
  self.assertEqual(im.getpixel((0,0)),(128,64,32,128));self.assertEqual(im.getpixel((1,0)),(0,0,0,0))
 def test_rgb_padding_is_not_alpha(self):
  _,im=lossless(data(5,1,1,zlib.compress(bytes([0,18,52,86]))),False)
  self.assertEqual(im.getpixel((0,0)),(18,52,86,255))
 def test_palette_and_four_byte_row_padding(self):
  palette=bytes([0,0,0,0,64,32,16,128]);row=bytes([1,0,0,0])
  _,im=lossless(data(3,2,1,bytes([1])+zlib.compress(palette+row)),True)
  self.assertEqual(im.getpixel((0,0)),(128,64,32,128));self.assertEqual(im.getpixel((1,0)),(0,0,0,0))
if __name__=='__main__':unittest.main()
