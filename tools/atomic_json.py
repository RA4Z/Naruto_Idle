"""Bounded atomic JSON persistence for transient Windows/cloud-sync file locks."""
import errno,json,os,tempfile,time
from pathlib import Path

def write_json_atomic(path,data,*,attempts=12):
    if not 1<=attempts<=12:raise ValueError('Atomic save requires one to twelve attempts')
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    descriptor,name=tempfile.mkstemp(prefix=path.name+'.',suffix='.tmp',dir=path.parent)
    temporary=Path(name)
    try:
        with os.fdopen(descriptor,'w',encoding='utf-8') as stream:
            stream.write(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
            stream.flush();os.fsync(stream.fileno())
        for attempt in range(attempts):
            try:os.replace(temporary,path);return
            except PermissionError as error:
                transient=getattr(error,'winerror',None) in (5,32,33) or error.errno in (errno.EACCES,errno.EPERM)
                if not transient or attempt+1==attempts:raise
                time.sleep(min(0.05*(2**attempt),0.5))
    finally:
        try:temporary.unlink(missing_ok=True)
        except PermissionError:pass  # A locked temporary is preserved; never erase the previous target.
