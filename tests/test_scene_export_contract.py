import copy,hashlib,struct,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from scene_export_contract import scene_export_facts,validate_scene_entry

def tag(kind,payload=b''):
    return struct.pack('<H',(kind<<6)|len(payload))+payload

class Archive:
    def __init__(self,raw):self.data=raw
    def raw(self,logical):return self.data
    def record(self,logical):return {'path':logical,'sha256':hashlib.sha256(self.data).hexdigest()}

class SceneExportContractTests(unittest.TestCase):
    def fixture(self,extra=b''):
        logical='assets/role/npc/scene/npcres/demo.swf';action='shang'
        sprite=struct.pack('<HH',7,2)+tag(1)+extra+tag(1)+tag(0)
        body=b'\x08\x00\x00\x18\x01\x00'+tag(39,sprite)+tag(76,struct.pack('<HH',1,7)+action.encode()+b'\0')+tag(0)
        archive=Archive(b'FWS\x09'+struct.pack('<I',8+len(body))+body)
        key='source:'+hashlib.sha256(logical.encode()).hexdigest()[:16]+':'+hashlib.sha256(action.encode()).hexdigest()[:12]
        job={'key':key,'resource':logical,'action':action,'sourceKind':'scene-exported-sprite','source':archive.record(logical),'symbolId':7,'authoredFrames':2,'rootFps':24.0}
        return archive,job

    def test_original_export_and_entry_are_bound_to_source_and_timing(self):
        archive,job=self.fixture();facts=scene_export_facts(archive,job)
        self.assertEqual((facts['symbolId'],facts['authoredFrames'],facts['fps']),(7,2,24))
        entry={'id':job['key'],'sourceKind':job['sourceKind'],'sourceOnly':True,'source':job['source'],'sourceConfig':job['source'],'sourceExport':facts,
               'definition':{'frontAction':'shang'},'layers':[{'action':'shang','namedInstances':[],'validation':{'nativeFrames':2},'animation':{'fps':24,'timeline':[0,0]}}]}
        self.assertTrue(validate_scene_entry(archive,entry))
        for change in ('fps','frames','points'):
            bad=copy.deepcopy(entry)
            if change=='fps':bad['layers'][0]['animation']['fps']=12
            elif change=='frames':bad['layers'][0]['validation']['nativeFrames']=1
            else:bad['layers'][0]['namedInstances']=[{'name':'invented'}]
            with self.assertRaises(ValueError):validate_scene_entry(archive,bad)

    def test_kind_path_and_posdata_are_explicit(self):
        for delta in ({'sourceKind':'battle'}, {'resource':'assets/role/npc/scene/npcres/../escape.swf'}, {'action':'posData'}):
            archive,job=self.fixture();job.update(delta)
            with self.assertRaisesRegex(ValueError,'explicit scene visual'):scene_export_facts(archive,job)

    def test_source_symbol_fps_and_frame_drift_are_rejected(self):
        for field,value in [('source',{}),('key','changed'),('symbolId',8),('rootFps',12),('authoredFrames',1)]:
            archive,job=self.fixture();job[field]=value
            with self.assertRaises(ValueError):scene_export_facts(archive,job)

    def test_scripts_and_unknown_features_are_not_silently_accepted(self):
        for kind in (12,82,99):
            archive,job=self.fixture(tag(kind))
            with self.assertRaisesRegex(ValueError,'feature requires'):scene_export_facts(archive,job)

    def test_frame_labels_are_preserved_without_interpreting_as_attack_windows(self):
        archive,job=self.fixture(tag(43,b'impact\0'))
        facts=scene_export_facts(archive,job)
        self.assertEqual(facts['frameLabels'],[{'frame':1,'name':'impact','namedAnchor':False}])

    def test_named_visual_placements_require_point_adapter(self):
        archive,job=self.fixture(tag(26,b'\x26'))
        with self.assertRaisesRegex(ValueError,'point validation'):scene_export_facts(archive,job)

if __name__=='__main__':unittest.main()
