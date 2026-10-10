import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {hwBase58Encode} from '../site/wallet-proof-format.mjs';
import {GoodsBenefitsStore,createGoodsBenefitsHandler,createGoodsChainClient} from '../src/goods-benefits.mjs';

// Public collection identities, independently pinned by the released Founding
// Records collection specification and audit-house-pairs.ts. No live wallet,
// signatures, RPC, provider requests, or persistent databases are used here.
const COLLECTIONS={
 '5GXF7Uug7mZy2pj5XDk4LP9yH7oA5oMQEbCT49ggQnVC':'The Herd',
 '9ucdkSaiTLUDXmVCjWonxAJqrTH9uyB675BzzRi5vqgM':'House Objects',
 'FnbDXuPxcy87y451eYimMTDrrPqoFRMVi4ctAu73XVkD':'Founding Records',
};
const FOUNDING='FnbDXuPxcy87y451eYimMTDrrPqoFRMVi4ctAu73XVkD';
const address=n=>hwBase58Encode(new Uint8Array(32).fill(n));
const WALLET=address(1);
const asset=(n=2,collection=FOUNDING,name='The Promise')=>({
 id:address(n),interface:'MplCoreAsset',burnt:false,ownership:{owner:WALLET},
 grouping:[{group_key:'collection',group_value:collection}],
 content:{metadata:{name},links:{image:'https://example.invalid/fixture-art.png'}},
});
const template={productId:'pro_05kHMsNpQZubKsMrnysvyQ',colorVariants:[{available:true,color:{name:'Butter',hex:'#ddd'},sizeVariants:[{size:'M',available:true,price:{amount:24.84,currency:'USD'}}]}]};

async function harness(t,items,{queued=false}={}){
 const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());
 for(const name of readdirSync(new URL('../migrations/goods/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../migrations/goods/'+name,import.meta.url),'utf8'));
 const db={
  prepare(sql){
   return {bind(...args){
    const stmt=sqlite.prepare(sql);
    return {first:async()=>stmt.get(...args)||null,all:async()=>({results:stmt.all(...args)}),run:async()=>({meta:{changes:Number(stmt.run(...args).changes)}})};
   }};
  },
  async batch(statements){
   sqlite.exec('BEGIN');
   try{const out=[];for(const stmt of statements)out.push(await stmt.run());sqlite.exec('COMMIT');return out}
   catch(error){sqlite.exec('ROLLBACK');throw error}
  },
 };
 const store=new GoodsBenefitsStore(db),rpcCalls=[],providerWrites=[],jobs=[],products=new Map();
 let current=structuredClone(items),gate=true;
 const chain=createGoodsChainClient({rpcBinding:{async fetch(request){
  const {method,params}=await request.json();rpcCalls.push({method,params});
  assert.equal(request.method,'POST');assert.equal(request.headers.get('Cache-Control'),'no-store');
  let result;
  if(method==='getAssetsByOwner'){assert.equal(params.ownerAddress,WALLET);result={items:current};}
  else if(method==='getAsset')result=current.find(x=>x.id===params.id)||{id:params.id,burnt:true};
  else throw new Error('Unexpected RPC in eligibility fixture: '+method);
  return Response.json({jsonrpc:'2.0',id:1,result});
 }}});
 const provider={
  template:async()=>structuredClone(template),
  createCustomization:async body=>{providerWrites.push(['customization',body]);return {customizationId:'fixture-customization',images:[{url:'https://example.invalid/preview.jpg'}]};},
  createProduct:async body=>{providerWrites.push(['product',body]);const id='fixture-product-'+products.size;products.set(id,{id,type:'STANDARD',access:{type:'HIDDEN'},state:{type:'AVAILABLE'},variants:[{id:'variant-'+id,unitPrice:{value:49.99,currency:'USD'},attributes:{color:{name:'Butter'},size:{name:'M'}},stock:{type:'UNLIMITED'}}]});return {productId:id,images:[{url:'https://example.invalid/final.jpg'}]};},
  getProduct:async id=>structuredClone(products.get(id)),
 };
 const now=Date.parse('2026-10-10T12:00:00Z');
 const handler=createGoodsBenefitsHandler({db,store,chain,provider,authorize:async()=>gate,rateLimit:async()=>true,metadataSecret:'fixture-only-metadata-secret',webhookSecret:'fixture-only-webhook-secret',shopId:'fixture-shop',resolvePrintAsset:async()=>({imageId:'fixture-approved-art'}),now:()=>now,...(queued?{enqueueCustom:async id=>jobs.push(id)}:{})});
 // Seed only this in-memory fixture's verified session, without signing.
 const token='d'.repeat(64);await store.createSession(createHash('sha256').update(token).digest('hex'),WALLET,now+60000);
 async function api(path,body,{authenticated=true}={}){
  const response=await handler(new Request('https://bullenciaga.com/goods/api/benefits'+path,{method:body===undefined?'GET':'POST',headers:{Origin:'https://bullenciaga.com','Content-Type':'application/json',...(authenticated?{Cookie:'__Secure-goods_wallet='+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})}));
  return {status:response.status,body:await response.json(),response};
 }
 return {api,store,handler,rpcCalls,providerWrites,jobs,setAssets:items=>current=structuredClone(items),setGate:value=>gate=value};
}
const prepare=(h,mint,key='fixture-prepare-0001')=>h.api('/custom',{mint,colour:'Butter',size:'M',idempotencyKey:key});

