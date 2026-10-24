"""Independent action processes, adaptive RAM admission, one staging writer."""
import concurrent.futures as futures
import copy,json,os,sys,time
from pathlib import Path
from atomic_json import write_json_atomic
from extraction_resources import memory,cpu_ticks,cpu_percent,owned_rss,may_start,RESERVE,ACTION_BUDGET,GIB

def configured_maximum():
    policy=Path('C:/Users/fegug/AppData/Local/ShinobiIdleExtraction/cycles/sequence-parallel-policy.json')
    data=json.loads(policy.read_bytes()) if policy.exists() else {}
    count=data.get('maximumActionWorkers',1)
    if type(count) is not int or count not in (1,2,4):raise ValueError('Action worker limit must be1,2or4')
    return count

def extract_actions(args,tool,item,runner,maximum):
    from overlap_effect_batches import entries,artifacts,contained,copy_artifact,empty_index
    if maximum not in (1,2,4):raise ValueError('Action worker limit must be1,2or4')
    queued=list(enumerate(item['pending']));active={};complete={};samples=[]
    started=time.monotonic();ticks=cpu_ticks();cpu=0;sample_at=started-1
    peak=0;minimum=memory();pool=futures.ThreadPoolExecutor(max_workers=maximum)
    def run_action(number,job,stage,selection,allocation):
        command=[sys.executable,'-X','utf8',tool/'recover_bound_effects.py']
        for key in ('source','project','java','ffdec','classes'):command.extend(['--'+key,getattr(args,key)])
        command.extend(['--output',stage,'--work',item['work'],'--profile-dir',item['work']/f'p{number}',
            '--jobs',selection,'--atlas-format','webp','--allow-pages','--discard-native-frames'])
        environment=os.environ.copy();environment['SHINOBI_ACTION_ALLOCATION']=str(allocation)
        runner.run(command,item['root']/f'a{number}.log',1500,'extract',item['number'],
            environment=environment,tag=job['key'])
        return stage
    try:
        while queued or active:
            if time.monotonic()-started>1500:raise TimeoutError('Balanced action batch budget; preserve every stage')
            for key,record in list(active.items()):
                if record['future'].done():
                    complete[key]=record['future'].result();del active[key]
            now=time.monotonic()
            if now-sample_at>=.75:
                current=cpu_ticks();cpu=cpu_percent(ticks,current);ticks=current;sample_at=now
                free=memory();minimum=min(minimum,free)
                if free<2*GIB:raise MemoryError('Below2GiB; preserve balanced stages and stop only owned children')
                roots=[e['pid'] for e in runner.events if e.get('tag') in active and 'end' not in e]
                rss=owned_rss(roots)
                samples.append({'seconds':round(now-started,2),'systemCPUPercent':round(cpu,2),
                    'availableRAM':free,'actionRSS':rss,'activeActions':len(active)})
            free=memory();reservations=sum(row['reservation'] for row in active.values())
            # Never let two actions overwrite the same decoded SWF or symbol
            # directory. Different source archives are safe to render together.
            busy={row['job']['resource'] for row in active.values()}
            while queued and may_start(free,reservations,rss if active else 0,len(active),maximum,cpu):
                chosen=next((n for n,(_,job) in enumerate(queued) if job['resource'] not in busy),None)
                if chosen is None:break
                number,job=queued.pop(chosen);stage=item['root']/f'o{number}';stage.mkdir()
                selection=item['root']/f'j{number}.json';allocation=item['root']/f'q{number}.json'
                write_json_atomic(selection,[job]);write_json_atomic(stage/'index.json',empty_index())
                write_json_atomic(allocation,{'maximumEncodingWorkers':max(1,(os.cpu_count() or 1)//maximum),
                    'memoryBudgetBytes':ACTION_BUDGET})
                task=pool.submit(run_action,number,job,stage,selection,allocation)
                active[job['key']]={'future':task,'job':job,'allocation':allocation,'reservation':ACTION_BUDGET}
                reservations+=ACTION_BUDGET;busy.add(job['resource']);peak=max(peak,len(active))
            # Once the pending queue is empty, a remaining large clip may use
            # RAM/encoders released by completed clips. Reservations only grow
            # while that process is alive, so admission never double-spends RAM.
            if active:
                if not queued:
                    roots=[e['pid'] for e in runner.events if e.get('tag') in active and 'end' not in e]
                    capacity=max(0,memory()+owned_rss(roots)-RESERVE)
                    share=capacity//len(active)
                else:share=ACTION_BUDGET
                for row in active.values():
                    row['reservation']=max(row['reservation'],share)
                    quota={'maximumEncodingWorkers':max(1,min(24,(os.cpu_count() or 1)//len(active))),
                        'memoryBudgetBytes':row['reservation']}
                    if row.get('quota')!=quota:write_json_atomic(row['allocation'],quota);row['quota']=quota
            time.sleep(.1)
        # Children never update this batch index. Consolidation is serialized,
        # then the unchanged full pixel validator approves the entire batch.
        combined=json.loads((item['output']/'index.json').read_bytes())
        for job in item['pending']:
            stage=complete[job['key']];index=json.loads((stage/'index.json').read_bytes());known=entries(index)
            if set(known)-{job['key']} or set(index.get('deferred',{}))-{job['key']}:raise ValueError('Action wrote unrelated staging data')
            entry=known.get(job['key'])
            if entry is not None:
                if entry['source']!=job['source'] or entry['definition']['frontAction']!=job['action']:
                    raise ValueError('Action staging source differs from original plan')
                for relative,sha,_ in artifacts(entry):copy_artifact(contained(stage,relative),contained(item['output'],relative),sha)
                if job['key'] in entries(combined):raise ValueError('Preserve existing prepared action')
                combined['sourceExports'][job['key']]=entry
            elif job['key'] not in index.get('deferred',{}):raise ValueError('Missing action needs explicit source failure')
            if job['key'] in index.get('deferred',{}):combined['deferred'][job['key']]=index['deferred'][job['key']]
        write_json_atomic(item['output']/'index.json',combined)
        result={'requestedActionWorkers':maximum,'peakActionWorkers':peak,'minimumAvailableRAM':minimum,
            'actionSeconds':time.monotonic()-started,'samples':samples,'actionStages':[str(p) for p in complete.values()],
            'systemCPUPercentMean':sum(s['systemCPUPercent'] for s in samples)/max(1,len(samples)),
            'systemCPUPercentPeak':max((s['systemCPUPercent'] for s in samples),default=0)}
        write_json_atomic(item['root']/'resources.json',result);item['resourceBalance']=result
        return result
    except BaseException:
        runner.abort();raise
    finally:pool.shutdown(wait=True,cancel_futures=True)
