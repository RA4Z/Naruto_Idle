"""Static interpretation of source-proven MME linear keyframes; no ActionScript.

Reference: SimpleInnerRenderer.getTweenFrameData in the user's version-pinned
flash/core/naruto.core/library.swf. Rotation is direct, not shortest-arc.
Color, blend, asset identity and external name stay on the starting key.
"""
import copy

DEFAULTS={'x':0.,'y':0.,'scaleX':1.,'scaleY':1.,'rotation':0.,'alpha':1.}

def expand_tweens(root,only=None):
    result=copy.deepcopy(root)
    for action in result.findall('action'):
        if only is not None and action.get('name') not in only:continue
        for layer in action.findall('layer'):
            keys=list(layer.findall('frame'))
            for frame in keys:
                if frame.get('tween')!='true':continue
                start=int(frame.get('index','0'));length=int(frame.get('length','1'))
                elements=list(frame.findall('element'))+list(frame.findall('pointElement'))
                if len(elements)>1:raise ValueError('Source MME frame decodes only one element; ambiguous XML')
                source=elements[0] if elements else None;target=None
                for key in keys:
                    if int(key.get('index','0'))!=start+length:continue
                    candidates=list(key.findall('element'))+list(key.findall('pointElement'))
                    if len(candidates)>1:raise ValueError('Ambiguous destination MME keyframe')
                    end=candidates[0] if candidates else None
                    if source is None or end is None or source.tag!=end.tag:continue
                    if source.tag=='pointElement' or ('-1' if source.get('extname') else source.get('assetId'))==('-1' if end.get('extname') else end.get('assetId')):
                        target=end;break
                position=list(layer).index(frame);layer.remove(frame)
                for time in range(length):
                    expanded=copy.deepcopy(frame);expanded.set('index',str(start+time));expanded.set('length','1');expanded.attrib.pop('tween',None)
                    if time:
                        for event in ('event','sound','volume'):expanded.attrib.pop(event,None)
                    if source is not None and target is not None and time:
                        element=expanded.find(source.tag);ratio=time/length
                        for property,default in DEFAULTS.items():
                            if source.tag=='pointElement' and property not in ('x','y'):continue
                            first=float(source.get(property,str(default)));last=float(target.get(property,str(default)))
                            element.set(property,repr(first+ratio*(last-first)))
                    layer.insert(position+time,expanded)
    return result
