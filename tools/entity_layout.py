"""Organize converted actors; preserve IDs, source files and every atlas byte.

The playable collection describes animation suitability, not completed game rules.
Run after either recovery pass. Unknown and incomplete models stay reviewable.
"""
from pathlib import Path
import argparse, collections, csv, hashlib, io, json, re, unicodedata, zlib
import xml.etree.ElementTree as ET

WORLD = [f'{action}_{i}' for action in ('idle', 'run') for i in range(8)]
BATTLE = ['C_idle', 'A_1hit', 'C_dead']
SUMMARY_KEYS = ['id', 'slug', 'name', 'aliases', 'identity', 'sourceRoles', 'hostile',
                'starter', 'portrait', 'status', 'capabilities', 'manifestUrl',
                'collection', 'reviewCategory', 'organization', 'variant', 'preview']

def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))

def write(path, value):
    path = Path(path); path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    temp.replace(path)

def catalog_path(project):
    current = Path(project) / 'public/assets/catalog/entities.json'
    return current if current.exists() else Path(project) / 'public/assets/characters/index.json'

def manifest_path(project, entry):
    url = entry.get('manifestUrl', '/assets/characters/' + entry['slug'] + '/manifest.json')
    path = (Path(project) / 'public' / url.lstrip('/')).resolve()
    if not path.is_relative_to((Path(project) / 'public/assets').resolve()):
        raise ValueError('Manifest outside prepared assets: ' + url)
    return path

def slugify(name):
    ascii_name = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', ascii_name).strip('-')[:100] or 'nome-original'

def source_configuration(source):
    rows = read(Path(source) / 'recovery/resource-manifest.json')['assets']
    def xml(path):
        row = next(r for r in rows if r['path'] == path)
        data = (Path(source) / 'recovered-web/cdn' / row['tag'] / path).read_bytes()
        try: data = zlib.decompress(data)
        except zlib.error: pass
        return ET.fromstring(data)
    ninja = {e.findtext('id'): {k.tag: (k.text or '').strip() for k in e}
             for e in xml('config/user/NinjaInfoCFG.xml')}
    battle = {e.get('id'): e.attrib for e in xml('config/battle/NinjaInfos.xml')}
    return ninja, battle

def action_problems(data, actions):
    problems = []
    for issue in data.get('issues', []):
        if not isinstance(issue, dict) or issue.get('action') not in actions: continue
        # External effects (including the common shadow) are separate resources.
        if issue.get('missing') or set(issue.get('unsupported', [])) - {'extname'} or issue.get('reason'):
            problems.append(issue)
    for action in actions:
        anim = data.get('animations', {}).get(action, {})
        moving = action.startswith(('run_', 'A_', 'SP_'))
        if anim.get('coverage') or (moving and anim.get('frames', 0) < 2):
            problems.append({'action': action, 'reason': 'static-or-incomplete-animation'})
    return problems

def classify(m, info, battle_info):
    world = m.get('modes', {}).get('world', {})
    battle = m.get('modes', {}).get('battle', {})
    wa, ba = world.get('animations', {}), battle.get('animations', {})
    missing = ['world/' + a for a in WORLD if a not in wa] + ['battle/' + a for a in BATTLE if a not in ba]
    specials = [a for a in ba if re.fullmatch(r'SP_skill\d+', a)]
    clean_specials = [a for a in specials if not action_problems(battle, [a])]
    if not clean_specials: missing.append('battle/SP_skill (ao menos uma ação preservada)')
    problems = action_problems(world, [a for a in WORLD if a in wa]) + action_problems(battle, [a for a in BATTLE if a in ba])
    # Original regular ninja resources use 110..., player classes use 100... .
    # Monster/NPC families (119..., 130..., 190..., scene IDs) remain in review,
    # even if they happen to use compatible rigs.
    regular = (m['id'].startswith('110') or (m['id'].startswith('100') and info.get('levelType') == '1'))
    regular = regular and info.get('type') == '0' and battle_info.get('noticeUI') == '1' and not battle_info.get('callupType')
    named = bool(info.get('name') or (info.get('levelType') == '1' and info.get('title')) or m.get('starter'))
    translated = not re.search(r'[\u3400-\u9fff]', m['name'])
    eligible = regular and named and translated and not missing and not problems
    reason = 'Caminhada em oito direções, ataque, queda e especial preservados.'
    category = None
    if not eligible:
        if not m.get('modes') and m.get('portrait'):
            category, reason = 'retratos', 'Retrato isolado; animações indisponíveis.'
        elif info.get('type') not in (None, '0') or battle_info.get('callupType') or m['id'].startswith('130'):
            category, reason = 'invocacoes-e-objetos', 'Invocação, clone ou objeto auxiliar na configuração original.'
        elif not regular and (named or m['identity'] != 'unidentified'):
            category, reason = 'npcs-inimigos-e-cenario', 'NPC, inimigo ou recurso de cenário fora da coleção de ninjas regulares.'
        elif not named or not translated:
            category, reason = 'sem-identificacao', 'Identidade ou nome em português ainda requer conferência.'
        else:
            category, reason = 'animacoes-incompletas', 'Faltam ações padrão ou há partes visuais não recuperadas.'
    return {'eligible': bool(eligible), 'reason': reason, 'missingActions': missing,
            'visualProblems': problems, 'specialActions': clean_specials,
            'criterionVersion': 1}, category

