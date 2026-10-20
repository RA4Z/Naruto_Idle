"""Validate collection boundaries, source classification and relocated references."""
from pathlib import Path
import csv, json, sys
from entity_layout import read, catalog_path, manifest_path, source_configuration, classify, inventory, write

ROOT = Path(__file__).resolve().parent.parent
assets = ROOT / 'public/assets'
all_entries = read(catalog_path(ROOT))['entities']
main = read(assets / 'characters/index.json')['entities']
review = read(assets / 'para-revisao/index.json')['entities']
errors = []
ninja, battle = source_configuration(Path(r'D:\Naruto Idle\Naruto_Idle'))
ids = lambda entries: {e['id'] for e in entries}
assert len(all_entries) == len(ids(all_entries)) == 1466
assert ids(main).isdisjoint(ids(review)) and ids(main) | ids(review) == ids(all_entries)
file_count = byte_count = url_count = 0
for entry in all_entries:
    path = manifest_path(ROOT, entry); m = read(path)
    assert entry['id'] == m['id'] and entry['manifestUrl'] == m['manifestUrl']
    result, category = classify(m, ninja.get(m['id'], {}), battle.get(m['id'], {}))
    assert result == m['organization'] and category == m['reviewCategory'], m['id']
    assert (entry['collection'] == 'playable') == result['eligible'], m['id']
    if entry['collection'] == 'playable':
        assert path.parent.parent == assets / 'characters'
        assert entry['identity'] != 'unidentified' and not entry['slug'].isdecimal()
        assert all(entry['capabilities'].get(role) for role in ('npc', 'enemy', 'companion'))
    else:
        assert path.parent.parent.parent == assets / 'para-revisao'
    data = inventory(path.parent); file_count += len(data); byte_count += sum(data.values())
    urls = ([m['portrait']] if m.get('portrait') else []) + [a['url'] for mode in m['modes'].values() for a in mode['animations'].values()]
    for url in urls:
        file = (ROOT / 'public' / url.lstrip('/')).resolve()
        assert file.is_relative_to(path.parent.resolve()) and file.is_file(), url
        url_count += 1
    assert (path.parent / 'README.md').is_file()
assert {p.name for p in (assets / 'characters').iterdir() if p.is_dir()} == {e['slug'] for e in main}
with (ROOT / 'reports/character-folders.csv').open(encoding='utf-8-sig', newline='') as stream:
    assert len(list(csv.DictReader(stream, delimiter=';'))) == len(all_entries)
before = read(ROOT / 'reports/character-migration-initial.json')
assert file_count == before['preservedAssetFiles'] and byte_count == before['preservedAssetBytes']
report = {'entities': len(all_entries), 'playableAnimationSets': len(main), 'review': len(review),
          'assetFilesPreserved': file_count, 'assetBytesPreserved': byte_count,
          'validAssetReferences': url_count, 'collectionsDisjoint': True,
          'classificationRecheckedAgainstOriginalConfigs': True, 'errors': errors}
write(ROOT / 'reports/character-layout-validation.json', report)
print(json.dumps(report)); assert not errors
