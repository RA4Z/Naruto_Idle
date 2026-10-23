import copy,hashlib,json,sys,tempfile,unittest
from pathlib import Path
from PIL import Image
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from pack_native_sequence import pack_sequence
from prepare_native_catalog import install_layer
from validate_native_effects import validate_sequence

class SequenceInstallTests(unittest.TestCase):
    def test_bundle_is_not_published_and_corrupt_source_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);native=root/'native';native.mkdir();effects=root/'effects';folder=effects/'source/action/source-sequence';out=root/'project'
            Image.new('RGBA',(8,6),(20,40,180,122)).save(native/'0000.png')
            (native/'render.json').write_text(json.dumps({'staticOnly':True,'frameCount':1,'rectTwips':[-40,-60,120,60],'fps':24}))
            data,proof=pack_sequence(native,folder)
            layer={'sourceSequence':{'manifestPath':'source/action/source-sequence/manifest.json','runtimeAdapterRequired':True},'validation':proof,'artifactsSha256':{name:hashlib.sha256((folder/name).read_bytes()).hexdigest() for name in (*data['frameFiles'],'manifest.json')}}
            before=copy.deepcopy(layer);install_layer(layer,effects,out)
            self.assertFalse((out/'public').exists());target=out/'asset-source/native-effects/source/action/source-sequence'
            self.assertEqual(validate_sequence(target,layer),1)
            self.assertEqual(before['sourceSequence'],layer['sourceSequence'])
            (folder/data['frameFiles'][0]).write_bytes(b'changed')
            with self.assertRaises(ValueError):install_layer(before,effects,out)

    def test_bundle_path_cannot_escape(self):
        for path in ('../manifest.json','/manifest.json','source\\manifest.json','C:/manifest.json'):
            with self.assertRaises(ValueError):install_layer({'sourceSequence':{'manifestPath':path}},Path('.'),Path('.'))

if __name__=='__main__':unittest.main()