def rewrite_urls(value, old, new):
    if isinstance(value, dict): return {k: rewrite_urls(v, old, new) for k, v in value.items()}
    if isinstance(value, list): return [rewrite_urls(v, old, new) for v in value]
    if isinstance(value, str) and value.startswith(old + '/'): return new + value[len(old):]
    return value

def inventory(folder):
    return {str(p.relative_to(folder)): p.stat().st_size for p in folder.rglob('*') if p.is_file() and p.name not in ('manifest.json', 'README.md', 'preview.png')}

def move_folder(folder, target, assets):
    if not folder.resolve().is_relative_to(assets.resolve()) or not target.resolve().is_relative_to(assets.resolve()):
        raise ValueError('Move outside prepared assets')
    try:
        folder.rename(target)
    except PermissionError:
        # Windows directory watchers may prevent a directory rename while allowing
        # each file to move. No recursive deletion or overwriting is performed.
        target.mkdir()
        files = sorted([f for f in folder.rglob('*') if f.is_file()], key=lambda f: f.name == 'manifest.json')
        for file in files:
            dest = target / file.relative_to(folder)
            dest.parent.mkdir(parents=True, exist_ok=True)
            file.rename(dest)
        for directory in sorted([d for d in folder.rglob('*') if d.is_dir()], key=lambda d: len(d.parts), reverse=True):
            try: directory.rmdir()
            except PermissionError: pass
        try: folder.rmdir()
        except (PermissionError, OSError): pass

