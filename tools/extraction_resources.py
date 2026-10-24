"""Read-only Windows resource sampling; admission never changes source quality."""
import ctypes as c,os
GIB=1024**3
RESERVE=4*GIB
ACTION_BUDGET=2*GIB
class Memory(c.Structure):
    _fields_=[('length',c.c_uint32),('load',c.c_uint32)]+[(name,c.c_uint64) for name in
        ('total','available','totalPage','availablePage','totalVirtual','availableVirtual','extended')]
class Entry(c.Structure):
    _fields_=[('size',c.c_uint32),('usage',c.c_uint32),('pid',c.c_uint32),('heap',c.c_size_t),
        ('module',c.c_uint32),('threads',c.c_uint32),('parent',c.c_uint32),('priority',c.c_long),
        ('flags',c.c_uint32),('name',c.c_wchar*260)]
class Counters(c.Structure):
    _fields_=[('cb',c.c_uint32),('faults',c.c_uint32)]+[(name,c.c_size_t) for name in
        ('peakRSS','rss','peakPaged','paged','peakNonpaged','nonpaged','pagefile','peakPagefile')]
def memory():
    if os.name!='nt':return os.sysconf('SC_AVPHYS_PAGES')*os.sysconf('SC_PAGE_SIZE')
    value=Memory();value.length=c.sizeof(value)
    if not c.windll.kernel32.GlobalMemoryStatusEx(c.byref(value)):raise c.WinError()
    return value.available
def cpu_ticks():
    a,b,d=c.c_uint64(),c.c_uint64(),c.c_uint64()
    if not c.windll.kernel32.GetSystemTimes(c.byref(a),c.byref(b),c.byref(d)):raise c.WinError()
    return a.value,b.value+d.value
def cpu_percent(before,after):return max(0,min(100,100*(1-(after[0]-before[0])/max(1,after[1]-before[1]))))
def owned_rss(roots):
    if not roots:return 0
    k=c.WinDLL('kernel32',use_last_error=True);ps=c.WinDLL('psapi',use_last_error=True)
    k.CreateToolhelp32Snapshot.argtypes=[c.c_uint32,c.c_uint32];k.CreateToolhelp32Snapshot.restype=c.c_void_p
    k.Process32FirstW.argtypes=[c.c_void_p,c.POINTER(Entry)];k.Process32NextW.argtypes=k.Process32FirstW.argtypes
    k.CloseHandle.argtypes=[c.c_void_p];k.OpenProcess.argtypes=[c.c_uint32,c.c_int,c.c_uint32];k.OpenProcess.restype=c.c_void_p
    ps.GetProcessMemoryInfo.argtypes=[c.c_void_p,c.POINTER(Counters),c.c_uint32]
    h=k.CreateToolhelp32Snapshot(2,0)
    if h==c.c_void_p(-1).value:raise c.WinError()
    rows=[];row=Entry();row.size=c.sizeof(row)
    try:
        good=k.Process32FirstW(h,c.byref(row))
        while good:rows.append((row.pid,row.parent));good=k.Process32NextW(h,c.byref(row))
    finally:k.CloseHandle(h)
    owned=set(roots)
    for _ in range(16):
        expanded=owned|{pid for pid,parent in rows if parent in owned}
        if expanded==owned:break
        owned=expanded
    total=0
    for pid in owned:
        handle=k.OpenProcess(0x1000|0x10,False,pid)
        if not handle:continue
        try:
            value=Counters();value.cb=c.sizeof(value)
            if ps.GetProcessMemoryInfo(handle,c.byref(value),value.cb):total+=value.rss
        finally:k.CloseHandle(handle)
    return total
def may_start(free,reservations,rss,active,maximum,cpu):
    if active>=maximum or (active and cpu>=92):return False
    return free-RESERVE-max(0,reservations-rss)>=ACTION_BUDGET
