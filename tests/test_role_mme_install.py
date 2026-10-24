import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from original_archive import OriginalArchive
from role_mme_contract import role_mme_facts
from install_source_exports import publish, entry_digest
import test_role_mme_contract as mme_fixture


class RoleMmeInstallTests(unittest.TestCase):
    def fixture(self, directory):
        original, project, stage = directory/'original', directory/'project', directory/'stage'
        fixture_archive, job = mme_fixture.RoleMmeContractTests().fixture()
        logical, core_path = job['resource'], 'flash/core/naruto.core.swf'
        (original/'manifestos').mkdir(parents=True)
        (original/'manifestos/inventory.json').write_text(json.dumps([{'original_path': path, 'version': 'v1', 'category': 'source'} for path in (logical, core_path)]))
        for path, raw in ((logical, fixture_archive.data), (core_path, b'pinned-original-core')):
            target=original/'source/v1'/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw)
        archive=OriginalArchive(original);job['source']=archive.record(logical);job['core']=archive.record(core_path)
        facts=role_mme_facts(archive,job)
        relative='sourcehash/actionhash';folder=stage/relative;folder.mkdir(parents=True)
        for name in ('atlas.webp','manifest.json','effect-atlas.json'):(folder/name).write_bytes(b'previously-proven-raster')
        definition={'url':'/assets/effects/native/'+relative+'/atlas.webp','packedAtlasUrl':'/assets/effects/native/'+relative+'/effect-atlas.json','sourcePixelScale':1,'fps':24,'timeline':[0,0]}
        entry={'id':job['key'],'sourceOnly':True,'sourceKind':'role-mme-action','bindingOrigin':'exported-source-action-not-a-skill-id',
            'source':job['source'],'sourceConfig':job['source'],'definition':{'frontAction':job['action']},'sourceExport':facts,
            'layers':[{'plane':'front','action':job['action'],'namedInstances':[],'configurationEvidence':facts['configurationEvidence'],
                'rendererSemanticEvidence':facts['rendererSemanticEvidence'],'sourceActionData':facts['sourceActionData'],
                'validation':{'nativeFrames':2},'animation':definition,'artifactsSha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in folder.iterdir()}}]}
        (stage/'index.json').write_text(json.dumps({'sourceExports':{job['key']:entry}}))
        index=project/'public/assets/effects/native/index.json';index.parent.mkdir(parents=True);index.write_text(json.dumps({'effects':{'2015':{'preserve':True}},'sourceBundles':{},'deferred':{}}))
        proof=stage/'proof.json';proof.write_text(json.dumps({'rows':[{'id':job['key'],'action':job['action'],'plane':'front','frames':2,'sourcePixelScale':1,
            'sourceRoleExportMatch':True,'sourceEntrySha256':entry_digest(entry),'allSourceRenderedFramesReconstructed':True,'artifactsSha256Match':True,'originalArchiveVerified':True}]}))
        return project,stage,archive,job['key'],proof,index

    def test_explicit_mme_publication_is_idempotent_and_preserves_live_effect(self):
        with tempfile.TemporaryDirectory() as tmp:
            p,s,a,i,proof,index=self.fixture(Path(tmp))
            result=publish(p,s,a,[i],[proof],source_kind='role-mme-action');self.assertEqual(result['added'],[i])
            self.assertEqual(json.loads(index.read_bytes())['effects'],{'2015':{'preserve':True}})
            before=index.read_bytes();self.assertEqual(publish(p,s,a,[i],[proof],source_kind='role-mme-action')['alreadyCurrent'],[i]);self.assertEqual(index.read_bytes(),before)

    def test_wrong_kind_or_missing_independent_role_proof_never_changes_index(self):
        for kind in ('battle-effect-exported-sprite','scene-exported-sprite','role-left-exported-sprite','role-mme-action'):
            with self.subTest(kind=kind),tempfile.TemporaryDirectory() as tmp:
                p,s,a,i,proof,index=self.fixture(Path(tmp));before=index.read_bytes()
                if kind=='role-mme-action':
                    report=json.loads(proof.read_bytes());del report['rows'][0]['sourceRoleExportMatch'];proof.write_text(json.dumps(report))
                with self.assertRaises(ValueError):publish(p,s,a,[i],[proof],source_kind=kind)
                self.assertEqual(index.read_bytes(),before)


if __name__=='__main__':unittest.main()
