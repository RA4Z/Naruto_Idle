import hashlib,json,os,sys,tempfile,threading,time,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
import balanced_action_extract as balanced
import extraction_resources as resources
import parallel_sequence_encode as encoding
import overlap_effect_batches as pipeline
from pack_native_sequence import pack_sequence
from PIL import Image

class BalancedTests(unittest.TestCase):
    def test_lossless_method_selection_preserves_full_timeline_and_rgba(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);native=root/'n';native.mkdir();policy=root/'policy.json'
            pipeline.write_json_atomic(native/'render.json',{'staticOnly':True,'frameCount':2,'fps':24,'rectTwips':[-20,-40,220,160]})
            for n in range(2):Image.new('RGBA',(12,10),(33+n,77,91,0 if n==0 else 128)).save(native/f'{n:04d}.png')
            results=[]
            for method in (4,2,0):
                pipeline.write_json_atomic(policy,{'enabled':True,'maximumEncodingWorkers':2,'sourceSequenceWebPMethod':method})
                with patch.object(encoding,'POLICY',policy):results.append(pack_sequence(native,root/f'o{method}',workers=2))
            self.assertEqual(results[0],results[1]);self.assertEqual(results[1],results[2])

    def test_admission_accounts_for_unspent_reservations_and_cpu(self):
        g=resources.GIB
        self.assertTrue(resources.may_start(12*g,4*g,1*g,2,4,10))
        self.assertFalse(resources.may_start(8*g,4*g,1*g,2,4,10))
        self.assertFalse(resources.may_start(12*g,0,0,2,4,95))
        self.assertTrue(resources.may_start(12*g,0,0,0,4,95))
        self.assertFalse(resources.may_start(12*g,0,0,4,4,10))

    def test_overlapping_extractors_do_not_double_count_wall_overlap(self):
        events=[{'role':'extract','start':0,'end':8},{'role':'extract','start':2,'end':7},
            {'role':'validate','start':3,'end':6}]
        self.assertEqual(pipeline.overlap_wall_seconds(events),3)

    def test_action_encoding_quota_caps_global_memory_and_worker_budget(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);allocation=root/'allocation.json';policy=root/'policy.json'
            pipeline.write_json_atomic(allocation,{'maximumEncodingWorkers':2,'memoryBudgetBytes':2*resources.GIB})
            pipeline.write_json_atomic(policy,{'enabled':True,'maximumEncodingWorkers':24})
            with patch.dict(os.environ,{'SHINOBI_ACTION_ALLOCATION':str(allocation)}),patch.object(encoding,'POLICY',policy):
                self.assertEqual(encoding.requested_workers(),2)
                self.assertEqual(encoding.choose_workers(24,(4000,4000),100,1600000000,free=16*resources.GIB),1)
                pipeline.write_json_atomic(allocation,{'maximumEncodingWorkers':25,'memoryBudgetBytes':2*resources.GIB})
                with self.assertRaisesRegex(ValueError,'allocation'):encoding.requested_workers()

    def simulate(self,root,*,unrelated=False,maximum=4):
        output=root/'o';output.mkdir();work=root/'n';work.mkdir()
        pipeline.write_json_atomic(output/'index.json',pipeline.empty_index())
        jobs=[{'key':str(i),'resource':resource,'source':{'path':resource},'action':str(i)}
            for i,resource in enumerate(('A','A','B'))]
        item={'number':1,'root':root,'output':output,'work':work,'pending':jobs}
        args=SimpleNamespace(source='archive',project='project',java='java',ffdec='ffdec',classes='classes')
        active=set();lock=threading.Lock();peak=[0];observed=[];test=self
        class Runner:
            events=[];stop=False
            def abort(self):self.stop=True
            def run(self,command,log,seconds,role,batch,*,environment,tag):
                def arg(name):return Path(command[command.index('--'+name)+1])
                job=json.loads(arg('jobs').read_bytes())[0];test.assertIn('SHINOBI_ACTION_ALLOCATION',environment)
                test.assertTrue(arg('profile-dir').is_relative_to(work))
                with lock:
                    test.assertNotIn(job['resource'],active);active.add(job['resource']);peak[0]=max(peak[0],len(active));observed.append(tag)
                try:
                    time.sleep(.08);stage=arg('output');folder=stage/'f'/job['key'];folder.mkdir(parents=True)
                    blob=folder/'frame.webp';blob.write_bytes(job['key'].encode())
                    entry={'source':job['source'],'definition':{'frontAction':job['action']},'layers':[
                        {'animation':{'url':'/assets/effects/native/f/'+job['key']+'/frame.webp'},'artifactsSha256':{'frame.webp':hashlib.sha256(blob.read_bytes()).hexdigest()}}]}
                    index=pipeline.empty_index();index['sourceExports']['UNRELATED' if unrelated else job['key']]=entry
                    pipeline.write_json_atomic(stage/'index.json',index)
                finally:
                    with lock:active.remove(job['resource'])
        runner=Runner()
        with patch.object(balanced,'memory',return_value=16*resources.GIB),patch.object(balanced,'owned_rss',return_value=0),patch.object(balanced,'cpu_percent',return_value=10):
            result=balanced.extract_actions(args,root,item,runner,maximum)
        return result,pipeline.entries(json.loads((output/'index.json').read_bytes())),peak,observed

    def test_independent_archives_overlap_same_archive_is_serialized_and_all_entries_preserved(self):
        with tempfile.TemporaryDirectory() as temp:
            result,entries,peak,observed=self.simulate(Path(temp))
            self.assertEqual(set(entries),{'0','1','2'});self.assertEqual(peak[0],2)
            self.assertEqual(result['peakActionWorkers'],2);self.assertEqual(len(result['actionStages']),3)

    def test_unrelated_action_index_is_rejected_before_batch_consolidation(self):
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaisesRegex(ValueError,'unrelated staging'):self.simulate(Path(temp),unrelated=True)
            self.assertFalse(pipeline.entries(json.loads((Path(temp)/'o/index.json').read_bytes())))

    def test_invalid_action_count_is_rejected_before_any_job_starts(self):
        with self.assertRaisesRegex(ValueError,'1,2or4'):balanced.extract_actions(None,None,None,None,3)

if __name__=='__main__':unittest.main()
