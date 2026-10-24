"""Independent lossless frame encoders; the parent alone builds the timeline.

The existing serial packer rechecks every source/encoded frame and produces the
same manifest after workers finish. Atlas, decoder and source limits are intact.
"""
import concurrent.futures as futures
import ctypes
import hashlib,json,os,struct,time,uuid
from pathlib import Path
from PIL import Image

POLICY=Path('C:/Users/fegug/AppData/Local/ShinobiIdleExtraction/cycles/sequence-parallel-policy.json')
RESERVE=4*1024**3
class _Memory(ctypes.Structure):
    _fields_=[('length',ctypes.c_uint32),('load',ctypes.c_uint32)]+[(name,ctypes.c_uint64) for name in
        ('total','available','totalPage','availablePage','totalVirtual','availableVirtual','extended')]
def available_memory():
    if os.name=='nt':
        value=_Memory();value.length=ctypes.sizeof(value)
        if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(value)):raise ctypes.WinError()
        return value.available
    return os.sysconf('SC_AVPHYS_PAGES')*os.sysconf('SC_PAGE_SIZE')
def requested_workers():
    if not POLICY.exists():return 1
    data=json.loads(POLICY.read_bytes())
    if data.get('enabled') is not True:return 1
    count=data['maximumEncodingWorkers']
    if type(count) is not int or not 1<=count<=24:raise ValueError('Invalid parallel encoding policy')
    allocation=action_allocation()
    return min(count,allocation['maximumEncodingWorkers']) if allocation else count

def action_allocation():
    name=os.environ.get('SHINOBI_ACTION_ALLOCATION')
    if not name:return None
    data=json.loads(Path(name).read_bytes())
    if (type(data.get('maximumEncodingWorkers')) is not int or not 1<=data['maximumEncodingWorkers']<=24
        or type(data.get('memoryBudgetBytes')) is not int or data['memoryBudgetBytes']<512*1024**2):
        raise ValueError('Invalid parent action allocation')
    return data

def sequence_method():
    data=json.loads(POLICY.read_bytes()) if POLICY.exists() else {}
    method=data.get('sourceSequenceWebPMethod',4) if data.get('enabled') else 4
    if type(method) is not int or method not in (0,2,4):raise ValueError('Invalid lossless sequence encoding method')
    return method
def choose_workers(requested,canvas,unique,total_pixels,free=None):
    if type(requested) is not int or not 1<=requested<=24:raise ValueError('One to24 encoders required')
    free=available_memory() if free is None else free
    allocation=action_allocation()
    if allocation:free=min(free,RESERVE+max(0,allocation['memoryBudgetBytes']-512*1024**2))
    # RGBA source, converted buffers, codec workspace and interpreter overhead.
    per_worker=max(384*1024**2,canvas[0]*canvas[1]*4*12+128*1024**2)
    return max(1,min(requested,unique,os.cpu_count() or 1,(free-RESERVE)//per_worker))
def _encode(job):
    source=Path(job['source']);target=Path(job['target']);temporary=target.with_name('.w'+uuid.uuid4().hex[:10]+'.tmp')
    if available_memory()<2*1024**3:raise MemoryError('Parallel encoder reserve reached')
    if hashlib.sha256(source.read_bytes()).hexdigest()!=job['sourceSha256']:raise ValueError('Source PNG changed before encoding')
    try:
        with Image.open(source) as raw:
            if tuple(raw.size)!=tuple(job['canvas']):raise ValueError('Source coordinate plane changed')
            image=raw.convert('RGBA')
        if hashlib.sha256(image.tobytes()).hexdigest()!=job['rgba']:raise ValueError('Source RGBA changed before encoding')
        if target.exists():
            with Image.open(target) as stored:
                if stored.size!=image.size or hashlib.sha256(stored.convert('RGBA').tobytes()).hexdigest()!=job['rgba']:
                    raise ValueError('Existing generated frame differs; preserve for review')
        else:
            image.save(temporary,format='WEBP',lossless=True,exact=True,method=job.get('encodingMethod',4))
            with Image.open(temporary) as stored:
                if stored.size!=image.size or hashlib.sha256(stored.convert('RGBA').tobytes()).hexdigest()!=job['rgba']:
                    raise ValueError('Lossless parallel frame changed original pixels')
            os.replace(temporary,target)
        image.close()
        return {'file':target.name,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'rgba':job['rgba']}
    finally:
        if temporary.is_file():temporary.unlink()
def encode_sequence(native,output,serial,*,workers=None):
    explicit=workers is not None
    requested=requested_workers() if workers is None else workers
    if requested==1:return serial(native,output)
    metadata=json.loads((native/'render.json').read_bytes());files=sorted(native.glob('*.png'))
    if not metadata.get('staticOnly') or len(files)!=metadata['frameCount'] or not 1<=len(files)<=480:
        raise ValueError('Incomplete static source timeline')
    output.mkdir(parents=True,exist_ok=True);unique={};canvas=None;visible=False
    for source in files:
        with Image.open(source) as raw:
            size=raw.size
            if max(size)>8192 or size[0]*size[1]>16_000_000:raise ValueError('Source frame exceeds bounded decoder memory')
            if canvas is not None and canvas!=size:raise ValueError('Native coordinate plane changed')
            canvas=size;image=raw.convert('RGBA')
        visible|=image.getbbox() is not None
        pixels=image.tobytes();rgba=hashlib.sha256(pixels).hexdigest()
        filename='frame-'+hashlib.sha256(struct.pack('<II',*canvas)+pixels).hexdigest()[:24]+'.webp'
        if rgba not in unique:
            unique[rgba]={'source':str(source),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
                'target':str(output/filename),'canvas':list(canvas),'rgba':rgba,'encodingMethod':sequence_method()}
        image.close();del image,pixels
    if not visible:raise ValueError('All source frames are transparent')
    total_pixels=canvas[0]*canvas[1]*len(unique)
    if not explicit and (len(unique)<4 or total_pixels<8_000_000):return serial(native,output)
    count=choose_workers(requested,canvas,len(unique),total_pixels)
    if not explicit:count=min(count,max(2,total_pixels//8_000_000))
    if count<=1:return serial(native,output)
    executor=futures.ProcessPoolExecutor(max_workers=count);pending=set();aborted=False
    try:
        jobs=iter(unique.values())
        for _ in range(min(len(unique),count*2)):
            pending.add(executor.submit(_encode,next(jobs)))
        while pending:
            if available_memory()<2*1024**3:raise MemoryError('Parallel encoder reserve reached; preserve native frames')
            done,pending=futures.wait(pending,timeout=.2,return_when=futures.FIRST_COMPLETED)
            for task in done:
                task.result()
                try:job=next(jobs)
                except StopIteration:continue
                pending.add(executor.submit(_encode,job))
    except BaseException:
        aborted=True
        # These are exclusively this executor's children, never other queues.
        for process in list((executor._processes or {}).values()):
            if process.is_alive():process.terminate()
        raise
    finally:executor.shutdown(wait=True,cancel_futures=aborted)
    # Full independent readback remains mandatory, including duplicates, FPS,
    # frame order and native registration; no tests or frame checks are skipped.
    return serial(native,output,reuse_verified=True)
