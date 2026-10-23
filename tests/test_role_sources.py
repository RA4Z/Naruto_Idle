import sys,unittest,xml.etree.ElementTree as ET
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from recover_role_sources import source_key,unsupported_action

class RoleSourceTests(unittest.TestCase):
    def test_left_right_and_scene_source_ids_stay_distinct_without_inventing_character_ids(self):
        paths=['assets/battle/role/left/11000101.swf','assets/battle/role/right/11000101.swf','assets/role/npc/scene/npcres/11000101_rpg.swf']
        keys=[source_key(path) for path in paths];self.assertEqual(len(set(keys)),3)
        self.assertTrue(all(key.startswith('role-source-') for key in keys))
        for path in ('assets/battle/effect/demo.swf','assets/battle/role/right/../secret.swf','C:/assets/battle/role/right/1.swf'):
            with self.subTest(path=path),self.assertRaises(ValueError):source_key(path)

    def test_body_renderer_never_silently_ignores_local_color_or_blend(self):
        action=ET.fromstring('<action><layer><frame><element assetId="7" x="0" blendMode="normal"/></frame></layer></action>')
        self.assertEqual(unsupported_action(action),[])
        action.find('.//element').set('color','ffff0000');self.assertEqual(unsupported_action(action),['color'])
        action.find('.//element').set('blendMode','add');self.assertEqual(unsupported_action(action),['blendMode','color'])
        action.find('.//element').set('extname','yingzi(1).png');self.assertEqual(unsupported_action(action),[])

if __name__=='__main__':unittest.main()
