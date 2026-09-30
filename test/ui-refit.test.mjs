import test from 'node:test';import assert from 'node:assert/strict';import {createRefit} from '../ui-server-v2.mjs';
async function withDesk(run){const server=await createRefit();await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;try{await run(url);}finally{await new Promise(r=>server.close(r));}}
test('Versioned static UI serves equal evidence panels while preserving original API admission',()=>withDesk(async url=>{
 const html=await (await fetch(url)).text();assert.match(html,/주문 예외 인계 검토/);assert.match(html,/class="comparison"/);assert.match(html,/id="source-panel"/);assert.match(html,/id="result-panel"/);
 const response=await fetch(url+'/api/session'),session=await response.json();assert.equal(session.current_source_revision,4);assert.equal(session.inference_calls_from_server,0);
 const cookie=response.headers.get('set-cookie').split(';')[0],projection=await(await fetch(url+'/api/order?order=SO-B&revision=3',{headers:{cookie}})).json();assert.deepEqual(projection,{status:'CREDIT_REVIEW_BLOCK',owner_role:'Authorized Commercial Review'});
}));
test('Overlay delegates exact inspected acknowledgment and retains unknown seeded reviewer role',()=>withDesk(async url=>{
 const response=await fetch(url+'/api/session'),cookie=response.headers.get('set-cookie').split(';')[0],headers={cookie,'Content-Type':'application/json'};
 const inspected=await(await fetch(url+'/api/order?order=SO-C&revision=4',{headers})).json();assert.equal(inspected.history[0].role,undefined);assert.equal(inspected.history[0].reviewed_at,'2026-10-03T09:05:00+09:00');
 const body=JSON.stringify({...inspected.binding,acknowledgment:true});const first=await(await fetch(url+'/api/review',{method:'POST',headers,body})).json(),repeated=await(await fetch(url+'/api/review',{method:'POST',headers,body})).json();assert.equal(first.receipt.role,'Service');assert.ok(first.receipt.reviewed_at);assert.equal(repeated.idempotent,true);assert.equal(first.receipt.review_id,repeated.receipt.review_id);assert.equal(first.receipt.source_blocks_changed,false);
}));
