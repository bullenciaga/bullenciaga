import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const site=path.resolve(import.meta.dirname,'../site');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2'};
export function createPreviewServer({proxy=false}={}) { return createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(['/volume','/supply','/ohlcv'].includes(url.pathname)) {
  if(!proxy)return res.writeHead(503,{'content-type':'application/json'}).end('{"ok":false}');
  try{const r=await fetch('https://bullenciaga.com'+url.pathname+url.search,{signal:AbortSignal.timeout(12000)});res.writeHead(r.status,{'content-type':'application/json'});return res.end(await r.text());}catch{return res.writeHead(503).end();}
 }
 let pathname=url.pathname==='/'?'/index.html':url.pathname;
 if(!path.extname(pathname))pathname+='.html';
 const file=path.resolve(site,'.'+pathname);
 if(!file.startsWith(site+'/'))return res.writeHead(403).end();
 try{res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}
 }); }
if(process.argv.includes('--serve')) {const server=createPreviewServer({proxy:true});server.listen(0,'127.0.0.1',()=>console.log('Buy preview: http://127.0.0.1:'+server.address().port+'/buy'));}
