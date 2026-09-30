"""Verify frozen original fixture and pre-model CPU contract/test identities."""
import hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
for manifest in ['fixtures/source-manifest.json','evidence/cpu-contract-freeze.json']:
 for entry in json.loads((ROOT/manifest).read_text())['files']:
  assert hashlib.sha256((ROOT/entry['path']).read_bytes()).hexdigest()==entry['sha256'],entry['path']
print('Original fixtures and CPU contract/test freeze verified; no inference')
