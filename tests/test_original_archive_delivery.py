import json, sys, tempfile, unittest, zlib
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from original_archive import OriginalArchive

class DeliveredArchiveTests(unittest.TestCase):
    def test_manifest_version_wins_over_other_versions_and_preserves_bytes(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root/'manifestos').mkdir()
            record = {'original_path':'config/world/SceneCFG.xml','version':'chosen','category':'outros'}
            (root/'manifestos/inventory.json').write_text(json.dumps([record]),encoding='utf-8')
            for version,content in [('chosen',b'<scene/>'),('newer',b'<wrong/>')]:
                p=root/'outros'/version/record['original_path'];p.parent.mkdir(parents=True);p.write_bytes(zlib.compress(content))
            archive=OriginalArchive(root)
            before=archive.path(record['original_path']).read_bytes()
            self.assertEqual(archive.data(record['original_path']),b'<scene/>')
            self.assertEqual(archive.record(record['original_path'])['tag'],'chosen')
            self.assertEqual(archive.raw(record['original_path']),before)

    def test_ambiguous_export_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/'manifestos').mkdir()
            row={'original_path':'x','version':'a','category':'mapas'}
            (root/'manifestos/inventory.json').write_text(json.dumps([row,row]),encoding='utf-8')
            with self.assertRaisesRegex(ValueError,'Ambiguous'):OriginalArchive(root)

    def test_source_traversal_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/'manifestos').mkdir()
            row={'original_path':'../../outside','version':'a','category':'mapas'}
            (root/'manifestos/inventory.json').write_text(json.dumps([row]),encoding='utf-8')
            archive=OriginalArchive(root)
            with self.assertRaisesRegex(ValueError,'Invalid'):archive.path(row['original_path'])

    def test_original_layout_still_resolves(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/'recovery').mkdir()
            (root/'recovery/resource-manifest.json').write_text(json.dumps({'assets':[{'path':'x','tag':'v1'}]}),encoding='utf-8')
            (root/'recovered-web/cdn/v1').mkdir(parents=True);(root/'recovered-web/cdn/v1/x').write_bytes(b'original')
            archive=OriginalArchive(root)
            self.assertEqual(archive.raw('x'),b'original')
            self.assertFalse(archive.delivery)

    def test_category_and_version_cannot_escape_delivery(self):
        for category,version in [('../elsewhere','v1'),('mapas','../v1')]:
            with self.subTest(category=category),tempfile.TemporaryDirectory() as temp:
                root=Path(temp);(root/'manifestos').mkdir()
                row={'original_path':'x','version':version,'category':category}
                (root/'manifestos/inventory.json').write_text(json.dumps([row]),encoding='utf-8')
                with self.assertRaises(ValueError):OriginalArchive(root).path('x')

if __name__=='__main__':unittest.main()
