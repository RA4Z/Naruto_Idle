"""Bounded AMF3 data decoder. Typed aliases stay dictionaries; no class loading.

Externalizable objects are rejected: invoking their serializers would execute
source code. This reader is only for inspecting MME graphics configuration.
"""
import struct

class AMF3:
    def __init__(self,data):
        if len(data)>16_000_000:raise ValueError('AMF byte budget exceeded')
        self.data=data;self.position=0;self.strings=[];self.objects=[];self.traits=[];self.items=0

    def take(self,n):
        if n<0 or self.position+n>len(self.data):raise ValueError('Truncated AMF')
        value=self.data[self.position:self.position+n];self.position+=n;return value

    def byte(self):return self.take(1)[0]

    def u29(self):
        result=0
        for i in range(4):
            byte=self.byte()
            if i==3:return result<<8|byte
            result=result<<7|(byte&127)
            if not byte&128:return result
        raise ValueError('Invalid U29')

    def reference(self,table,index):
        if not 0<=index<len(table):raise ValueError('Invalid AMF reference')
        return table[index]

    def string(self):
        header=self.u29()
        if not header&1:return self.reference(self.strings,header>>1)
        value=self.take(header>>1).decode('utf-8')
        if value:self.strings.append(value)
        return value

    def read(self,depth=0):
        self.items+=1
        if depth>128 or self.items>500_000:raise ValueError('AMF structure budget exceeded')
        marker=self.byte()
        if marker in (0,1):return None
        if marker in (2,3):return marker==3
        if marker==4:
            value=self.u29();return value-(1<<29) if value&(1<<28) else value
        if marker==5:return struct.unpack('>d',self.take(8))[0]
        if marker==6:return self.string()
        header=self.u29()
        if not header&1:return self.reference(self.objects,header>>1)
        if marker in (7,11,12):
            value=self.take(header>>1);self.objects.append(value);return value
        if marker==8:
            value={'__dateMilliseconds__':struct.unpack('>d',self.take(8))[0]};self.objects.append(value);return value
        if marker==9:
            result={'__dense__':[]};self.objects.append(result)
            while True:
                key=self.string()
                if not key:break
                result[key]=self.read(depth+1)
            for _ in range(header>>1):result['__dense__'].append(self.read(depth+1))
            return result
        if marker==10:
            if not header&2:trait=self.reference(self.traits,header>>2)
            else:
                if header&4:raise ValueError('Externalizable AMF class rejected; source code will not execute')
                trait=(self.string(),bool(header&8),[self.string() for _ in range(header>>4)]);self.traits.append(trait)
            alias,dynamic,sealed=trait;result={'__class__':alias};self.objects.append(result)
            for key in sealed:result[key]=self.read(depth+1)
            if dynamic:
                while True:
                    key=self.string()
                    if not key:break
                    result[key]=self.read(depth+1)
            return result
        if marker in (13,14,15,16):
            count=header>>1;fixed=bool(self.byte());result={'__vector__':[],'fixed':fixed};self.objects.append(result)
            if count>500_000:raise ValueError('AMF vector budget exceeded')
            if marker==16:result['type']=self.string()
            for _ in range(count):
                result['__vector__'].append(self.read(depth+1) if marker==16 else struct.unpack({13:'>i',14:'>I',15:'>d'}[marker],self.take(8 if marker==15 else 4))[0])
            return result
        if marker==17:
            count=header>>1;weak=bool(self.byte());result={'__dictionary__':[],'weak':weak};self.objects.append(result)
            for _ in range(count):result['__dictionary__'].append([self.read(depth+1),self.read(depth+1)])
            return result
        raise ValueError('Unsupported AMF marker '+str(marker))
