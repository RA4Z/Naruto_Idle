"""Bound a locally owned source worker, including its descendants on timeout.

No shell, no source-file deletion, no unrelated process enumeration. Windows
uses taskkill /PID <the Popen child> /T /F; failure to confirm termination raises.
"""
import os
from pathlib import Path
import signal
import subprocess


class SourceProcessTimeout(TimeoutError):
    def __init__(self, seconds, pid):
        super().__init__(f'Owned source worker exceeded {seconds}s; process tree {pid} terminated')
        self.pid = pid
        self.tree_termination_confirmed = True


class WorkerTerminationError(RuntimeError):
    pass


def terminate_owned_tree(process):
    if process.poll() is not None:
        return
    if os.name == 'nt':
        executable = Path(os.environ.get('SystemRoot', r'C:\Windows')) / 'System32/taskkill.exe'
        result = subprocess.run([str(executable), '/PID', str(process.pid), '/T', '/F'],
                                capture_output=True, timeout=15, check=False)
        if result.returncode and process.poll() is None:
            raise WorkerTerminationError('Could not confirm termination of the owned worker tree; keep other heavy workers paused')
    else:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    try:
        process.wait(timeout=15)
    except subprocess.TimeoutExpired as error:
        raise WorkerTerminationError('Owned worker did not exit after termination; keep other heavy workers paused') from error


def run_bounded(command, *, log, seconds, cwd=None):
    if not 0 < seconds <= 7200 or not command or isinstance(command, (str, bytes)):
        raise ValueError('An explicit command list and positive bounded duration are required')
    path = Path(log)
    path.parent.mkdir(parents=True, exist_ok=True)
    options = {'creationflags': subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == 'nt' else {'start_new_session': True}
    with path.open('w', encoding='utf-8') as stream:
        process = subprocess.Popen(list(map(str, command)), cwd=cwd, stdin=subprocess.DEVNULL,
                                   stdout=stream, stderr=subprocess.STDOUT, shell=False, **options)
        try:
            try:
                return process.wait(timeout=seconds)
            except subprocess.TimeoutExpired:
                terminate_owned_tree(process)
                raise SourceProcessTimeout(seconds, process.pid) from None
        finally:
            if process.poll() is None:
                terminate_owned_tree(process)
