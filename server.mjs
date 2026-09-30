import {createServer} from 'node:http';import {readFileSync} from 'node:fs';import {createHash,randomUUID} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {createReviewStore,sourceRecords,canonical} from './core.mjs';
const root=new URL('.',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
export async function createDesk({sourcePath=new URL('fixtures/source-v1.json',root),policyPath=new URL('fixtures/review-policy-v1.json',root)}={}){
 const manifest=JSON.parse(readFileSync(new URL('fixtures/source-manifest.json',root))),sourceBytes=readFileSync(sourcePath),policyBytes=readFileSync(policyPath),sourceSha=hash(sourceBytes),policySha=hash(policyBytes);
 if(sourceSha!==manifest.files.find(x=>x.path==='fixtures/source-v1.json').sha256||policySha!==manifest.files.find(x=>x.path==='fixtures/review-policy-v1.json').sha256)throw Error('Original fictional fixture/policy admission mismatch');
 const source=JSON.parse(sourceBytes),policy=JSON.parse(policyBytes),sessions=new Map(),reviews=createReviewStore({source,policy,source_sha256:sourceSha,policy_sha256:policySha});
 const stable=()=>{try{if(hash(readFileSync(sourcePath))!==sourceSha||hash(readFileSync(policyPath))!==policySha)throw Error('changed');}catch{for(const s of sessions.values())s.inspected.clear();throw Object.assign(Error('Current fictional source/policy authority is unavailable. Re-admission and fresh inspection are required.'),{code:'SOURCE_UNAVAILABLE'});}};
 const session=(req,res)=>{let id=req.headers.cookie?.match(/(?:^|;\s*)p14=([a-f0-9-]{36})(?:;|$)/)?.[1],s=id&&sessions.get(id);if(!s){id=randomUUID();s={id,role:policy.default_role,role_revision:1,inspected:new Set()};sessions.set(id,s);res.setHeader('Set-Cookie',`p14=${id}; HttpOnly; SameSite=Strict; Path=/`);}return s;};
 const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 const minimal=(order,s)=>order==='SO-B'&&policy.so_b_minimal_projection.roles.includes(s.role);
 return createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/api/')){
   stable();const s=session(req,res),order=url.searchParams.get('order')??'SO-A',revisionText=url.searchParams.get('revision')??String(source.source_revision);
   if(!policy.known_orders.includes(order))return send(res,404,{error:'UNAVAILABLE',message:'Requested view is unavailable.'});
   if(req.method==='GET'&&url.pathname==='/api/session')return send(res,200,{role:s.role,role_revision:s.role_revision,known_orders:policy.known_orders,current_source_revision:source.source_revision,source_cutoff:source.source_cutoff,source_timezone:source.source_timezone,fictional:true,inference_calls_from_server:0});
   if(req.method==='GET'&&['/api/order','/api/source'].includes(url.pathname)){
    if(!/^[1-4]$/.test(revisionText))return send(res,400,{error:'INVALID_REVISION',message:'Choose a declared revision from 1 to 4.'});
    const inspection=reviews.inspect(order,s.role,s.role_revision,{revision:Number(revisionText)});
    if(url.pathname==='/api/order'){if(inspection.review_enabled)s.inspected.add(hash(canonical(inspection.binding)));const history=reviews.history(order,s.role).map(receipt=>({...receipt,current:inspection.review_enabled&&receipt.view_fingerprint===inspection.binding?.view_fingerprint&&receipt.role_revision===s.role_revision}));return send(res,200,minimal(order,s)?inspection.view:{...inspection,history,current_source_revision:source.source_revision});}
    const allowed=minimal(order,s)?[]:sourceRecords(source,order,s.role,{revision:Number(revisionText)}),record=allowed.find(x=>x.record_id===url.searchParams.get('id'));
    if(!record)return send(res,404,{error:'UNAVAILABLE',message:'Source record unavailable in this view.'});
    return send(res,200,record);
   }
   if(req.method==='POST'&&['/api/role','/api/review','/api/receipt'].includes(url.pathname)){
    if(!(req.headers['content-type']??'').startsWith('application/json'))return send(res,400,{error:'INVALID_REQUEST',message:'JSON request required.'});
    const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>8192)throw Error('Request exceeds bounded input');chunks.push(chunk);}const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));stable();
    if(url.pathname==='/api/role'){
     if(!body||Object.keys(body).length!==1||!policy.roles.includes(body.role))return send(res,400,{error:'INVALID_ROLE',message:'Choose a declared fictional role.'});
     s.role=body.role;++s.role_revision;s.inspected.clear();return send(res,200,{role:s.role,role_revision:s.role_revision});
    }
    if(!body||typeof body!=='object'||Array.isArray(body))return send(res,400,{error:'INVALID_REQUEST',message:'Exact inspected review binding required.'});
    const {acknowledgment,...binding}=body;const result=s.inspected.has(hash(canonical(binding)))?reviews.review(body,s):{ok:false,error:'STALE_REVIEW'};if(!result.ok)return send(res,409,{error:result.error??'STALE_REVIEW',message:'Inspection is stale or unavailable. Inspect the current role, source revision and block instance again; no case or receipt was added.'});
    return send(res,200,url.pathname==='/api/receipt'?{receipt:result.receipt,acknowledgment:{state:'prepared_and_acknowledged',download_completion:'not_established',erp_write:false,customer_message:false,block_release:false}}:result);
   }
   return send(res,404,{error:'UNAVAILABLE',message:'Requested view is unavailable.'});
  }
  const files={'/':['index.html','text/html'],'/app.mjs':['app.mjs','text/javascript'],'/style.css':['style.css','text/css']};if(req.method!=='GET'||!files[url.pathname])return send(res,404,{error:'UNAVAILABLE'});
  const[file,type]=files[url.pathname];res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self'; connect-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'"});res.end(readFileSync(new URL(file,root)));
 }catch(e){send(res,e.code==='SOURCE_UNAVAILABLE'?409:400,{error:e.code??'INVALID_REQUEST',message:e.code==='SOURCE_UNAVAILABLE'?e.message:'Request could not establish a current inspected binding.'});}});
}
if(process.argv[1]===fileURLToPath(import.meta.url))(await createDesk()).listen(Number(process.env.P14_PORT??5140),'127.0.0.1',()=>console.log('Fictional order handoff desk ready; CPU only'));