test('password-gated status exposes all exact eligible collection IDs without a wallet or chain read',async t=>{
 const h=await harness(t,[]),r=await h.api('/status',undefined,{authenticated:false});
 assert.equal(r.status,200);assert.equal(r.body.authenticated,false);assert.deepEqual(r.body.options.collections,COLLECTIONS);
 assert.equal(h.rpcCalls.length,0);assert.equal(h.providerWrites.length,0);
 assert.match(r.response.headers.get('Cache-Control'),/private, no-store/);
 assert.equal((await h.api('/nfts',undefined,{authenticated:false})).status,401);
 h.setGate(false);assert.equal((await h.api('/status',undefined,{authenticated:false})).status,401);
});

test('real chain adapter discovery and custom preparation accept Founding Records and retain both prior collections',async t=>{
 const entries=[asset(2,FOUNDING,'The Promise'),asset(3,FOUNDING,'The Triad'),asset(4,Object.keys(COLLECTIONS)[0],'HERD #42'),asset(5,Object.keys(COLLECTIONS)[1],'The Signet')];
 const h=await harness(t,entries),listed=await h.api('/nfts');
 assert.equal(listed.status,200);assert.deepEqual(listed.body.items.map(x=>[x.mint,x.name,x.collection]),entries.map(x=>[x.id,x.content.metadata.name,COLLECTIONS[x.grouping[0].group_value]]));
 assert.ok(listed.body.items.every(x=>x.image==='/goods/api/benefits/nft-image/'+x.mint));
 for(const [i,item] of entries.entries()){
  const r=await prepare(h,item.id,'fixture-prepare-'+String(i).padStart(4,'0'));
  assert.equal(r.status,202);assert.equal(r.body.state,'ready');assert.equal(r.body.name,item.content.metadata.name);assert.equal(r.body.mint,item.id);
  assert.equal((await h.store.request(r.body.id)).stage,'ready');
 }
 assert.equal(h.providerWrites.filter(x=>x[0]==='product').length,4);
 assert.equal(h.rpcCalls.filter(x=>x.method==='getAsset').length,8,'Ownership is checked for admission and again before provider writes');
});

test('copied metadata, wrong ownership, burnt assets and unverified collection claims fail discovery and direct preparation',async t=>{
 const cases=[
  ['copied name and collection metadata',a=>{a.grouping[0].group_value=address(90);a.grouping[0].collection_metadata={name:'BULLENSAGA — FOUNDING RECORDS'};}],
  ['wrong owner',a=>{a.ownership.owner=address(91);}],
  ['burnt',a=>{a.burnt=true;}],
  ['multiple collections',a=>{a.grouping.push({group_key:'collection',group_value:FOUNDING});}],
  ['unverified legacy collection',a=>{a.interface='V1_NFT';a.grouping[0].verified=false;}],
  ['missing collection',a=>{a.grouping=[];}],
 ];
 for(const [name,change] of cases)await t.test(name,async t=>{
  const a=asset();change(a);const h=await harness(t,[a]);
  assert.deepEqual((await h.api('/nfts')).body.items,[]);
  const r=await prepare(h,a.id);assert.equal(r.status,403);assert.equal(r.body.error.code,'NFT_NOT_OWNED');
  assert.equal((await h.store.all('SELECT id FROM goods_benefit_requests')).length,0);assert.equal(h.providerWrites.length,0);
 });
});

test('a legacy asset remains eligible only with its explicit verified official collection',async t=>{
 const a=asset();a.interface='V1_NFT';a.grouping[0].verified=true;
 const h=await harness(t,[a]);assert.equal((await h.api('/nfts')).body.items[0].collection,'Founding Records');
 const r=await prepare(h,a.id);assert.equal(r.status,202);assert.equal(r.body.state,'ready');
});

test('ownership changes after discovery are rejected before a preparation is reserved',async t=>{
 const a=asset(),h=await harness(t,[a]);assert.equal((await h.api('/nfts')).body.items.length,1);
 a.ownership.owner=address(91);h.setAssets([a]);
 const r=await prepare(h,a.id);assert.equal(r.status,403);assert.equal(r.body.error.code,'NFT_NOT_OWNED');
 assert.equal((await h.store.all('SELECT id FROM goods_benefit_requests')).length,0);assert.equal(h.providerWrites.length,0);
});

test('queued preparation rechecks ownership before any provider write',async t=>{
 const a=asset(),h=await harness(t,[a],{queued:true}),r=await prepare(h,a.id);
 assert.equal(r.status,202);assert.equal(r.body.state,'preparing');assert.deepEqual(h.jobs,[r.body.id]);
 a.ownership.owner=address(91);h.setAssets([a]);await h.handler.processCustom(r.body.id);
 const saved=await h.store.request(r.body.id);assert.equal(saved.state,'review_required');assert.equal(saved.active,0);assert.match(saved.message,/no longer held/);assert.equal(h.providerWrites.length,0);
});
