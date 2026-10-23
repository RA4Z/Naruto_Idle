import hashlib,json,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from recover_bound_effects import cached_layer

class EffectCacheTests(unittest.TestCase):
    def test_reuse_requires_same_original_action_proof_and_untampered_artifacts(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);folder=root/'source/action';folder.mkdir(parents=True)
            (folder/'effect.webp').write_bytes(b'verified-artifact')
            evidence={'path':'original.swf','sha256':'original-sha','tag':'version1'}
            layer={'action':'attack','plane':'front','animation':{'url':'/assets/effects/native/source/action/effect.webp'},
                   'validation':{'allFramesPixelExact':True},'artifactsSha256':{'effect.webp':hashlib.sha256(b'verified-artifact').hexdigest()}}
            index={'effects':{'1':{'source':evidence,'layers':[layer]}}}
            result=cached_layer(index,evidence,'attack',root)
            self.assertEqual(result,layer)
            result['plane']='back';self.assertEqual(layer['plane'],'front')
            self.assertIsNone(cached_layer(index,{**evidence,'sha256':'different'},'attack',root))
            self.assertIsNone(cached_layer(index,evidence,'other-action',root))
            (folder/'effect.webp').write_bytes(b'changed-artifact')
            self.assertIsNone(cached_layer(index,evidence,'attack',root))

if __name__=='__main__':unittest.main()
