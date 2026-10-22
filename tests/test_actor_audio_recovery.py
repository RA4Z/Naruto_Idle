import contextlib
import hashlib
import io
import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
import recover_entity_audio as recovery


class RecoveryTests(unittest.TestCase):
    def run_case(self, root, sound='871', malformed_second=False, nested_voice=False, empty_package=False):
        config = b'<root/>'
        if nested_voice:
            config = b'<root><group name="voice"><group name="male"><package id="100" playMethod="1" src="swf/s100.swf" volume="100"><item id="1" percent="100" enabled="true"/></package></group></group></root>'
        if empty_package:
            config = b'<root><group name="voice"><package id="100" playMethod="1" src="swf/s100.swf" volume="100" num="0"/></group></root>'
        action = f'<actions frameRate="24"><action name="A_1hit"><layer><frame index="2" length="2" sound="{sound}" volume="100"/></layer></action><action name="C_dead"><layer><frame index="0" length="3"/></layer></action></actions>'.encode()
        records = {'assets/sound/soundConfig.xml': config, 'assets/sound/deathSoundConfig.xml': b'<root/>',
                   'assets/battle/role/left/11000701.swf': action,
                   'assets/battle/role/left/11000801.swf': b'<actions invalid' if malformed_second else action,
                   'assets/sound/swf/s100.swf': b'sound-container'}
        class Archive:
            def __init__(self, source): self.root = root.parent / 'separate-source'
            def raw(self, name): return records[name]
            def data(self, name): return records[name]
            def record(self, name):
                raw=records[name]
                return {'path': name, 'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw), 'tag': 'fixture'}
        def tags(raw):
            if raw==b'sound-container':
                yield 76,struct.pack('<HH',1,1)+b's1\0'
                yield 14,struct.pack('<HBIh',1,0x2f,44100,0)+b'\xff\xfbfixture-mp3'
            else: yield 87,b'\0'*6+raw
        def write(path, data):
            path.parent.mkdir(parents=True,exist_ok=True)
            path.write_text(json.dumps(data),encoding='utf-8')
        (root/'public/assets/catalog').mkdir(parents=True)
        (root/'public/assets/catalog/entities.json').write_text(json.dumps({'entities': [{'id': '11000701', 'name':'Ino'}, {'id':'11000801','name':'Shikamaru'}]}))
        (root/'public/assets/presentation.json').write_text('{"sounds":{}}')
        with patch.object(recovery,'ROOT',root),patch.object(recovery,'OriginalArchive',Archive),patch.object(recovery,'tags',tags),patch.object(recovery,'write',side_effect=write),contextlib.redirect_stdout(io.StringIO()):
            recovery.recover('fixture',['11000701','11000801'] if malformed_second else ['11000701'])

    def test_missing_package_preserves_unresolved_event_without_substitute(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);self.run_case(root)
            actor=json.loads((root/'public/assets/audio/entities/11000701.json').read_text())
            self.assertEqual(actor['status'],'partial')
            self.assertEqual(actor['sounds'],{})
            self.assertEqual(actor['actions']['A_1hit'],[])
            event=actor['unresolvedEvents'][0]
            self.assertEqual((event['sound'],event['frame'],event['action']),('871',2,'A_1hit'))
            self.assertFalse(list(root.rglob('*.mp3')))

    def test_invalid_second_model_does_not_publish_first_or_replace_catalog(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            with self.assertRaises(ET.ParseError):self.run_case(root,malformed_second=True)
            self.assertFalse((root/'public/assets/audio/entities').exists())
            self.assertEqual(json.loads((root/'public/assets/presentation.json').read_text()),{'sounds':{}})

    def test_nested_voice_ancestor_and_native_mp3_payload_are_preserved(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);self.run_case(root,sound='100',nested_voice=True)
            actor=json.loads((root/'public/assets/audio/entities/11000701.json').read_text())
            sound=actor['sounds']['100']
            self.assertEqual(sound['sourceGroups'],['male','voice'])
            self.assertTrue(sound['voice'])
            self.assertEqual((root/'public/assets/audio/sfx/100/1.mp3').read_bytes(),b'\xff\xfbfixture-mp3')
            self.assertEqual(actor['actions']['A_1hit'][0]['time'],2*1000/24)

    def test_zero_clip_package_is_native_silence_not_missing_audio(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);self.run_case(root,sound='100',empty_package=True)
            actor=json.loads((root/'public/assets/audio/entities/11000701.json').read_text())
            self.assertEqual(actor['status'],'ready')
            self.assertEqual(actor['unresolvedEvents'],[])
            self.assertEqual(actor['silentEvents'][0]['state'],'original-silent-package')
            self.assertFalse(list(root.rglob('*.mp3')))

    def test_original_zero_padding_before_mp3_header_is_recognized_without_trimming(self):
        raw=b'\0'*417+b'\xff\xfb\x90\x00payload'
        self.assertEqual(recovery.mp3_padding(raw),417)
        self.assertEqual(len(raw),428)
        with self.assertRaises(ValueError):recovery.mp3_padding(b'\0'*5000+b'\xff\xfb\x90\x00')


if __name__=='__main__':unittest.main()
