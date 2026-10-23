"""Join prepared source actions to real Effect.xml IDs without re-rendering."""
import argparse,copy,json,sys,xml.etree.ElementTree as ET
from pathlib import Path
from recover_bound_effects import cached_layer,save

def main():
    ap=argparse.ArgumentParser()
    for key in ('source','project','prepared'):ap.add_argument('--'+key,type=Path,required=True)
    args=ap.parse_args();sys.path.insert(0,str(args.project/'tools'))
    from original_archive import OriginalArchive
    archive=OriginalArchive(args.source);config='assets/battle/Effect.xml';evidence=archive.record(config)
    path=args.prepared/'index.json';index=json.loads(path.read_bytes());index.setdefault('sourceBundles',{});resolved=[];unresolved=[]
    for ident,row in {e.get('id'):e for e in ET.fromstring(archive.data(config))}.items():
        logical=row.get('res','')
        if row.get('type')!='0' or not logical.startswith('assets/battle/effect/') or logical not in archive.rows:continue
        original=archive.record(logical);layers=[];missing=[]
        for field,plane in [('backAction','back'),('frontAction','front')]:
            name=row.get(field)
            if not name:continue
            layer=cached_layer(index,original,name,args.prepared)
            if layer is None:missing.append(name);continue
            layer['plane']=plane;layers.append(layer)
        if missing or not layers:
            unresolved.append({'id':ident,'resource':logical,'missingActions':missing,'reason':'exact-source-action-unavailable'});continue
        entry={'id':ident,'definition':dict(row.attrib),'sourceConfig':evidence,'source':original,'layers':layers}
        if any('sourceSequence' in layer for layer in layers):
            entry['state']='source-frames-complete-runtime-adapter-pending';index['sourceBundles'][ident]=entry
            index['effects'].pop(ident,None)
            index['deferred'][ident]={'id':ident,'definition':dict(row.attrib),'state':entry['state'],'reason':'Full source frames extracted; bounded streaming/tiled runtime adapter required'}
        else:
            entry['state']='native-assets-prepared-binding-review';index['effects'][ident]=entry;index['sourceBundles'].pop(ident,None);index['deferred'].pop(ident,None)
        resolved.append(ident)
    save(path,index);save(args.prepared/'binding-resolution.json',{'resolvedIds':resolved,'unresolved':unresolved,'sourceConfig':evidence,'policy':'Exact resource/action tuples only. No prefix, trimmed name or similar character inference.'})
    print(json.dumps({'resolved':len(resolved),'unresolved':len(unresolved),'atlasEntries':len(index['effects']),'sourceBundleEntries':len(index['sourceBundles'])}))

if __name__=='__main__':main()
