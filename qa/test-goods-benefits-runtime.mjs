import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash,createHmac} from 'node:crypto';
import {merchPreview} from '../src/merch-preview.mjs';
import {createGoodsRuntime,goodsBenefitsReady} from '../src/goods-runtime.mjs';
import website from '../src/website.mjs';
import mappings from '../src/goods-mappings.mjs';
const origin='https://bullenciaga.com';
function database(){
 const sqlite=new DatabaseSync(':memory:');
 for(const file of readdirSync(new URL('../migrations/goods/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../migrations/goods/'+file,import.meta.url),'utf8')); 
 return {sqlite,prepare:sql=>({bind(...args){
  const stmt=sqlite.prepare(sql);
  return {first:async()=>stmt.get(...args)||null,all:async()=>({results:stmt.all(...args)}),run:async()=>({meta:{changes:Number(stmt.run(...args).changes)}})};
 }}),batch:async statements=>{
  sqlite.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec('COMMIT');return results}catch(e){sqlite.exec('ROLLBACK');throw e}
 }};
}
function env(){return {MERCH_PREVIEW_PROTECTED:'0',MERCH_PREVIEW_PREFIX:'fixture',MERCH_PREVIEW_ASSETS:{get:async()=>({body:'<html>Goods</html>'}),head:async()=>({})},MERCH_PREVIEW_LIMIT:{limit:async()=>({success:true})},GOODS_BENEFITS_ENABLED:'1',GOODS_CHECKOUT_ENABLED:'1',GOODS_DB:database(),GOODS_CUSTOM_QUEUE:{send:async()=>{}},CONTROL_AUTH:{fetch:async()=>{throw Error('Unmocked RPC')}},GOODS_PLATFORM_USERNAME:'fixture-user',GOODS_PLATFORM_PASSWORD:'fixture-password',GOODS_STOREFRONT_TOKEN:'fixture-token',GOODS_SHOP_ID:'fixture-shop',GOODS_WEBHOOK_SECRET:'fixture-webhook-secret-at-least-24',GOODS_BENEFIT_METADATA_SECRET:'fixture-metadata-secret-at-least-24'}}
function eventRequest(e,event){const raw=JSON.stringify(event),signature=createHmac('sha256',e.GOODS_WEBHOOK_SECRET).update(raw).digest('base64');return new Request(origin+'/goods/api/webhook',{method:'POST',headers:{'X-Fourthwall-Hmac-SHA256':signature},body:raw})}

