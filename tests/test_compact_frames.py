import json,struct,sys,tempfile,unittest,zlib
from pathlib import Path
from unittest.mock import patch
import xml.etree.ElementTree as ET
from PIL import Image
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
import entity_pipeline as pipeline

class CompactFramesTests(unittest.TestCase):
    def test_duplicate_source_bitmaps_fit_budget_without_merging_different_ground_positions(self):
        xml=b'<actions frameRate="24"><asset id="0" className="one" x="0" y="0"/><asset id="1" className="two" x="0" y="0"/><action name="A_1hit"><layer><frame index="0" length="1"><element assetId="0"/></frame><frame index="1" length="1"><element assetId="1"/></frame><frame index="2" length="1"><element assetId="1" x="20"/></frame></layer></action></actions>'
        def source(*args,**kwargs):
            root=ET.fromstring(xml)
            return root,{a.get('id'):a.attrib for a in root.findall('asset')},{7:Image.new('RGBA',(4,4),'red'),8:Image.new('RGBA',(4,4),'red')},{'one':7,'two':8},xml
        with tempfile.TemporaryDirectory() as temp,patch.object(pipeline,'read_actions',side_effect=source):
            result=pipeline.convert(Path(temp)/'source.swf',Path(temp)/'out','/out','battle',compact=True,pixel_budget=40)['animations']['A_1hit']
            self.assertEqual(result['timeline'],[0,0,1])
            self.assertEqual(result['frames'],2)
            self.assertNotEqual(result['frameOrigins'][0],result['frameOrigins'][1])

    def test_translation_and_timeline_reconstruct_identical_pixels(self):
        xml=b'<actions frameRate="24"><asset id="0" className="body" x="0" y="0"/><action name="A_1hit"><layer><frame index="0" length="2"><element assetId="0" x="0" y="-12"/></frame><frame index="2" length="2"><element assetId="0" x="1500" y="-12"/></frame></layer></action></actions>'
        def source(*args,**kwargs):
            root=ET.fromstring(xml)
            return root,{'0':root.find('asset').attrib},{7:Image.new('RGBA',(16,12),(120,40,200,255))},{'body':7},xml
        with tempfile.TemporaryDirectory() as temp,patch.object(pipeline,'read_actions',side_effect=source):
            root=Path(temp)
            full=pipeline.convert(root/'source.swf',root/'full','/full','battle')['animations']['A_1hit']
            compact=pipeline.convert(root/'source.swf',root/'compact','/compact','battle',compact=True,pixel_budget=8000000)['animations']['A_1hit']
            self.assertEqual(full['timeline'],compact['timeline']);self.assertEqual(full['fps'],compact['fps'])
            self.assertLess(compact['frameWidth']*compact['frameHeight'],full['frameWidth']*full['frameHeight']/50)
            sheets=[Image.open(root/sub/'A_1hit.png') for sub in ['full','compact']]
            for index in full['timeline']:
                canvases=[]
                for definition,sheet in zip([full,compact],sheets):
                    w,h=definition['frameWidth'],definition['frameHeight'];cols=sheet.width//w
                    frame=sheet.crop(((index%cols)*w,(index//cols)*h,(index%cols+1)*w,(index//cols+1)*h))
                    origin=definition.get('frameOrigins',[definition['origin']]*definition['frames'])[index]
                    canvas=Image.new('RGBA',(2400,60));canvas.alpha_composite(frame,(round(300-origin[0]*w),round(30-origin[1]*h)));canvases.append(canvas)
                self.assertEqual(canvases[0].tobytes(),canvases[1].tobytes())
            for sheet in sheets:sheet.close()

    def test_argb_unpremultiplication_preserves_rounding_and_zero_alpha(self):
        colors=[(0,12,43,20),(1,1,0,1),(127,63,10,60),(255,42,15,234)]
        raw=bytes(v for row in colors for v in row)
        payload=struct.pack('<HBHH',7,5,len(colors),1)+zlib.compress(raw)
        ident,image=pipeline.lossless(payload,True)
        expected=[tuple(min(255,(c*255+a//2)//a) for c in (r,g,b))+(a,) if a else (0,0,0,0) for a,r,g,b in colors]
        self.assertEqual(ident,7);self.assertEqual(list(image.getdata()),expected)

    def test_palette_alpha_and_row_padding(self):
        palette=bytes([64,32,0,128,0,0,0,0])
        payload=struct.pack('<HBHHB',9,3,2,1,1)+zlib.compress(palette+bytes([0,1,0,0]))
        _,image=pipeline.lossless(payload,True)
        self.assertEqual(list(image.getdata()),[(128,64,0,128),(0,0,0,0)])

if __name__=='__main__':unittest.main()
