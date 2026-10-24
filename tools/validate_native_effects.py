"""Rebuild every source-rendered frame from public atlases, independent of pack()."""
import argparse,hashlib,json,math,sys
from pathlib import Path,PurePosixPath
from PIL import Image
import xml.etree.ElementTree as ET

def validate_action_metadata(root,evidence,name,metadata):
    """Compare authored keyframes, registrations and named points independently."""
    action=next((a for a in root.findall('action') if a.get('name')==name),None)
    assert action is not None,'Source metadata action absent'
    needed={element.get('assetId') for element in action.iter('element')}
    expected={'configurationEvidence':evidence,'fps':root.get('frameRate'),'action':name,
        'coordinateModel':'original-MME-keyframes-not-world-attachments',
        'actionXml':ET.tostring(action,encoding='unicode'),
        'assetRegistrations':[dict(asset.attrib) for asset in root.findall('asset') if asset.get('id') in needed],
        'externalNames':sorted({element.get('extname') for element in action.iter('element') if element.get('extname')}),
        'namedPoints':[{'layer':dict(layer.attrib),'frame':dict(frame.attrib),'point':dict(point.attrib)} for layer in action.findall('layer') for frame in layer.findall('frame') for point in frame.findall('pointElement')]}
    assert metadata==expected,'Authored source action metadata changed'
    return True