test('runtime requires complete explicit config and does not activate from credentials alone',()=>{
 const e=env();assert.ok(goodsBenefitsReady(e));assert.ok(createGoodsRuntime(e));for(const patch of [{GOODS_BENEFITS_ENABLED:'0'},{GOODS_CHECKOUT_ENABLED:'0'},{GOODS_DB:null},{GOODS_CUSTOM_QUEUE:null},{GOODS_WEBHOOK_SECRET:''},{GOODS_BENEFIT_METADATA_SECRET:''},{CONTROL_AUTH:null},{GOODS_PLATFORM_PASSWORD:''}])assert.equal(createGoodsRuntime({...e,...patch}),null);
});
test('HMAC webhook exact route is independent of storefront configuration; legacy route stays denied',async()=>{
 const e=env();delete e.MERCH_PREVIEW_ASSETS;
 const r=await merchPreview(eventRequest(e,{id:'webhook-event',shopId:e.GOODS_SHOP_ID,testMode:false,type:'ORDER_PLACED',data:{id:'order-1'}}),e);assert.equal(r.status,200);assert.equal(e.GOODS_DB.sqlite.prepare('SELECT count(*) AS n FROM goods_webhook_inbox').get().n,1);
 const bad=await merchPreview(new Request(origin+'/goods/api/webhook',{method:'POST',body:'{}'}),e);assert.equal(bad.status,401);
 const old=await merchPreview(new Request(origin+'/merch/api/webhook',{method:'POST',body:'{}'}),e);assert.notEqual(old.status,200);
});
test('disabled benefits fail closed while anonymous catalog stays usable and CSP is narrow',async()=>{
 const e=env();e.GOODS_BENEFITS_ENABLED='0';e.GOODS_CHECKOUT_ENABLED='0';let response=await merchPreview(new Request(origin+'/goods/api/benefits/status'),e);assert.equal(response.status,503);assert.equal((await response.json()).error.code,'BENEFITS_UNAVAILABLE');
 response=await merchPreview(new Request(origin+'/goods/api/catalog'),e);assert.equal(response.status,200);assert.deepEqual((await response.json()).variants,[]);
 const csp=response.headers.get('Content-Security-Policy');assert.match(csp,/img-src [^;]+https:\/\/gateway.irys.xyz/);assert.match(csp,/img-src [^;]+https:\/\/cdn\.fourthwall\.com/);assert.match(csp,/connect-src 'self'/);assert.match(csp,/script-src 'self';/);assert.ok(!csp.includes('https:;'));
});
test('native cart applies server-attributed code and opaque metadata only after normal product verification',async()=>{
 const e=env(),m=mappings.variants.find(v=>v.enabled),now=Date.now();
 const token='a'.repeat(64),wallet='11111111111111111111111111111111',hash=createHash('sha256').update(token).digest('hex');
 e.GOODS_DB.sqlite.prepare('INSERT INTO goods_wallet_sessions VALUES(?,?,?)').run(hash,wallet,now+600000);
 e.GOODS_DB.sqlite.prepare('INSERT INTO goods_benefit_requests(id,wallet,kind,idempotency_key,state,created_at,updated_at,expires_at,percent,code,promotion_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('benefit-id',wallet,'discount','benefit-id','ready',now,now,now+600000,4,'BULLEN-FIXTURE','promotion-id');
 const variant={id:m.variantId,unitPrice:{value:89.99,currency:'USD'},attributes:{color:{name:m.expectedColor},size:{name:m.expectedSize}},stock:{type:'UNLIMITED'}};
 let cartBody;const original=globalThis.fetch;
 globalThis.fetch=async(u,o)=>{const url=new URL(u);assert.equal(o.redirect,'manual');if(url.hostname==='api.fourthwall.com'){
  if(url.pathname.includes('/promotions/'))return Response.json({id:'promotion-id',code:'BULLEN-FIXTURE',status:'Live',usageCount:0,discount:{type:'PERCENTAGE',percentage:4,shippingOption:'Excluded'},limits:{maximumUsesNumber:1},appliesTo:{type:'ENTIRE_ORDER'}});
  return Response.json({id:m.productId,type:'STANDARD',access:{type:'PUBLIC'},state:{type:'AVAILABLE'},variants:[variant]});
 }
 assert.equal(url.hostname,'storefront-api.fourthwall.com');if(o.method==='GET')return Response.json({id:m.productId,slug:m.slug,type:'PRODUCT',access:{type:'PUBLIC'},state:{type:'AVAILABLE'},variants:[variant]});cartBody=JSON.parse(o.body);return Response.json({id:'cart-fixture',items:[{quantity:1,variant}]})};
 try{const request=new Request(origin+'/goods/api/checkout',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:'__Secure-goods_wallet='+token},body:JSON.stringify({currency:'USD',holderDiscount:true,coupon:'ATTACKER',metadata:{wallet:'forged'},items:[{product:m.product,colour:m.colour,size:m.size,variantId:m.variantId,quantity:1,expectedUnitPrice:89.99}]})});const result=await merchPreview(request,e);assert.equal(result.status,200);const checkout=await result.json();assert.equal(new URL(checkout.checkoutUrl).searchParams.get('coupon'),'BULLEN-FIXTURE');assert.equal(cartBody.metadata.benefit_request,'benefit-id');assert.ok(cartBody.metadata.benefit_mac);assert.ok(!JSON.stringify(cartBody).includes(wallet));assert.ok(!JSON.stringify(cartBody).includes('ATTACKER'))}finally{globalThis.fetch=original}
});
test('requested holder discount cannot silently disappear when benefits are disabled',async()=>{
 const e=env();e.GOODS_BENEFITS_ENABLED='0';const m=mappings.variants.find(v=>v.enabled),original=globalThis.fetch;let writes=0;
 globalThis.fetch=async(u,o)=>{if(o.method==='POST')writes++;return Response.json({id:m.productId,slug:m.slug,type:'PRODUCT',state:{type:'AVAILABLE'},access:{type:'PUBLIC'},variants:[{id:m.variantId,unitPrice:{value:89.99,currency:'USD'},attributes:{color:{name:m.expectedColor},size:{name:m.expectedSize}},stock:{type:'UNLIMITED'}}]})};
 try{const r=await merchPreview(new Request(origin+'/goods/api/checkout',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({currency:'USD',holderDiscount:true,items:[{product:m.product,colour:m.colour,size:m.size,variantId:m.variantId,quantity:1,expectedUnitPrice:89.99}]})}),e);assert.equal(r.status,409);assert.equal((await r.json()).code,'BENEFITS_UNAVAILABLE');assert.equal(writes,0)}finally{globalThis.fetch=original}
});
test('private NFT image reads have per-mint rate buckets separate from status polling',async()=>{
 const e=env(),keys=[];e.MERCH_PREVIEW_LIMIT.limit=async({key})=>{keys.push(key);return{success:true}};
 for(const path of['nft-image/'+'1'.repeat(32),'nft-image/'+'2'.repeat(32),'nft-image/'+'1'.repeat(32),'custom/unknown']){const r=await merchPreview(new Request(origin+'/goods/api/benefits/'+path,{headers:{'CF-Connecting-IP':'192.0.2.1'}}),e);assert.equal(r.status,401)}
 assert.notEqual(keys[0],keys[1]);assert.equal(keys[0],keys[2]);assert.notEqual(keys[0],keys[3]);
});
test('website forwards webhook context and handles queue/config failures without touching unrelated assets',async()=>{
 const e=env();let ack=0,retry=0;await website.queue({messages:[{body:{id:'bad'},ack(){ack++},retry(){retry++}}]},e);assert.equal(ack,1);assert.equal(retry,0);await website.queue({messages:[{body:{id:'x'},ack(){ack++},retry(){retry++}}]},{...e,GOODS_BENEFITS_ENABLED:'0'});assert.equal(retry,1);
 const promises=[],r=await website.fetch(eventRequest(e,{id:'event-test',shopId:e.GOODS_SHOP_ID,testMode:true,type:'ORDER_PLACED',data:{id:'order'}}),e,{waitUntil:p=>promises.push(p)});assert.equal(r.status,200);assert.equal(r.headers.get('Strict-Transport-Security'),'max-age=31536000');await website.scheduled({}, {GOODS_BENEFITS_ENABLED:'0'});assert.equal(promises.length,0);
});

