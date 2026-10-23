// Runs the actual isolated Worker and SQLite Durable Object on workerd.
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {campaign,ownerKey,testWallet} from './fixture.mjs';
const require=createRequire(import.meta.url),root=process.env.CAMPAIGN_WRANGLER_MODULES;
const {Miniflare,convertV4MiniflareOptions}=require(root?root+'/miniflare':'miniflare'),{build}=require(root?root+'/esbuild':'esbuild');
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'campaign-workerd-'));
const file=path.join(dir,'worker.mjs');await build({entryPoints:[new URL('../../src/campaigns/worker.mjs',import.meta.url).pathname],outfile:file,bundle:true,format:'esm',platform:'browser',target:'es2022'});
const mf=new Miniflare(convertV4MiniflareOptions({workers:[
  {name:'campaigns-test',script:await fs.readFile(file,'utf8'),modules:true,compatibilityDate:'2026-08-23',bindings:{CAMPAIGNS_ORIGIN:'https://campaigns.test'},durableObjects:{CAMPAIGN_STORE:{className:'CampaignLedger',useSQLite:true}},serviceBindings:{CONTROL_AUTH:'test-control'}},
  {name:'test-control',modules:true,script:`export default {fetch(r){return new Response(null,{status:r.headers.get('Authorization')===${JSON.stringify('Bearer '+ownerKey)}?204:403});}}`},
],durableObjectsPersist:path.join(dir,'state')}));
try{
  let r=await mf.dispatchFetch('https://campaigns.test/campaigns/api/health');assert.equal(r.status,200);assert.equal((await r.json()).storage,'durable');
  r=await mf.dispatchFetch('https://campaigns.test/campaigns/api/admin/campaigns',{method:'POST',headers:{Origin:'https://campaigns.test',Authorization:'Bearer '+ownerKey,'Content-Type':'application/json'},body:JSON.stringify(campaign())});assert.equal(r.status,201,await r.clone().text());const c=await r.json();
  r=await mf.dispatchFetch('https://campaigns.test/campaigns/api/admin/campaigns/'+c.id+'/status',{method:'POST',headers:{Origin:'https://campaigns.test',Authorization:'Bearer '+ownerKey,'Content-Type':'application/json'},body:JSON.stringify({status:'live',revision:1})});assert.equal(r.status,200,await r.clone().text());
  r=await mf.dispatchFetch('https://campaigns.test/campaigns/api/campaigns');assert.equal((await r.json()).campaigns.length,1);
  const wallet=testWallet(),post=async(path,data,cookie='')=>mf.dispatchFetch('https://campaigns.test/campaigns/api'+path,{method:'POST',headers:{Origin:'https://campaigns.test','Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(data)});
  r=await post('/wallet/challenge',{wallet:wallet.address});assert.equal(r.status,200,await r.clone().text());const challenge=await r.json();
  r=await post('/wallet/verify',{id:challenge.id,signature:wallet.sign(challenge.message)});assert.equal(r.status,200,await r.clone().text());const session=r.headers.get('Set-Cookie').split(';')[0];
  r=await post('/campaigns/'+c.slug+'/join',{accepted:true,revision:2,contact:'local fixture only'},session);assert.equal(r.status,200,await r.clone().text());
  r=await post('/campaigns/'+c.slug+'/actions/free/claim',{},session);assert.equal(r.status,200,await r.clone().text());assert.equal((await r.json()).points,1);
  r=await post('/campaigns/'+c.slug+'/actions/free/claim',{},session);assert.equal((await r.json()).duplicate,true);
  console.log('workerd: durable SQLite schema, service authentication, creation, publication, wallet sign-in, consent, claims and duplicate prevention passed');
}finally{await mf.dispose();await fs.rm(dir,{recursive:true,force:true});}
