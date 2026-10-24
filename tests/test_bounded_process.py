import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from bounded_process import run_bounded, SourceProcessTimeout


class BoundedProcessTests(unittest.TestCase):
    def test_success_and_nonzero_keep_output_without_shell(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            result = run_bounded([sys.executable, '-c', 'print("source worker")'], log=root/'good.log', seconds=10)
            self.assertEqual(result, 0)
            self.assertIn('source worker', (root/'good.log').read_text())
            result = run_bounded([sys.executable, '-c', 'raise SystemExit(7)'], log=root/'bad.log', seconds=10)
            self.assertEqual(result, 7)

    def test_timeout_terminates_owned_grandchild_and_preserves_source_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); marker = root/'would-run-after-timeout'; original = root/'original.txt'
            original.write_text('preserve source')
            child = 'import time;from pathlib import Path;time.sleep(2);Path('+repr(str(marker))+').write_text("orphan")'
            parent = 'import subprocess,sys,time;subprocess.Popen([sys.executable,"-c",'+repr(child)+']);print("spawned",flush=True);time.sleep(10)'
            with self.assertRaises(SourceProcessTimeout) as caught:
                run_bounded([sys.executable, '-c', parent], log=root/'timed.log', seconds=.5)
            self.assertTrue(caught.exception.tree_termination_confirmed)
            self.assertIn('spawned', (root/'timed.log').read_text())
            time.sleep(2.1)
            self.assertFalse(marker.exists(), 'Grandchild survived the owned tree timeout')
            self.assertEqual(original.read_text(), 'preserve source')

    def test_invalid_duration_or_shell_string_never_starts_a_process(self):
        for command, seconds in [('echo no shell', 1), ([], 1), ([sys.executable], 0), ([sys.executable], 7201)]:
            with self.assertRaises(ValueError):
                run_bounded(command, log=Path('should-not-be-created.log'), seconds=seconds)


if __name__ == '__main__': unittest.main()
