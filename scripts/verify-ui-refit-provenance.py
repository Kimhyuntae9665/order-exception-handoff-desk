"""Verify final versioned UI source bytes and preserved captured media; CPU only."""
import hashlib,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
MANIFEST=ROOT/'evidence/ui-refit-source-provenance.json'
UI=['ui-server-v2.mjs','ui/v2/index.html','ui/v2/style.css','ui/v2/app.mjs']
def record(name):
 data=(ROOT/name).read_bytes()
 return {'path':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
if '--write' in sys.argv:
 captured=json.loads((ROOT/'evidence/ui-refit-browser-checks.json').read_text())
 preserved=[r['path'] for r in captured['media']]+['docs/cpu-native-demo.mp4','evidence/ui-refit-browser-checks.json','evidence/browser-checks.json','evidence/demo-transitions.json']
 data={'schema_version':'P14-UI-REFIT-SOURCE-PROVENANCE-1','kind':'Final authored static UI source and unchanged existing browser/media evidence','ui_source_commit':'ce77096ea9bab7534843c55c1c4fd01a1147f309','model_calls':0,'browser_or_media_regenerated':False,'current_ui_source':[record(p)for p in UI],'original_backend_contract':record('evidence/cpu-contract-freeze.json'),'preserved_media_and_evidence':[record(p)for p in preserved]}
 with MANIFEST.open('x')as f:f.write(json.dumps(data,indent=2)+'\n')
data=json.loads(MANIFEST.read_text())
assert [r['path']for r in data['current_ui_source']]==UI
assert data['model_calls']==0 and data['browser_or_media_regenerated']is False
files=data['current_ui_source']+[data['original_backend_contract']]+data['preserved_media_and_evidence']
for expected in files:assert record(expected['path'])==expected,expected['path']
print(json.dumps({'current_ui_sources_verified':len(UI),'preserved_media_and_evidence_verified':len(data['preserved_media_and_evidence']),'original_contract_manifest_verified':True,'model_calls':0,'media_regenerated':False}))
