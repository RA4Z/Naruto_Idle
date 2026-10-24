import hashlib
import io
from pathlib import Path
import struct
import sys
import unittest
import xml.etree.ElementTree as ET
from PIL import Image
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from role_shadow_data import exact_asset, embedded_png


class RoleShadowTests(unittest.TestCase):
    def test_exact_name_does_not_alias_plain_shadow_or_different_suffix(self):
        root = ET.fromstring('<actions><asset assetName="yingzi(1).png" className="Asset_791" x="-106" y="-36"/></actions>')
        result=exact_asset(root, {'Asset_791': 1}, 'yingzi(1).png')
        self.assertEqual(result['asset']['y'], '-36')
        for name in ('yingzi.png', 'yingzi(2).png'):
            with self.assertRaises(ValueError): exact_asset(root, {'Asset_791': 1}, name)

    def test_embedded_png_preserves_rgba_and_rejects_extra_alpha_or_truncation(self):
        output=io.BytesIO()
        with Image.new('RGBA',(2,1),(0,0,0,127)) as image:
            image.save(output,format='PNG');expected=hashlib.sha256(image.tobytes()).hexdigest()
        raw=output.getvalue();payload=struct.pack('<HI',1,len(raw))+raw
        self.assertEqual(embedded_png(payload)['rgbaSha256'],expected)
        for bad in (payload[:-1],payload+b'extra-alpha',payload[:4]):
            with self.assertRaises(ValueError):embedded_png(bad)

    def test_ambiguous_shared_name_never_picks_first_asset(self):
        root=ET.fromstring('<actions><asset assetName="same" className="A"/><asset assetName="same" className="B"/></actions>')
        with self.assertRaises(ValueError):exact_asset(root,{'A':1,'B':2},'same')


if __name__=='__main__':unittest.main()