test('public connection routes never replace wallet proof on private benefit operations',async()=>{
 const e=env(),original=globalThis.fetch;let writes=0;
 globalThis.fetch=async(url,options)=>{if(options.method!=='GET')writes++;return Response.json({productId:'pro_05kHMsNpQZubKsMrnysvyQ',colorVariants:[]})};
 const api=(path,body,headers={})=>merchPreview(new Request(origin+'/goods/api/benefits'+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})}),e);
 try{
  let r=await api('/status');assert.equal(r.status,200);let data=await r.json();assert.equal(data.authenticated,false);assert.equal(data.custom.maxSaved,5);assert.deepEqual(data.custom.savedRequests,[]);
  assert.match(r.headers.get('Cache-Control'),/private, no-store/);assert.equal(r.headers.get('Vary'),'Cookie');assert.match(r.headers.get('X-Robots-Tag'),/noindex/);
  r=await api('/challenge',{wallet:'11111111111111111111111111111111'});assert.equal(r.status,200);data=await r.json();assert.match(data.message,/Domain: bullenciaga.com/);assert.equal(r.headers.get('Set-Cookie'),null);
  r=await api('/verify',{challengeId:data.challengeId,proof:'forged'});assert.equal(r.status,401);assert.equal((await r.json()).error.code,'BAD_PROOF');
  for(const [path,body] of [['/nfts'],['/nft-image/'+'1'.repeat(32)],['/custom/test'],['/discount',{}],['/custom',{}],['/custom/test/discard',{}],['/custom/test/checkout',{}]]){
   r=await api(path,body,{Cookie:'__Secure-bullen_merch=old-preview; __Secure-goods_wallet=forged'});
   assert.equal(r.status,401,path);assert.equal((await r.json()).error.code,'WALLET_REQUIRED');
  }
  assert.equal((await api('/challenge',{wallet:'11111111111111111111111111111111'},{Origin:'https://evil.example'})).status,403);
  assert.equal(writes,0);assert.equal(e.GOODS_DB.sqlite.prepare('SELECT count(*) AS n FROM goods_wallet_sessions').get().n,0);
  e.MERCH_PREVIEW_LIMIT.limit=async()=>({success:false});assert.equal((await api('/status')).status,429);
 }finally{globalThis.fetch=original}
});

