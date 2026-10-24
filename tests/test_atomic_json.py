import errno,json,os,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from atomic_json import write_json_atomic

class AtomicJsonTests(unittest.TestCase):
    def test_transient_locks_preserve_old_target_then_publish_complete_json(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);target=root/'manifest.json';target.write_text('old');replace=os.replace;calls=[]
            def locked(source,destination):
                calls.append(source);self.assertEqual(Path(source).parent,root)
                if len(calls)<3:
                    self.assertEqual(target.read_text(),'old');raise PermissionError(errno.EACCES,'temporary sync lock')
                replace(source,destination)
            with patch('atomic_json.os.replace',side_effect=locked),patch('atomic_json.time.sleep') as sleep:
                write_json_atomic(target,{'ação':'origem','frames':[0,0,1]})
            self.assertEqual(json.loads(target.read_text(encoding='utf-8')),{'ação':'origem','frames':[0,0,1]})
            self.assertEqual(len(calls),3);self.assertEqual(sleep.call_count,2);self.assertFalse(list(root.glob('*.tmp')))
    def test_exhausted_lock_is_not_reported_as_success_or_destructive(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);target=root/'manifest.json';target.write_text('original')
            with patch('atomic_json.os.replace',side_effect=PermissionError(errno.EACCES,'denied')) as replace,patch('atomic_json.time.sleep') as sleep:
                with self.assertRaises(PermissionError):write_json_atomic(target,{'new':True},attempts=3)
            self.assertEqual(replace.call_count,3);self.assertEqual(sleep.call_count,2);self.assertEqual(target.read_text(),'original');self.assertFalse(list(root.glob('*.tmp')))
    def test_disk_full_is_not_retried_and_previous_target_survives(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);target=root/'manifest.json';target.write_text('original')
            with patch('atomic_json.os.replace',side_effect=OSError(errno.ENOSPC,'full')) as replace,patch('atomic_json.time.sleep') as sleep:
                with self.assertRaises(OSError):write_json_atomic(target,{'new':True})
            self.assertEqual(replace.call_count,1);sleep.assert_not_called();self.assertEqual(target.read_text(),'original');self.assertFalse(list(root.glob('*.tmp')))
    def test_retry_budget_is_bounded_before_any_files_are_created(self):
        with tempfile.TemporaryDirectory() as temp:
            target=Path(temp)/'manifest.json'
            for attempts in (0,13):
                with self.assertRaises(ValueError):write_json_atomic(target,{},attempts=attempts)
            self.assertFalse(list(Path(temp).iterdir()))
