"""Resumable whole-library extraction. Reads source data, never runs it.
PNG/JPEG, MP3 and XML embedded in SWF are extracted; complex timelines remain
explicitly partial. Originals and decoded bytes are distinct files.
"""
import argparse,concurrent.futures,hashlib,io,json,shutil,struct,zlib
from pathlib import Path
from PIL import Image
from swf_bytes import decode as decode_all
ap=argparse.ArgumentParser();ap.add_argument('--source',default=r'D:\Naruto Idle\Naruto_Idle');ap.add_argument('--output',default=r'D:\Naruto Idle\Naruto Idle RPG');ap.add_argument('--limit',type=int,default=0);ap.add_argument('--workers',type=int,default=6);ap.add_argument('--retry-blocked',action='store_true');args=ap.parse_args()
SRC=Path(args.source);DST=Path(args.output);OUT=DST/'assets-extraidos';LOG=OUT/'manifestos/library-extraction.jsonl';LOG.parent.mkdir(parents=True,exist_ok=True)
inventory=json.loads((OUT/'manifestos/inventory.json').read_text(encoding='utf8'));done=set();latest={}
if LOG.exists():
 for line in LOG.read_text(encoding='utf8').splitlines():
  try:row=json.loads(line);done.add(row['source']);latest[row['source']]=row
  except ValueError:pass
pending=[r for r in inventory if r['source'] not in done or (args.retry_blocked and latest.get(r['source'],{}).get('status')=='blocked')]
if args.limit:pending=pending[:args.limit]
def decode(b):
 if b.startswith(b'ZWS\0\xff\xff\xff\xff'):
  hi=b[8:19:2];lo=b[9:19:2];head=bytes((hi[i]&15)|((hi[i+1]&15)<<4) for i in range(0,6,2))+lo;body=bytearray(b[19:])
  for i in range(1,min(128,len(body)),2):body[i]^=255
  b=head+body
 if b[:3]==b'CWS':b=b'FWS'+b[3:8]+zlib.decompress(b[8:])
 return b
def extract(r):
 p=Path(r['source']);dest=OUT/r['category']/r['version']/r['original_path'];result={**r,'outputs':[],'warnings':[]}
 try:
  data=p.read_bytes();dest.parent.mkdir(parents=True,exist_ok=True)
  if not dest.exists():shutil.copyfile(p,dest)
  result['sha256']=hashlib.sha256(data).hexdigest();result['outputs'].append(str(dest.relative_to(DST)));result['status']='ready-original'
  ext=p.suffix.lower()
  is_swf=data[:3] in (b'FWS',b'CWS',b'ZWS')
  if ext in ('.png','.jpg','.jpeg','.gif','.bmp') and not is_swf:
   with Image.open(io.BytesIO(data)) as image:result.update(dimensions=list(image.size),format=image.format,transparency=image.mode in ('RGBA','LA') or 'transparency' in image.info)
  elif ext in ('.xml','.cfg'):
   try:
    uncompressed=zlib.decompress(data);target=dest.with_suffix(dest.suffix+'.decoded');target.write_bytes(uncompressed);result['outputs'].append(str(target.relative_to(DST)))
   except zlib.error:pass
  elif ext=='.swf' or is_swf:
   b=decode_all(data)
   if b[:3]!=b'FWS':result.update(status='blocked',warnings=['Unsupported SWF compression; original preserved']);return result
   n=b[8]>>3;offset=8+(5+4*n+7)//8;fps=struct.unpack_from('<H',b,offset)[0]/256;frames=struct.unpack_from('<H',b,offset+2)[0];offset+=4;result.update(fps=fps,timeline_frames=frames,status='partial',embedded_images=0,embedded_sounds=0,complex_tags={})
   folder=dest.with_suffix('.extracted');folder.mkdir(exist_ok=True)
   while offset+2<=len(b):
    h=struct.unpack_from('<H',b,offset)[0];offset+=2;size=h&63;kind=h>>6
    if size==63:size=struct.unpack_from('<I',b,offset)[0];offset+=4
    if offset+size>len(b):raise ValueError('Truncated SWF tag')
    payload=b[offset:offset+size];offset+=size
    try:
     if kind in (21,35):
      ident=struct.unpack_from('<H',payload)[0]
      if kind==35:
       length=struct.unpack_from('<I',payload,2)[0];im=Image.open(io.BytesIO(payload[6:6+length])).convert('RGBA');alpha=payload[6+length:]
       if alpha:im.putalpha(Image.frombytes('L',im.size,zlib.decompress(alpha)))
      else:im=Image.open(io.BytesIO(payload[2:])).convert('RGBA')
      target=folder/f'bitmap-{ident}.png';im.save(target);result['embedded_images']+=1;result['outputs'].append(str(target.relative_to(DST)))
     elif kind==87:
      ident=struct.unpack_from('<H',payload)[0];body=payload[6:];target=folder/(f'binary-{ident}'+('.xml' if body.lstrip().startswith(b'<') else '.bin'));target.write_bytes(body);result['outputs'].append(str(target.relative_to(DST)))
     elif kind==14:
      ident=struct.unpack_from('<H',payload)[0];format=payload[2]>>4
      if format==2:
       target=folder/f'sound-{ident}.mp3';target.write_bytes(payload[9:]);result['embedded_sounds']+=1;result['outputs'].append(str(target.relative_to(DST)))
      else:result['warnings'].append({'tag':kind,'sound_encoding':format})
     elif kind in (2,22,32,83,20,36,39,46,84,10,48,75,91):result['complex_tags'][str(kind)]=result['complex_tags'].get(str(kind),0)+1
    except (ValueError,OSError,zlib.error) as error:result['warnings'].append({'tag':kind,'error':str(error)})
   result['warnings'].append('Embedded media extracted; timeline reconstruction requires actions XML or JPEXS. Complex tags are not rendered by this batch.')
 except Exception as error:result.update(status='blocked',error=str(error))
 return result
count=0
with LOG.open('a',encoding='utf8') as log,concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
 for row in pool.map(extract,pending):
  log.write(json.dumps(row,ensure_ascii=False)+'\n');log.flush();count+=1
  if count%500==0:print(json.dumps({'completed_this_run':count,'previously_completed':len(done),'total':len(inventory)}),flush=True)
print(json.dumps({'completed_this_run':count,'previously_completed':len(done),'total':len(inventory)}),flush=True)