def organize(project, source):
    project, source = Path(project).resolve(), Path(source).resolve()
    assets = project / 'public/assets'; ninja, original_battle = source_configuration(source)
    manifests = sorted([*(assets / 'characters').glob('*/manifest.json'),
                        *(assets / 'para-revisao').glob('*/*/manifest.json')])
    ids = [read(f)['id'] for f in manifests]
    if len(set(ids)) != len(ids): raise ValueError('Duplicate manifest IDs; resolve before moving')
    plans = []
    for path in manifests:
        m = read(path); info = ninja.get(m['id'], {}); original_name = m.get('name')
        title = ' '.join(info.get('title', '').strip('[]').split())
        if not m.get('starter'):
            name = info.get('name') or (title if info.get('levelType') == '1' else m['name'])
            m['name'] = ' '.join(name.split()); m['variant'] = title if info.get('name') else ''
        m['aliases'] = list(dict.fromkeys([a for a in [*(m.get('aliases') or []), original_name, m['name']] if a]))
        if info.get('name') or (info.get('levelType') == '1' and title):
            if not m.get('starter'): m['identity'] = 'source-config'
        organization, category = classify(m, info, original_battle.get(m['id'], {}))
        m.update(organization=organization, collection='playable' if organization['eligible'] else 'review', reviewCategory=category)
        m['sourceIdentity'] = {'config': 'config/user/NinjaInfoCFG.xml',
            **{k: info.get(k) for k in ('name', 'title', 'type', 'artisticId', 'levelType', 'series', 'starLevel')}}
        label = m['name'] + (' ' + m['variant'] if m.get('variant') else '')
        slug = m['slug'] if m.get('starter') else slugify(label) + '-' + m['id']
        target = assets / ('characters' if organization['eligible'] else 'para-revisao/' + category) / slug
        if not path.parent.resolve().is_relative_to(assets.resolve()) or not target.resolve().is_relative_to(assets.resolve()):
            raise ValueError('Move outside prepared assets')
        if target.exists() and target.resolve() != path.parent.resolve(): raise ValueError('Destination already exists: ' + str(target))
        old_url = '/' + path.parent.relative_to(project / 'public').as_posix()
        new_url = '/' + target.relative_to(project / 'public').as_posix()
        m = rewrite_urls(m, old_url, new_url)
        m.update(slug=slug, manifestUrl=new_url + '/manifest.json')
        if (path.parent/'preview.png').exists(): m['preview']=new_url+'/preview.png'
        plans.append((path.parent, target, m, old_url, new_url))
    entries, moves = [], []; total_files = 0; total_bytes = 0
    for folder, target, m, old_url, new_url in plans:
        before = inventory(folder); target.parent.mkdir(parents=True, exist_ok=True)
        if target.resolve() != folder.resolve(): move_folder(folder,target,assets); moves.append({'id': m['id'], 'from': old_url, 'to': new_url})
        after = inventory(target)
        if before != after: raise ValueError('Asset inventory changed while moving ' + m['id'])
        total_files += len(after); total_bytes += sum(after.values())
        write(target / 'manifest.json', m)
        display = m['name'] + (' [' + m['variant'] + ']' if m.get('variant') else '')
        (target / 'README.md').write_text(f'# {display}\n\nID original: `{m["id"]}`.\n\n{m["organization"]["reason"]}\n\n'
            'As pastas `world/` e `battle/` preservam os nomes das ações originais. '
            '`portrait.png`, quando presente, pertence a este modelo. '
            'Consulte `manifest.json` para fontes, ações ausentes e efeitos externos pendentes.\n', encoding='utf-8')
        entries.append({k: m.get(k) for k in SUMMARY_KEYS})
    entries.sort(key=lambda e: (e['name'].casefold(), e.get('variant') or '', e['id']))
    playable = [e for e in entries if e['collection'] == 'playable']; review = [e for e in entries if e['collection'] == 'review']
    for path, subset in [(assets / 'catalog/entities.json', entries), (assets / 'characters/index.json', playable), (assets / 'para-revisao/index.json', review)]:
        write(path, {'version': 4, 'entities': subset})
    for category in sorted(set(e['reviewCategory'] for e in review)):
        write(assets / 'para-revisao' / category / 'index.json', {'version': 4, 'entities': [e for e in review if e['reviewCategory'] == category]})
    rows = io.StringIO(newline=''); writer = csv.writer(rows, delimiter=';'); writer.writerow(['Nome', 'Variante', 'ID original', 'Coleção', 'Pasta', 'Motivo'])
    for e in entries: writer.writerow([e['name'], e.get('variant') or '', e['id'], e['collection'], e['manifestUrl'].rsplit('/', 1)[0], e['organization']['reason']])
    (project / 'reports/character-folders.csv').write_text(rows.getvalue(), encoding='utf-8-sig')
    report = {'entities': len(entries), 'playableAnimationSets': len(playable), 'review': len(review),
        'reviewCategories': dict(collections.Counter(e['reviewCategory'] for e in review)),
        'preservedAssetFiles': total_files, 'preservedAssetBytes': total_bytes,
        'movesThisRun': len(moves), 'moves': moves, 'errors': []}
    write(project / 'reports/character-organization.json', report)
    for name, subset, title in [('characters', playable, 'Personagens com animações padrão'), ('para-revisao', review, 'Acervo para revisão')]:
        lines = [f'# {title}', '', f'{len(subset)} modelos. O catálogo global está em `../catalog/entities.json`.', '',
            'Somente a coleção principal exige caminhada em oito direções, repouso de combate, ataque, queda e um especial preservados. '
            'Os nomes e trajes vêm das configurações originais; IDs distinguem variantes. Efeitos externos e regras individuais de jutsu ainda podem exigir integração. '
            'Esta classificação não adiciona novos protagonistas à seleção inicial.', '', '| Nome / variante | ID | Pasta |', '| --- | --- | --- |']
        for e in subset:
            label = e['name'] + (' [' + e['variant'] + ']' if e.get('variant') else '')
            relative = manifest_path(project, e).parent.relative_to(assets / name).as_posix()
            lines.append(f'| {label.replace("|", "/")} | {e["id"]} | [{relative}]({relative}/) |')
        (assets / name / 'README.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    return report

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--project', default=str(Path(__file__).resolve().parent.parent)); ap.add_argument('--source', default=r'D:\Naruto Idle\Naruto_Idle')
    args = ap.parse_args(); result = organize(args.project, args.source)
    print(json.dumps({k: v for k, v in result.items() if k != 'moves'}, ensure_ascii=True))
