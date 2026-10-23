// Local-only visual/integration fixture. Never included in the Worker bundle.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {harness,campaign,publish} from './fixture.mjs';
const port=Number(process.env.CAMPAIGN_TEST_PORT||8839),base=`http://127.0.0.1:${port}`,h=harness();
await publish(h,campaign({slug:'a-little-house-favour',title:'A little House favour.',description:'A piece from the House. A few ways to make it yours.\n\nChoose your actions, collect your entries, and leave the rest to the draw.',prizes:[{name:'A piece of House Goods',description:'Choose a piece from the first collection. Local test campaign only.',quantity:1}]}));
h.env.CAMPAIGNS_ORIGIN=base;
if(process.env.CAMPAIGN_TEST_EMAIL==='1'){
  // Opt-in local fixture only: no requests or messages reach a real provider.
  const auth='https://abcdefghijklmnopqrst.supabase.co';
  Object.assign(h.env,{CAMPAIGNS_AUTH_URL:auth,CAMPAIGNS_AUTH_PUBLISHABLE_KEY:'sb_publishable_fixture_only'});
  globalThis.fetch=async(url,options)=>{
    if(!String(url).startsWith(auth+'/auth/v1/'))throw new Error('Network is disabled in the email fixture.');
    if(String(url).endsWith('/otp'))return Response.json({});
    if(String(url).endsWith('/verify')){const input=JSON.parse(options.body);return input.token==='11112222'?Response.json({access_token:'fixture-only',user:{id:'12345678-1234-4234-8234-123456789012',email:input.email,email_confirmed_at:'2026-01-01T00:00:00Z'}}):Response.json({error:'invalid code'},{status:401});}
    if(String(url).endsWith('/logout?scope=local'))return new Response(null,{status:204});
    throw new Error('Unexpected email fixture request.');
  };
}
const root=path.resolve(import.meta.dirname,'../../site');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.mjs':'text/javascript','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,base);
    if(url.pathname.startsWith('/campaigns/api/')){
      const chunks=[];for await(const chunk of req)chunks.push(chunk);const bytes=Buffer.concat(chunks);
      const response=await h.ledger.fetch(new Request(url,{method:req.method,headers:req.headers,body:bytes.length?bytes:undefined}));
      res.statusCode=response.status;for(const [k,v] of response.headers)if(k!=='set-cookie')res.setHeader(k,v);const cookies=response.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies);res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    const filePath=/^\/campaigns(?:\/[a-z0-9-]+)?\/?$/.test(url.pathname)?'/campaigns/index.html':decodeURIComponent(url.pathname);
    const file=path.resolve(root,'.'+filePath);if(!file.startsWith(root+'/')){res.writeHead(403);res.end();return;}
    const data=await fs.readFile(file);res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(data);
  }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Local campaign fixture: ${base}/campaigns`));
