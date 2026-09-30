"""Exclusive pre-model freeze of original contract and actually executed test definitions."""
import hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
names=['AGENTS.md','CONTRACT.md','fixtures/source-manifest.json','fixtures/source-v1.json','fixtures/review-policy-v1.json','fixtures/gold-v1.json','core.mjs','server.mjs','app.mjs','index.html','style.css','package.json','test/core.test.mjs','test/server.test.mjs','scripts/browser-check.py']
out={'schema_version':'P14-CPU-CONTRACT-FREEZE-1','phase':'original fictional CPU first slice; before optional model protocol','model_calls':0,'tests_are_executed_checks_not_fixture_runs':True,'files':[{'path':name,'bytes':(ROOT/name).stat().st_size,'sha256':hashlib.sha256((ROOT/name).read_bytes()).hexdigest()}for name in names]}
with(ROOT/'evidence/cpu-contract-freeze.json').open('x')as file:json.dump(out,file,indent=2);file.write('\n')
print(json.dumps({'frozen_files':len(names),'model_calls':0}))
