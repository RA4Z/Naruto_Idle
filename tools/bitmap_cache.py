"""Bounded immutable bitmap reuse; exact tag bytes are the cache identity."""
from collections import OrderedDict

class BitmapCache:
    def __init__(self,max_pixels=32_000_000):
        if not isinstance(max_pixels,int) or not 0<max_pixels<=32_000_000:raise ValueError('Invalid bitmap cache budget')
        self.limit=max_pixels;self.pixels=0;self.items=OrderedDict()
    def get(self,key):
        image=self.items.get(key)
        if image is not None:self.items.move_to_end(key)
        return image
    def put(self,key,image):
        size=image.width*image.height
        if size>self.limit:return
        previous=self.items.pop(key,None)
        if previous is not None:self.pixels-=previous.width*previous.height
        while self.items and self.pixels+size>self.limit:
            _,old=self.items.popitem(last=False);self.pixels-=old.width*old.height
        self.items[key]=image;self.pixels+=size
