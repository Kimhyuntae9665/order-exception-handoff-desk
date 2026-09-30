import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createDesk} from './server.mjs';

// Versioned static UI only. All API admission, projections and review rules delegate
// to the original frozen server; no copied or amended authority implementation.
export async function createRefit(options={}) {
 const original=await createDesk(options);
 const files={'/':['index.html','text/html'],'/app.mjs':['app.mjs','text/javascript'],'/style.css':['style.css','text/css']};
 return createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/api/'))return original.emit('request',req,res);
  if(req.method!=='GET'||!files[url.pathname])return original.emit('request',req,res);
  const [file,type]=files[url.pathname];
  res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self'; connect-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'"});
  res.end(readFileSync(new URL(`ui/v2/${file}`,import.meta.url)));
 });
}
if(process.argv[1]===fileURLToPath(import.meta.url))(await createRefit()).listen(Number(process.env.P14_PORT??5164),'127.0.0.1',()=>console.log('Fictional order handoff UI v2 ready; original CPU API; zero model calls'));
