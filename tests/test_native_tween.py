import sys,unittest,xml.etree.ElementTree as ET
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from native_tween import expand_tweens

class NativeTweenTests(unittest.TestCase):
    def test_linear_values_direct_rotation_and_keyframe_events(self):
        root=ET.fromstring('<actions><action name="entry"><layer><frame index="0" length="4" tween="true" event="hit" sound="7"><element assetId="1" x="0" y="8" rotation="340" alpha="1" color="ff123456"/></frame><frame index="4" length="1"><element assetId="1" x="40" y="0" rotation="-340" alpha="0" scaleX="2" color="ff000000"/></frame></layer></action></actions>')
        expanded=expand_tweens(root);frames=expanded.findall('.//frame');middle=frames[2].find('element')
        self.assertEqual(len(frames),5)
        self.assertEqual(float(middle.get('x')),20.)
        self.assertEqual(float(middle.get('y')),4.)
        self.assertEqual(float(middle.get('rotation')),0.)
        self.assertEqual(float(middle.get('scaleX')),1.5)
        self.assertEqual(float(middle.get('alpha')),.5)
        self.assertEqual(middle.get('color'),'ff123456')
        self.assertEqual(sum(f.get('event')=='hit' for f in frames),1)
        self.assertEqual(sum(f.get('sound')=='7' for f in frames),1)
        self.assertEqual(len(root.findall('.//frame')),2,'Source metadata is immutable')

    def test_different_asset_or_noncontiguous_key_is_held(self):
        for destination in ('<frame index="4" length="1"><element assetId="2" x="40"/></frame>','<frame index="5" length="1"><element assetId="1" x="40"/></frame>'):
            root=ET.fromstring('<actions><action><layer><frame index="0" length="4" tween="true"><element assetId="1" x="3"/></frame>'+destination+'</layer></action></actions>')
            self.assertEqual(expand_tweens(root).findall('.//frame')[2].find('element').get('x'),'3')

    def test_named_points_follow_the_same_source_clock(self):
        root=ET.fromstring('<actions><action><layer><frame index="2" length="2" tween="true"><pointElement name="origin" x="0" y="2"/></frame><frame index="4" length="1"><pointElement name="other" x="8" y="6"/></frame></layer></action></actions>')
        point=expand_tweens(root).findall('.//frame')[1].find('pointElement')
        self.assertEqual(point.get('name'),'origin')
        self.assertEqual(float(point.get('x')),4.)
        self.assertEqual(float(point.get('y')),4.)

if __name__=='__main__':unittest.main()
