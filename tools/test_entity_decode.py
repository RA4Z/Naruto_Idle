import unittest,struct,zlib,tempfile
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import patch
from PIL import Image
from entity_pipeline import convert,read_actions
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
class ExternalSymbolTests(unittest.TestCase):
 def test_external_shadow_never_aliases_body_bitmap_zero(self):
  xml=b'<actions frameRate="24"><action name="C_idle"><layer><frame index="0" length="1"><element assetId="0"/><element assetId="0" extname="yingzi(1).png" x="50"/></frame></layer></action></actions>'
  root=ET.fromstring(xml);assets={'0':{'className':'body'}};images={1:Image.new('RGBA',(4,8),(255,0,0,255))}
  with tempfile.TemporaryDirectory() as temp,patch('entity_pipeline.read_actions',return_value=(root,assets,images,{'body':1},xml)):
   result=convert(Path('unused'),Path(temp),'/test','battle')
   a=result['animations']['C_idle'];self.assertEqual(a['frameWidth'],8)
   self.assertEqual(a['externalEffects'],['yingzi(1).png'])
   with Image.open(Path(temp)/'C_idle.png') as frame:self.assertEqual(frame.getbbox(),(2,2,6,10))
 def test_frame_window_excludes_cinematic_movement_from_bounds_and_timeline(self):
  xml=b'<actions frameRate="24"><action name="SP_skill1"><layer><frame index="0" length="3"><element assetId="0"/></frame><frame index="3" length="1"><element assetId="0" x="500"/></frame></layer></action></actions>'
  root=ET.fromstring(xml)
  with tempfile.TemporaryDirectory() as temp,patch('entity_pipeline.read_actions',return_value=(root,{'0':{'className':'body'}},{1:Image.new('RGBA',(4,8),(255,0,0,255))},{'body':1},xml)):
   a=convert(Path('unused'),Path(temp),'/test','battle',frame_limits={'SP_skill1':3})['animations']['SP_skill1']
   self.assertEqual(a['frameWidth'],8);self.assertEqual(a['timeline'],[0,0,0]);self.assertEqual(a['frames'],1)
 def test_canvas_budget_rejects_large_animation_before_allocating_frames(self):
  xml=b'<actions frameRate="24"><action name="SP_skill1"><layer><frame index="0" length="100"><element assetId="0"/></frame></layer></action></actions>'
  root=ET.fromstring(xml)
  with tempfile.TemporaryDirectory() as temp,patch('entity_pipeline.read_actions',return_value=(root,{'0':{'className':'body'}},{1:Image.new('RGBA',(4,8),(255,0,0,255))},{'body':1},xml)):
   with self.assertRaisesRegex(ValueError,'canvas-pixel-budget-exceeded'):convert(Path('unused'),Path(temp),'/test','battle',pixel_budget=1)
 def test_scoped_decode_skips_unused_bitmaps_before_memory_allocation(self):
  def tag(kind,payload):return struct.pack('<H',kind<<6|63)+struct.pack('<I',len(payload))+payload
  xml=b'<actions><action name="A_1hit"><layer><frame index="0" length="1"><element assetId="0"/></frame></layer></action><asset id="0" className="body"/><asset id="1" className="unused"/></actions>'
  small=struct.pack('<HBHH',1,5,1,1)+zlib.compress(bytes([255,20,30,40]))
  huge=struct.pack('<HBHH',2,5,5000,5000)+zlib.compress(b'')
  symbols=struct.pack('<HH',2,1)+b'body\0'+struct.pack('<H',2)+b'unused\0'
  body=b'\x08\x00'+struct.pack('<HH',24*256,1)+tag(36,small)+tag(36,huge)+tag(76,symbols)+tag(87,struct.pack('<HI',3,0)+xml)+b'\0\0'
  swf=b'FWS'+bytes([9])+struct.pack('<I',8+len(body))+body
  with tempfile.TemporaryDirectory() as temp:
   path=Path(temp)/'test.swf';path.write_bytes(swf)
   decoded=read_actions(path,max_image_pixels=4,only_actions={'A_1hit'})
   self.assertEqual(set(decoded[2]),{1});self.assertEqual(decoded[2][1].getpixel((0,0)),(20,30,40,255))
   with self.assertRaisesRegex(ValueError,'source-bitmap-pixel-budget-exceeded'):read_actions(path,max_image_pixels=4)
if __name__=='__main__':unittest.main()
