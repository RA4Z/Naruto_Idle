import copy,sys,unittest,xml.etree.ElementTree as ET
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from recover_bound_effects import source_action_data
from validate_native_effects import validate_action_metadata

class MMESourceActionTests(unittest.TestCase):
    def test_named_points_events_registration_and_tween_keys_are_preserved(self):
        root=ET.fromstring('''<actions frameRate="24"><asset id="7" className="Asset_7" x="-4.125" y="-10"/><asset id="9"/><action name="attack"><layer id="3"><frame index="2" length="4" tween="true" event="playSkillEffect,hit" sound="hit.mp3"><pointElement name="hand" x="1.25" y="-8"/></frame><frame index="6" length="2"><element assetId="7" scaleX="-1"/></frame></layer></action></actions>''')
        result=source_action_data(root,{'configuration':'ConfigAMF','configurationSha256':'pinned'},'attack')
        self.assertEqual(result['assetRegistrations'],[dict(root.find('asset').attrib)])
        frame=ET.fromstring(result['actionXml']).find('.//frame')
        self.assertEqual(frame.get('event'),'playSkillEffect,hit');self.assertEqual(frame.get('tween'),'true')
        self.assertEqual(result['namedPoints'][0]['frame']['length'],'4')
        self.assertEqual(result['namedPoints'][0]['point'],{'name':'hand','x':'1.25','y':'-8'})
        self.assertTrue(validate_action_metadata(root,result['configurationEvidence'],'attack',result))
        for field in ('actionXml','assetRegistrations','namedPoints','configurationEvidence','fps'):
            changed=copy.deepcopy(result);changed[field]='tampered'
            with self.subTest(field=field),self.assertRaises(AssertionError):validate_action_metadata(root,result['configurationEvidence'],'attack',changed)
        with self.assertRaises(ValueError):source_action_data(root,{},'attack ')

if __name__=='__main__':unittest.main()
