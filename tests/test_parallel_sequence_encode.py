import hashlib,json,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch,MagicMock
from PIL import Image
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from pack_native_sequence import pack_sequence
import parallel_sequence_encode as encoding

def source(root,transparent=False):
    native=root/'native';native.mkdir()
    for frame,pose in enumerate((0,0,1,2,3,4)):
        image=Image.new('RGBA',(16,12));image.putpixel((10,10),(91,17,240,0))
        if not transparent:image.putpixel((pose+1,3),(20+pose,90,180,81+pose))
        image.save(native/f'{frame:04d}.png')
    (native/'render.json').write_text(json.dumps({'staticOnly':True,'frameCount':6,'fps':23.5,'rectTwips':[-21,-41,299,199]}))
    return native

class ParallelSequenceTests(unittest.TestCase):
    def test_manifest_order_registration_hidden_rgb_and_repeats_match_serial(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);native=source(root)
            a,pa=pack_sequence(native,root/'serial',workers=1)
            b,pb=pack_sequence(native,root/'parallel',workers=2)
            self.assertEqual((a,pa),(b,pb));self.assertEqual(a['timeline'],[0,0,1,2,3,4])
            for name in (*a['frameFiles'],'manifest.json'):
                self.assertEqual((root/'serial'/name).read_bytes(),(root/'parallel'/name).read_bytes())

    def test_partial_encoding_resumes_without_rewriting_valid_frames(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);native=source(root);out=root/'out'
            a,pa=pack_sequence(native,out,workers=1);missing=a['frameFiles'][-1];(out/missing).unlink()
            before={p.name:(p.stat().st_mtime_ns,p.read_bytes()) for p in out.glob('*.webp')}
            b,pb=pack_sequence(native,out,workers=2);self.assertEqual((a,pa),(b,pb))
            for name,record in before.items():self.assertEqual(((out/name).stat().st_mtime_ns,(out/name).read_bytes()),record)

    def test_corrupt_existing_generated_frame_is_preserved_and_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);native=source(root);out=root/'out';a,_=pack_sequence(native,out,workers=1)
            file=out/a['frameFiles'][0];Image.new('RGBA',(16,12),'red').save(file,lossless=True,exact=True)
            before=file.read_bytes();manifest=(out/'manifest.json').read_bytes()
            with self.assertRaises(ValueError):pack_sequence(native,out,workers=2)
            self.assertEqual(file.read_bytes(),before);self.assertEqual((out/'manifest.json').read_bytes(),manifest)

    def test_source_mutation_is_rejected_before_worker_output(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);native=source(root);file=native/'0000.png'
            job={'source':str(file),'sourceSha256':hashlib.sha256(file.read_bytes()).hexdigest(),'target':str(root/'out.webp')}
            file.write_bytes(b'changed generated source')
            with self.assertRaisesRegex(ValueError,'Source PNG changed'):encoding._encode(job)
            self.assertFalse((root/'out.webp').exists())

    def test_decoder_budget_is_checked_before_rgba_allocation(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);native=source(root);raw=MagicMock();raw.size=(8192,8192)
            context=MagicMock();context.__enter__.return_value=raw
            with patch.object(encoding.Image,'open',return_value=context),patch.object(encoding.futures,'ProcessPoolExecutor') as pool:
                with self.assertRaisesRegex(ValueError,'bounded decoder'):pack_sequence(native,root/'out',workers=2)
                raw.convert.assert_not_called();pool.assert_not_called()

    def test_memory_budget_and_concurrency_caps_are_enforced(self):
        with patch.object(encoding.os,'cpu_count',return_value=24):
            self.assertEqual(encoding.choose_workers(24,(4000,3999),30,400_000_000,free=4*1024**3+512*1024**2),1)
            self.assertEqual(encoding.choose_workers(24,(512,512),30,8_000_000,free=32*1024**3),24)
        for value in (0,25,True):
            with self.assertRaises(ValueError):encoding.choose_workers(value,(8,8),2,128,free=32*1024**3)

    def test_transparent_only_source_is_rejected_without_starting_workers(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);native=source(root,transparent=True)
            with patch.object(encoding.futures,'ProcessPoolExecutor') as pool:
                with self.assertRaisesRegex(ValueError,'transparent'):pack_sequence(native,root/'out',workers=2)
                pool.assert_not_called()

    def test_bad_policy_is_rejected_and_absent_policy_stays_serial(self):
        with tempfile.TemporaryDirectory() as temp:
            policy=Path(temp)/'policy.json'
            with patch.object(encoding,'POLICY',policy):
                self.assertEqual(encoding.requested_workers(),1)
                policy.write_text(json.dumps({'enabled':True,'maximumEncodingWorkers':25}))
                with self.assertRaises(ValueError):encoding.requested_workers()

if __name__=='__main__':unittest.main()
