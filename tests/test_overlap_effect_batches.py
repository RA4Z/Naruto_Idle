import copy,hashlib,json,sys,tempfile,threading,time,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
import overlap_effect_batches as pipe

def fixture(root):
    stage=root/'stage';stage.mkdir();aggregate=root/'aggregate';aggregate.mkdir()
    key='source:'+'a'*16+':'+'b'*12;relative='a/b';folder=stage/relative;folder.mkdir(parents=True)
    (folder/'frame.webp').write_bytes(b'controlled fixture bytes')
    entry={'source':{'path':'assets/battle/effect/test.swf'},'layers':[{'animation':{'url':'/assets/effects/native/a/b/frame.webp'},
        'artifactsSha256':{'frame.webp':hashlib.sha256((folder/'frame.webp').read_bytes()).hexdigest()}}]}
    index=pipe.empty_index();index['sourceExports'][key]=entry;pipe.write_json_atomic(stage/'index.json',index)
    item={'jobs':[{'key':key}],'ready':[key],'output':stage}
    row={'id':key,'sourceEntrySha256':hashlib.sha256(json.dumps(entry,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest(),
         'allSourceRenderedFramesReconstructed':True,'artifactsSha256Match':True,'originalArchiveVerified':True}
    proof=root/'proof.json';pipe.write_json_atomic(proof,{'effects':1,'rows':[row]})
    return stage,aggregate,item,proof,key,entry

class PipelineTests(unittest.TestCase):
    def test_validated_rasters_merge_and_metadata_stays_independent(self):
        with tempfile.TemporaryDirectory() as temp:
            stage,out,item,proof,key,entry=fixture(Path(temp));result=pipe.merge_batch(out,item,proof)
            self.assertEqual(result['sourceExports'][key],entry)
            self.assertEqual((out/'a/b/frame.webp').read_bytes(),(stage/'a/b/frame.webp').read_bytes())
            self.assertEqual(json.loads((stage/'index.json').read_bytes())['sourceExports'][key],entry)

    def test_mutated_entry_after_validation_does_not_enter_aggregate(self):
        with tempfile.TemporaryDirectory() as temp:
            stage,out,item,proof,key,entry=fixture(Path(temp));data=json.loads((stage/'index.json').read_bytes())
            data['sourceExports'][key]['source']['path']='changed';pipe.write_json_atomic(stage/'index.json',data)
            with self.assertRaisesRegex(ValueError,'Entry changed'):pipe.merge_batch(out,item,proof)
            self.assertFalse((out/'index.json').exists())

    def test_corrupted_raster_and_incomplete_proof_are_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            stage,out,item,proof,key,entry=fixture(Path(temp));(stage/'a/b/frame.webp').write_bytes(b'corrupt')
            with self.assertRaisesRegex(ValueError,'artifact changed'):pipe.merge_batch(out,item,proof)
            self.assertFalse((out/'index.json').exists())
            record=json.loads(proof.read_bytes());record['rows'][0]['allSourceRenderedFramesReconstructed']=False
            pipe.write_json_atomic(proof,record)
            with self.assertRaisesRegex(ValueError,'Unverified'):pipe.merge_batch(out,item,proof)

    def test_existing_unrelated_aggregate_is_preserved(self):
        with tempfile.TemporaryDirectory() as temp:
            stage,out,item,proof,key,entry=fixture(Path(temp));old=pipe.empty_index();old['effects']['2015']={'retained':'runtime binding'}
            pipe.write_json_atomic(out/'index.json',old);result=pipe.merge_batch(out,item,proof)
            self.assertEqual(result['effects'],old['effects'])
            changed=copy.deepcopy(result);changed['sourceExports'][key]['source']['path']='external version'
            pipe.write_json_atomic(out/'index.json',changed);before=(out/'index.json').read_bytes()
            with self.assertRaisesRegex(ValueError,'differing aggregate'):pipe.merge_batch(out,item,proof)
            self.assertEqual((out/'index.json').read_bytes(),before)

    def test_paths_cannot_escape_stage(self):
        with tempfile.TemporaryDirectory() as temp:
            for value in ('../source.swf','/absolute','C:/other','a\\b'):
                with self.assertRaises(ValueError):pipe.contained(Path(temp),value)

    def test_next_extraction_starts_while_previous_validation_is_active(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);args=SimpleNamespace(work=str(root/'work'),output=str(root/'out'),report=root/'cycle.json')
            report={'batches':[]};validating=threading.Event();next_started=threading.Event();merges=[]
            def prepare(a,b,r,**kw):return {'number':b['batch'],'root':r,'work':r,'output':r,'jobs':[{'key':str(b['batch'])}],'ready':[str(b['batch'])],'seconds':0}
            def extract(a,t,item,runner,**kw):
                if item['number']==2:
                    self.assertTrue(validating.wait(3));next_started.set()
                return item
            def validate(a,t,item,runner):
                if item['number']==1:validating.set();self.assertTrue(next_started.wait(3))
                return root/'proof.json'
            def merge(a,item,proof):
                self.assertTrue(next_started.is_set());merges.append(item['number'])
                value=pipe.empty_index();value['sourceExports'][str(item['number'])]={'source':{'path':'original'}};return value
            with patch.object(pipe,'prepare_batch',prepare),patch.object(pipe,'extract_batch',extract),patch.object(pipe,'validate_batch',validate),patch.object(pipe,'merge_batch',merge):
                pipe.run_pipeline(args,[{'batch':1},{'batch':2}],root,lambda:None,report,reuse=False)
            self.assertEqual(merges,[1,2]);self.assertEqual([r['batch'] for r in report['batches']],[1,2])

    def test_failed_validation_cancels_pipeline_without_merging(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);args=SimpleNamespace(work=str(root/'work'),output=str(root/'out'),report=root/'cycle.json')
            report={'batches':[]};started=threading.Event();cancelled=threading.Event()
            def prepare(a,b,r,**kw):return {'number':b['batch']}
            def extract(a,t,item,runner,**kw):
                if item['number']==2:
                    started.set();end=time.monotonic()+3
                    while not runner.stop and time.monotonic()<end:time.sleep(.01)
                    if runner.stop:cancelled.set()
                return item
            def validate(*a):self.assertTrue(started.wait(3));raise ValueError('original pixels differ')
            with patch.object(pipe,'prepare_batch',prepare),patch.object(pipe,'extract_batch',extract),patch.object(pipe,'validate_batch',validate),patch.object(pipe,'merge_batch') as merge:
                with self.assertRaisesRegex(ValueError,'original pixels'):pipe.run_pipeline(args,[{'batch':1},{'batch':2}],root,lambda:None,report,reuse=False)
                merge.assert_not_called()
            self.assertTrue(cancelled.is_set());self.assertEqual(report['state'],'stopped-pipeline-needs-review')

if __name__=='__main__':unittest.main()
