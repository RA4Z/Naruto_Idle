"""Static decoding of the observed SWF wrapper, CWS and standard ZWS/LZMA."""
import lzma,struct,zlib
def decode(b):
 if b.startswith(b'ZWS\0\xff\xff\xff\xff'):
  hi=b[8:19:2];lo=b[9:19:2];head=bytes((hi[i]&15)|((hi[i+1]&15)<<4) for i in range(0,6,2))+lo;body=bytearray(b[19:])
  for i in range(1,min(128,len(body)),2):body[i]^=255
  b=head+body
 if b[:3]==b'CWS':b=b'FWS'+b[3:8]+zlib.decompress(b[8:])
 elif b[:3]==b'ZWS':
  expected=struct.unpack_from('<I',b,4)[0]-8
  if not 0<expected<128*1024*1024:raise ValueError('SWF output size outside conversion bounds')
  props=b[12];lc=props%9;rest=props//9;lp=rest%5;pb=rest//5;dictionary=struct.unpack_from('<I',b,13)[0]
  if not 4096<=dictionary<=128*1024*1024:raise ValueError('Unsupported LZMA dictionary size')
  decoder=lzma.LZMADecompressor(format=lzma.FORMAT_RAW,filters=[{'id':lzma.FILTER_LZMA1,'dict_size':dictionary,'lc':lc,'lp':lp,'pb':pb}]);body=decoder.decompress(b[17:],max_length=expected+1)
  if len(body)!=expected:raise ValueError('LZMA output length mismatch')
  b=b'FWS'+b[3:8]+body
 return b