test('anonymous native checkout retains origin, rate, price and holder-proof checks',async()=>{
 const e=env(),m=mappings.variants.find(v=>v.enabled),original=globalThis.fetch;
 const variant={id:m.variantId,unitPrice:{value:89.99,currency:'USD'},attributes:{color:{name:m.expectedColor},size:{name:m.expectedSize}},stock:{type:'UNLIMITED'}};
 let writes=0,cartBody;
 globalThis.fetch=async(url,options)=>{assert.equal(new URL(url).hostname,'storefront-api.fourthwall.com');if(options.method==='GET')return Response.json({id:m.productId,slug:m.slug,type:'PRODUCT',state:{type:'AVAILABLE'},access:{type:'PUBLIC'},variants:[variant]});writes++;cartBody=JSON.parse(options.body);return Response.json({id:'public-cart-fixture',items:[{quantity:1,variant}]})};
 const body={currency:'USD',items:[{product:m.product,colour:m.colour,size:m.size,variantId:m.variantId,quantity:1,expectedUnitPrice:89.99}]};
 const checkout=(value=body,headers={})=>merchPreview(new Request(origin+'/goods/api/checkout',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:JSON.stringify(value)}),e);
 try{
  assert.equal((await checkout(body,{Origin:'https://evil.example'})).status,403);
  assert.equal((await checkout(body,{'Sec-Fetch-Site':'none'})).status,403);
  assert.equal((await checkout({...body,items:[{...body.items[0],expectedUnitPrice:1}]})).status,409);
  const discount=await checkout({...body,holderDiscount:true});assert.equal(discount.status,401);assert.equal((await discount.json()).code,'WALLET_REQUIRED');assert.equal(writes,0);
  const result=await checkout({...body,coupon:'FORGED',metadata:{wallet:'forged'}});assert.equal(result.status,200);const link=new URL((await result.json()).checkoutUrl);assert.equal(link.hostname,'store.bullenciaga.com');assert.equal(link.searchParams.has('coupon'),false);
  assert.deepEqual(cartBody.metadata,{source:'bullenciaga_goods'});assert.equal(writes,1);
  e.MERCH_PREVIEW_LIMIT.limit=async()=>({success:false});assert.equal((await checkout()).status,429);assert.equal(writes,1);
 }finally{globalThis.fetch=original}
});
