import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from mme_config import amf_to_xml

class MMEConfigTests(unittest.TestCase):
    def test_preferred_amf_keeps_numeric_tint_frame_and_bitmap_namespaces(self):
        element={'__class__':'alias::ElementData','assetId':7,'x':2.125,'y':-4,'color':{'empty':False,'color':0xff123456},'blendMode':'add','alpha':.5}
        data={'__class__':'alias::MmeData','frameRate':24,'advanced':False,'assetDatas':{'__dictionary__':[['Asset_7',{'className':'Asset_7','assetName':'body.png','x':-5,'y':-8}]]},
              'actionDatas':{'__vector__':[{'name':'attack','layerDatas':{'__vector__':[{'frameDatas':{'__vector__':[{'index':3,'length':2,'useTween':True,'event':'hit,playSkillEffect','element':element}]}}]}}]}}
        root=amf_to_xml(data);frame=root.find('.//frame');image=frame.find('element')
        self.assertEqual(root.find('asset').get('id'),'7')
        self.assertEqual(image.get('x'),'2.125');self.assertEqual(image.get('color'),'ff123456')
        self.assertEqual(image.get('blendMode'),'add');self.assertEqual(image.get('alpha'),'0.5')
        self.assertEqual(frame.get('event'),'hit,playSkillEffect');self.assertEqual(frame.get('index'),'3');self.assertEqual(frame.get('tween'),'true')
        data['assetDatas']['__dictionary__'].append(['',{'className':'','assetName':'unused.png','x':0,'y':0}])
        self.assertEqual(len(amf_to_xml(data).findall('asset')),1)
        element['assetName']=''
        with self.assertRaisesRegex(ValueError,'namespace|alias'):amf_to_xml(data)
        element['assetName']='Asset_7'
        data['advanced']=True
        with self.assertRaisesRegex(ValueError,'Advanced'):amf_to_xml(data)

if __name__=='__main__':unittest.main()