def validate_sequence(folder,layer):
    """Independently inspect full-frame bundles without creating live atlases."""
    data=json.loads((folder/'manifest.json').read_bytes());proof=layer['validation']
    assert data['state']=='source-frames-complete-runtime-adapter-pending'
    assert data['sourcePixelScale']==proof['sourcePixelScale']==1
    assert data['validation']==proof,'Sequence proof changed'
    assert data['sourceBounds']==data['rendererSource']['rectTwips']
    assert math.isfinite(data['fps']) and data['fps']>0 and data['fps']==data['rendererSource']['fps']
    width,height=data['frameSize'];assert 0<width<=8192 and 0<height<=8192 and width*height<=16_000_000
    assert list(proof['nativeCanvasSize'])==[width,height]
    timeline=data['timeline'];files=data['frameFiles']
    assert 1<=len(timeline)<=480 and len(timeline)==proof['nativeFrames']==data['rendererSource']['frameCount']
    assert len(files)==proof['uniqueFrames'] and len(set(files))==len(files)
    assert len(proof['frameRgbaSha256'])==len(timeline)
    assert set(layer['artifactsSha256'])==set(files)|{'manifest.json'}
    for name,digest in layer['artifactsSha256'].items():
        assert Path(name).name==name and name not in ('.','..'),'Sequence artifact escapes folder'
        assert hashlib.sha256((folder/name).read_bytes()).hexdigest()==digest,'Sequence artifact changed'
    left,top=[v/20 for v in data['sourceBounds'][:2]]
    assert len(data['origin'])==2 and math.isclose(data['origin'][0],-left/width,abs_tol=1e-12) and math.isclose(data['origin'][1],-top/height,abs_tol=1e-12)
    hashes={}
    for time,unique in enumerate(timeline):
        assert isinstance(unique,int) and not isinstance(unique,bool) and 0<=unique<len(files)
        if unique not in hashes:
            with Image.open(folder/files[unique]) as raw:
                assert raw.size==(width,height),'Sequence coordinate plane changed'
                image=raw.convert('RGBA')
            hashes[unique]=hashlib.sha256(image.tobytes()).hexdigest();image.close()
        assert hashes[unique]==proof['frameRgbaSha256'][time],'Sequence frame pixels changed'
    assert set(hashes)==set(range(len(files))),'Unused frame not represented by source timeline'
    return len(timeline)

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--project',type=Path,default=Path(__file__).resolve().parents[1]);ap.add_argument('--source');ap.add_argument('--effects-root',type=Path);ap.add_argument('--ids');ap.add_argument('--report',type=Path);ap.add_argument('--java');ap.add_argument('--ffdec');ap.add_argument('--bounds-classes');ap.add_argument('--budget-work');args=ap.parse_args();p=args.project.resolve()
    sys.path.insert(0,str(p/'tools'))
    archive=None
    if args.source:
        from original_archive import OriginalArchive
        archive=OriginalArchive(args.source)
    root=args.effects_root.resolve() if args.effects_root else p/'public/assets/effects/native'
    def asset(url):
        assert url.startswith('/assets/effects/native/'), 'Unexpected effect URL'
        relative=PurePosixPath(url.removeprefix('/assets/effects/native/'))
        assert not relative.is_absolute() and '..' not in relative.parts and not any(c in str(relative) for c in ('\\',':')), 'Effect path escapes root'
        return root/relative
    index=json.loads((root/'index.json').read_bytes());rows=[];entries={}
    for table in ('effects','sourceBundles','sourceExports'):
        for ident,entry in index.get(table,{}).items():
            assert ident not in entries,'Effect/source key belongs to two tables'
            entries[ident]=entry
    selected=set(args.ids.split(',')) if args.ids else set(entries)
    assert selected<=set(entries), 'Requested unprepared effect/source IDs'
    if args.ids:assert 1<=len(selected)<=24, 'One cycle contains at most 24 effect IDs'
    for ident,entry in entries.items():
        if ident not in selected:continue
        entry_digest=hashlib.sha256(json.dumps(entry,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
        if archive:
            for evidence in (entry['source'],entry['sourceConfig']):assert archive.record(evidence['path'])==evidence,'Original bytes changed'
        scene_verified=False;role_verified=False
        if entry.get('sourceKind')=='scene-exported-sprite':
            assert archive is not None,'Original source required for scene export provenance'
            from scene_export_contract import validate_scene_entry
            scene_verified=validate_scene_entry(archive,entry)
        if entry.get('sourceKind')=='role-left-exported-sprite':
            assert archive is not None,'Original source required for role export provenance'
            from role_export_contract import validate_role_entry
            role_verified=validate_role_entry(archive,entry)
        if entry.get('sourceKind')=='role-mme-action':
            assert archive is not None,'Original source required for role MME provenance'
            from role_mme_contract import validate_role_mme_entry
            role_verified=validate_role_mme_entry(archive,entry)
        native_pixel_limit=16_000_000
        if entry.get('offlineRenderBudget'):
            from reviewed_native_budget import reviewed_limit,probe_original_bounds
            native_pixel_limit=reviewed_limit(archive,entry,lambda job:probe_original_bounds(archive,job,java=args.java,ffdec=args.ffdec,classes=args.bounds_classes,work=args.budget_work,project=p))
        for layer in entry['layers']:
            if archive and layer.get('rendererSemanticEvidence'):assert archive.record(layer['rendererSemanticEvidence']['path'])==layer['rendererSemanticEvidence'],'Original MME core changed'
            metadata_verified=False
            if layer.get('sourceActionData') is not None:
                assert archive is not None,'Original source required for authored action metadata'
                from mme_config import read_config
                source_root,_,evidence=read_config(archive.raw(entry['source']['path']),action_names={layer['action']})
                metadata_verified=validate_action_metadata(source_root,evidence,layer['action'],layer['sourceActionData'])
            if layer.get('sourceSequence'):
                relative=PurePosixPath(layer['sourceSequence']['manifestPath'])
                assert not relative.is_absolute() and '..' not in relative.parts and relative.name=='manifest.json' and not any(c in str(relative) for c in ('\\',':'))
                folder=root/relative.parent
                if not folder.is_dir():folder=p/'asset-source/native-effects'/relative.parent
                frames=validate_sequence(folder,layer)
                if scene_verified or role_verified:assert json.loads((folder/'manifest.json').read_bytes())['fps']==entry['sourceExport']['fps'],'Scene sequence fps differs from original'
                rows.append({'id':ident,'action':layer['action'],'plane':layer['plane'],'frames':frames,'sourceEntrySha256':entry_digest,'allSourceRenderedFramesReconstructed':True,'artifactsSha256Match':True,'originalArchiveVerified':bool(archive),'sourceActionMetadataMatch':metadata_verified,'sourceSceneExportMatch':scene_verified,'sourceRoleExportMatch':role_verified,'sourcePixelScale':1,'offlineRenderBudgetVerified':bool(entry.get('offlineRenderBudget')),'state':'source-frames-complete-runtime-adapter-pending'})
                continue
            a=layer['animation'];proof=layer['validation'];folder=asset(a['url']).parent
            for name,digest in layer['artifactsSha256'].items():assert hashlib.sha256((folder/name).read_bytes()).hexdigest()==digest,'Prepared artifact hash changed: '+str(folder/name)
            assert a['sourcePixelScale']==1 and len(a['timeline'])==proof['nativeFrames']
            assert len(a['frameOrigins'])==a['frames'] and len(proof['frameRgbaSha256'])==len(a['timeline'])
            width,height=proof['nativeCanvasSize'];assert 0<width<=8192 and 0<height<=8192 and width*height<=native_pixel_limit
            left,top=[v/20 for v in a['sourceBounds'][:2]]
            atlas=json.loads(asset(a['packedAtlasUrl']).read_bytes())['frames']
            page_urls=a.get('atlasPageUrls',[a['url']]);frame_pages=a.get('framePages',[0]*a['frames'])
            assert len(frame_pages)==a['frames'] and 1<=len(page_urls)<=16
            assert all(isinstance(page,int) and 0<=page<len(page_urls) for page in frame_pages)
            image=None;loaded_page=-1
            try:
                for time,unique in enumerate(a['timeline']):
                    page=frame_pages[unique]
                    if page!=loaded_page:
                        if image is not None:image.close()
                        with Image.open(asset(page_urls[page])) as raw:image=raw.convert('RGBA')
                        assert max(image.size)<=8192 and image.width*image.height<=16_000_000
                        loaded_page=page
                    r=atlas[str(unique)]['frame'];x,y,w,h=[r[k] for k in ('x','y','w','h')]
                    assert x>=0 and y>=0 and w>0 and h>0 and x+w<=image.width and y+h<=image.height
                    frame=Image.new('RGBA',(width,height));crop=image.crop((x,y,x+w,y+h));ox,oy=a['frameOrigins'][unique]
                    if crop.getbbox():frame.alpha_composite(crop,(round(-ox*w-left),round(-oy*h-top)))
                    assert hashlib.sha256(frame.tobytes()).hexdigest()==proof['frameRgbaSha256'][time],f'Frame pixels or source registration changed: {ident}/{layer["action"]}/{time}'
            finally:
                if image is not None:image.close()
            rows.append({'id':ident,'action':layer['action'],'plane':layer['plane'],'frames':len(a['timeline']),'sourceEntrySha256':entry_digest,'allSourceRenderedFramesReconstructed':True,'artifactsSha256Match':True,'originalArchiveVerified':bool(archive),'sourceActionMetadataMatch':metadata_verified,'sourceSceneExportMatch':scene_verified,'sourceRoleExportMatch':role_verified,'sourcePixelScale':1,'offlineRenderBudgetVerified':bool(entry.get('offlineRenderBudget'))})
    report={'effects':len(selected),'catalogEffects':len(index['effects']),'catalogSourceBundles':len(index.get('sourceBundles',{})),'catalogSourceExports':len(index.get('sourceExports',{})),'layers':len(rows),'frames':sum(r['frames'] for r in rows),'rows':rows,'scope':'All persisted atlas/sequence timelines reconstructed on the original static-render canvas and compared against per-frame RGBA hashes. No Flash player or ActionScript execution; not proof of runtime scripts or unresolved world attachments.'}
    target=args.report or p/'reports/native-effects-validation.json';target.parent.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='rows'}))

if __name__=='__main__':main()
