"""Pin original local fictional source/policy/gold before model work. Exclusive creation."""
import hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];names=['source-v1.json','review-policy-v1.json','gold-v1.json']
out={'schema_version':'P14-SYNTHETIC-MANIFEST-1','fixture_origin':'Original locally authored fictional specification; no vendor/private/customer data','model_calls_at_pin':0,'files':[{ 'path':'fixtures/'+name,'bytes':(ROOT/'fixtures'/name).stat().st_size,'sha256':hashlib.sha256((ROOT/'fixtures'/name).read_bytes()).hexdigest()}for name in names]}
with(ROOT/'fixtures/source-manifest.json').open('x')as file:json.dump(out,file,indent=2);file.write('\n')
print(json.dumps(out))
