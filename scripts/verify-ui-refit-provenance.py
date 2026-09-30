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
if '--refresh-minimal' in sys.argv:
 data=json.loads(MANIFEST.read_text());updated={'docs/ui-refit/08-service-minimal.png','evidence/ui-refit-browser-checks.json'}
 for expected in data['preserved_media_and_evidence']:
  if expected['path']not in updated:assert record(expected['path'])==expected,expected['path']
 for expected in data['current_ui_source']:
  if expected['path']!='ui/v2/app.mjs':assert record(expected['path'])==expected,expected['path']
 data.pop('ui_source_commit',None);data['source_identity']='SHA-256 and byte counts of final served source; verified from committed checkout in CI';data['current_ui_source']=[record(p)for p in UI];data['browser_or_media_regenerated']=True;data['media_update']='Only screenshot08 recaptured for historical Service branch; other nine screenshots and historical video unchanged';data['preserved_media_and_evidence']=[record(r['path'])for r in data['preserved_media_and_evidence']]+[record('evidence/ui-refit-minimal-branch.json')];MANIFEST.write_text(json.dumps(data,indent=2)+'\n')
data=json.loads(MANIFEST.read_text())
assert [r['path']for r in data['current_ui_source']]==UI
assert data['model_calls']==0 and isinstance(data['browser_or_media_regenerated'],bool)
files=data['current_ui_source']+[data['original_backend_contract']]+data['preserved_media_and_evidence']
for expected in files:assert record(expected['path'])==expected,expected['path']
print(json.dumps({'current_ui_sources_verified':len(UI),'preserved_media_and_evidence_verified':len(data['preserved_media_and_evidence']),'original_contract_manifest_verified':True,'model_calls':0,'media_regenerated':data['browser_or_media_regenerated']}))
