import sys,unittest,xml.etree.ElementTree as ET
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from audit_config_parity import semantic

class ConfigParityTests(unittest.TestCase):
    def test_external_placeholder_ids_do_not_hide_real_name_or_transform_differences(self):
        template='<actions frameRate="24"><action name="attack"><layer><frame index="0" length="2"><element {attrs}/></frame></layer></action></actions>'
        xml=ET.fromstring(template.format(attrs='extname="yingzi(1).png" x="1.25"'))
        amf=ET.fromstring(template.format(attrs='assetId="-1" extname="yingzi(1).png" x="1.25" alpha="1" scaleX="1" scaleY="1"'))
        self.assertEqual(semantic(xml),semantic(amf))
        amf.find('.//element').set('extname','yingzi.png');self.assertNotEqual(semantic(xml),semantic(amf))
        amf.find('.//element').set('extname','yingzi(1).png');amf.find('.//element').set('x','1.251')
        self.assertNotEqual(semantic(xml),semantic(amf))

if __name__=='__main__':unittest.main()
