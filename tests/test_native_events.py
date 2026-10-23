import sys,unittest,xml.etree.ElementTree as ET
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from prepare_native_catalog import native_event_frames

class NativeEventTests(unittest.TestCase):
    def test_combined_events_keep_their_actual_source_frame(self):
        action=ET.fromstring('<action><layer><frame index="3" event="hit,playSkillEffect"/><frame index="8" event="playSkillEffect,playShake:1"/><frame index="9" event="otherplaySkillEffect"/></layer><layer><frame index="3" event="playSkillEffect"/><frame index="4"/></layer></action>')
        self.assertEqual(native_event_frames(action,'playSkillEffect'),[3,8])
        self.assertEqual(native_event_frames(action,'hit'),[3])
        self.assertEqual(native_event_frames(action,'missing'),[])

if __name__=='__main__':unittest.main()
