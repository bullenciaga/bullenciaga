import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {hwBase58Encode} from '../site/wallet-proof-format.mjs';
import {GoodsBenefitsStore,createGoodsBenefitsHandler,createFourthwallBenefitsClient,createGoodsChainClient,createGoodsPrintAssetResolver,holderPercentage,officialOwnedAsset,readRasterSize,verifyFourthwallWebhook,GOODS_OFFICIAL_COLLECTIONS,GOODS_BULLEN_MINT} from '../src/goods-benefits.mjs';
import {FourthwallRateLimitError} from '../src/goods-benefits.mjs';
const enc=new TextEncoder();
const template={productId:'pro_05kHMsNpQZubKsMrnysvyQ',colorVariants:[{available:true,color:{name:'Black',hex:'#000'},sizeVariants:[{size:'M',available:false,price:{amount:24.84,currency:'USD'}},{size:'3XL',available:true,price:{amount:28.84,currency:'USD'}}]},{available:true,color:{name:'Butter',hex:'#ddd'},sizeVariants:[{size:'M',available:true,price:{amount:24.84,currency:'USD'}}]}]};
const product=(id='standard')=>({id,type:'STANDARD',access:{type:'HIDDEN'},state:{type:'AVAILABLE'},variants:[{id:'variant-'+id,unitPrice:{value:54.99,currency:'USD'},attributes:{color:{name:'Butter'},size:{name:'M'}},stock:{type:'UNLIMITED'}}]});
function database(){
 const sqlite=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('../migrations/goods/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../migrations/goods/'+file,import.meta.url),'utf8'));
 const prepare=sql=>({bind(...args){
  const stmt=sqlite.prepare(sql);
  return {first:async()=>stmt.get(...args)||null,all:async()=>({results:stmt.all(...args)}),run:async()=>({meta:{changes:Number(stmt.run(...args).changes)}})};
 }});
 return {prepare,batch:async statements=>{sqlite.exec('BEGIN');try{const results=[];for(const stmt of statements)results.push(await stmt.run());sqlite.exec('COMMIT');return results}catch(e){sqlite.exec('ROLLBACK');throw e}},sqlite};
}
async function wallet(){const keys=await crypto.subtle.generateKey('Ed25519',true,['sign','verify']);return {keys,address:hwBase58Encode(new Uint8Array(await crypto.subtle.exportKey('raw',keys.publicKey)))};}
async function harness(overrides={}){
 const db=database(),store=new GoodsBenefitsStore(db),w=await wallet(),mint=(await wallet()).address;
 let time=Date.parse('2026-10-08T12:00:00Z'),owns=true,raw='5000000000000',gate=true,rate=true,productCounter=0,optionsTemplate=structuredClone(template),resolve=async()=>({imageId:'approved-art'});
 const promotions=new Map(),products=new Map([['standard',product()]]),orders=new Map(),calls=[];
 const asset={mint,name:'HERD #42',image:'https://gateway.irys.xyz/approved-art',collection:'The Herd'};
 const provider={
  template:async()=>optionsTemplate,
  getProduct:async id=>structuredClone(products.get(id)),
  getPromotion:async id=>structuredClone(promotions.get(id)),
  findPromotion:async code=>structuredClone([...promotions.values()].find(p=>p.code===code)||null),
  createPromotion:async body=>{calls.push(['promotion',body]);const p={id:'promo-'+body.code,code:body.code,type:'SHOP_SINGLE',discount:{type:'PERCENTAGE',percentage:body.percent,shippingOption:'Excluded'},status:'Live',usageCount:0,limits:{maximumUsesNumber:1},appliesTo:{type:'ENTIRE_ORDER'}};promotions.set(p.id,p);return structuredClone(p)},
  endPromotion:async id=>{calls.push(['end',id]);promotions.get(id).status='Ended';return{}},
  setPromotionProducts:async(id,ids)=>{promotions.get(id).appliesTo.products=ids;return{}},
  setProductAvailable:async(id,available)=>{calls.push(['availability',id,available]);products.get(id).state.type=available?'AVAILABLE':'SOLD_OUT';return{}},
  uploadImage:async()=>{calls.push(['upload']);return 'image'},
  createCustomization:async body=>{calls.push(['customization',body]);return {customizationId:'customization',images:[{url:'https://imgproxy.fourthwall.dev/preview.jpg'}]}},
  createProduct:async body=>{calls.push(['product',body]);const id='custom-'+(++productCounter);products.set(id,product(id));return {productId:id,images:[{url:'https://imgproxy.fourthwall.dev/final.jpg'}]}},
  createCart:async body=>{calls.push(['cart',body]);const variant=[...products.values()].flatMap(p=>p.variants).find(v=>v.id===body.variantId);return {checkoutUrl:'https://store.bullenciaga.com/cart/checkout?cartId=test',cart:{items:[{quantity:1,variant}]}}},
  getOrder:async id=>{calls.push(['order',id]);return orders.get(id)},
  listOrders:async()=>({results:[...orders.values()]}),
 };
 const chain={balance:async()=>({raw,decimals:6}),list:async()=>owns?[asset]:[],owned:async(address,id)=>owns&&address===w.address&&id===mint?asset:null};
 const handler=createGoodsBenefitsHandler({db,store,provider,chain,authorize:async()=>gate,rateLimit:async()=>rate,metadataSecret:'metadata-fixture-secret-long-enough',webhookSecret:'webhook-fixture-secret-long-enough',shopId:'shop-fixture',eligibleProductIds:['standard'],resolvePrintAsset:a=>resolve(a),now:()=>time,...overrides});
 let sessionCookie='';
 function request(path,body,extra={}){const method=body===undefined?'GET':'POST';return new Request('https://bullenciaga.com'+path,{method,headers:{Origin:'https://bullenciaga.com','Content-Type':'application/json',Cookie:sessionCookie,...extra},...(body===undefined?{}:{body:JSON.stringify(body)})})}
 async function api(action,body,extra){const r=await handler(request('/goods/api/benefits'+action,body,extra));return {status:r.status,body:await r.json(),response:r};}
 async function login(){const c=await api('/challenge',{wallet:w.address});const signature=hwBase58Encode(new Uint8Array(await crypto.subtle.sign('Ed25519',w.keys.privateKey,enc.encode(c.body.message))));const result=await api('/verify',{challengeId:c.body.challengeId,proof:signature});sessionCookie=result.response.headers.get('set-cookie').split(';')[0];return {c,signature,result}}
 return {db,store,w,mint,asset,provider,chain,handler,request,api,login,calls,promotions,products,orders,advance:n=>time+=n,time:()=>time,setOwns:v=>owns=v,setBalance:v=>raw=v,setGate:v=>gate=v,setRate:v=>rate=v,setResolve:v=>resolve=v,setTemplate:v=>optionsTemplate=v};
}
async function signature(raw){const key=await crypto.subtle.importKey('raw',enc.encode('webhook-fixture-secret-long-enough'),{name:'HMAC',hash:'SHA-256'},false,['sign']);return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(raw)))))}
async function webhook(h,event){const raw=JSON.stringify(event);return h.handler(new Request('https://bullenciaga.com/goods/api/webhook',{method:'POST',headers:{'X-Fourthwall-Hmac-SHA256':await signature(raw)},body:raw}))}
const order=(id,extras={})=>({id,status:'CONFIRMED',createdAt:'2026-10-08T12:00:00Z',updatedAt:'2026-10-08T12:00:00Z',offers:[],...extras});


test('integer token steps never round up, decimals validated and cap is 20%',()=>{
 assert.equal(holderPercentage('249999999999',6),0);assert.equal(holderPercentage('250000000000',6),1);assert.equal(holderPercentage('4999999999999',6),19);assert.equal(holderPercentage('5000000000000',6),20);assert.equal(holderPercentage('999999999999999999999999',6),20);assert.throws(()=>holderPercentage('1e20'));assert.throws(()=>holderPercentage('-1'));assert.throws(()=>holderPercentage('100',1.5));
});
test('real Ed25519 exact-domain challenge proof is single-use, short-lived and HttpOnly',async()=>{
 const h=await harness(),{c,signature:proof,result}=await h.login();assert.equal(result.status,200);assert.match(result.response.headers.get('set-cookie'),/Secure; HttpOnly; SameSite=Strict/);assert.equal((await h.api('/verify',{challengeId:c.body.challengeId,proof})).status,401);
 const challenge=await h.api('/challenge',{wallet:h.w.address});const wrong=hwBase58Encode(new Uint8Array(await crypto.subtle.sign('Ed25519',h.w.keys.privateKey,enc.encode(challenge.body.message+'!'))));assert.equal((await h.api('/verify',{challengeId:challenge.body.challengeId,proof:wrong})).status,401);
 const valid=hwBase58Encode(new Uint8Array(await crypto.subtle.sign('Ed25519',h.w.keys.privateKey,enc.encode(challenge.body.message))));h.advance(300001);assert.equal((await h.api('/verify',{challengeId:challenge.body.challengeId,proof:valid})).status,401);
 assert.equal((await h.api('/logout',{})).status,200);assert.equal((await h.api('/nfts')).status,401);
});
test('gate, cross-site, malformed wallet/body and rate limit fail before provider writes',async()=>{
 const h=await harness();h.setGate(false);assert.equal((await h.api('/challenge',{wallet:h.w.address})).status,401);h.setGate(true);assert.equal((await h.api('/challenge',{wallet:h.w.address},{Origin:'https://evil.invalid'})).status,403);assert.equal((await h.api('/challenge',{wallet:'a'})).status,400);h.setRate(false);assert.equal((await h.api('/status')).status,429);assert.equal(h.calls.length,0);
});
test('discount is one active code, requires fresh balance and has exact merchandise-only scope',async()=>{
 const h=await harness();await h.login();h.setBalance('249999999999');assert.equal((await h.api('/discount',{})).status,409);h.setBalance('750000000000');const a=await h.api('/discount',{}),b=await h.api('/discount',{});assert.equal(a.status,200);assert.equal(a.body.percent,3);assert.equal(a.body.code,b.body.code);assert.equal(h.calls.filter(c=>c[0]==='promotion').length,1);assert.equal(Object.hasOwn(h.calls.find(c=>c[0]==='promotion')[1],'productIds'),false);
 const benefit=await h.handler.checkoutBenefit(h.request('/goods/api/checkout',{}),{holderDiscount:true,productIds:['standard']});assert.equal(benefit.code,a.body.code);assert.ok(benefit.metadata.benefit_mac);assert.ok(!JSON.stringify(benefit).includes(h.w.address));
 h.products.get('standard').variants[0].compareAtPrice={value:60,currency:'USD'};await assert.rejects(()=>h.handler.checkoutBenefit(h.request('/goods/api/checkout',{}),{holderDiscount:true,productIds:['standard']}),/full-price/);
});
test('active coupon percentage remains its issued percentage when current wallet eligibility changes',async()=>{
 const h=await harness();await h.login();h.setBalance('750000000000');const issued=await h.api('/discount',{});assert.equal(issued.body.percent,3);h.setBalance('5000000000000');let s=await h.api('/status');assert.equal(s.body.discount.percent,3);assert.equal(s.body.discount.eligiblePercent,20);assert.equal(s.body.discount.activeCode,issued.body.code);h.setBalance('0');s=await h.api('/status');assert.equal(s.body.discount.percent,3);assert.equal(s.body.discount.eligiblePercent,0);
});
test('provider product scope and entire-order quantity scope are required before exposing a coupon',async()=>{
 for(const patch of[{type:'ENTIRE_ORDER_WITH_EXCLUDED_PRODUCTS'},{type:'SELECTED_PRODUCTS',products:[]},{type:'SELECTED_PRODUCTS',products:['standard'],oncePerOrder:true}]){const h=await harness();await h.login();const create=h.provider.createPromotion;h.provider.createPromotion=async b=>({...await create(b),appliesTo:patch});const r=await h.api('/discount',{});assert.equal(r.status,503);assert.equal(r.body.code,undefined);assert.equal(h.calls.filter(c=>c[0]==='cart').length,0)}
});
test('larger premium tee sizes match existing Lore prices and derive margin from live supplier costs',async()=>{
 for(const [size,cost,margin]of[['2XL',26.84,33.15],['3XL',28.84,31.15]]){const h=await harness();await h.login();const t=structuredClone(template);t.colorVariants[1].sizeVariants=[{size,available:true,price:{amount:cost,currency:'USD'}}];h.setTemplate(t);h.provider.createProduct=async body=>{h.calls.push(['product',body]);const p=product('large');p.variants[0].attributes.size.name=size;p.variants[0].unitPrice.value=59.99;h.products.set('large',p);return{productId:'large'}};const r=await h.api('/custom',{mint:h.mint,colour:'Butter',size,idempotencyKey:'large-size-custom-'+size});assert.equal(r.body.state,'ready');assert.equal(r.body.price,59.99);assert.equal(h.calls.find(c=>c[0]==='product')[1].profitMargin,margin)}
});
test('prepared print dimensions survive polling, page reload and supplier product description',async()=>{
 const h=await harness();await h.login();const printInfo={widthCm:17.3,sourcePixels:1024,dpi:150,upscaled:false};h.setResolve(async()=>({imageId:'prepared-art',placementStrategy:'FULL_REGION',printInfo,printMessage:'Approximately17.3cm square.'}));const c=await h.api('/custom',{mint:h.mint,colour:'Butter',size:'M',idempotencyKey:'print-dimensions-123456'});assert.equal(c.body.state,'ready');assert.deepEqual(c.body.printInfo,printInfo);assert.deepEqual((await h.api('/status')).body.custom.activeRequest.printInfo,printInfo);assert.equal(h.calls.find(c=>c[0]==='customization')[1].placementStrategy,'FULL_REGION');assert.match(h.calls.find(c=>c[0]==='product')[1].description,/17.3 × 17.3 cm/);
});
test('ready message discloses low-resolution32cm artwork without rewriting a legacy17.3cm request',async()=>{
 for(const printInfo of[{widthCm:32,sourcePixels:1024,dpi:81,upscaled:false,lowResolution:true},{widthCm:17.3,sourcePixels:1024,dpi:150,upscaled:false}]){const h=await harness();await h.login();h.setResolve(async()=>({imageId:'prepared-art',placementStrategy:'FULL_REGION',printInfo,printMessage:'Print preparation in progress.'}));const c=await h.api('/custom',{mint:h.mint,colour:'Butter',size:'M',idempotencyKey:'resolution-copy-123456'});assert.equal(c.body.state,'ready');assert.match(c.body.message,new RegExp(`${printInfo.widthCm} × ${printInfo.widthCm} cm`));assert.equal(/Fine detail may look softer/.test(c.body.message),Boolean(printInfo.lowResolution));assert.deepEqual(c.body.printInfo,printInfo);assert.deepEqual((await h.api('/status')).body.custom.activeRequest.printInfo,printInfo)}
});
test('NFT thumbnails are same-origin, private and freshly owner-checked without accepting an arbitrary URL',async()=>{
 const h=await harness();await h.login();const listed=await h.api('/nfts');assert.equal(listed.body.items[0].image,'/goods/api/benefits/nft-image/'+h.mint);let reads=0;h.setResolve(async a=>{assert.equal(a.mint,h.mint);reads++;return{bytes:new Uint8Array([137,80,78,71]),contentType:'image/png'}});let r=await h.handler(h.request('/goods/api/benefits/nft-image/'+h.mint));assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/png');assert.match(r.headers.get('cache-control'),/private/);assert.equal(r.headers.get('cross-origin-resource-policy'),'same-origin');assert.deepEqual([...new Uint8Array(await r.arrayBuffer())],[137,80,78,71]);h.setOwns(false);r=await h.handler(h.request('/goods/api/benefits/nft-image/'+h.mint));assert.equal(r.status,403);assert.equal(reads,1);r=await h.handler(h.request('/goods/api/benefits/nft-image/https%3A%2F%2Fattacker.invalid'));assert.equal(r.status,404);assert.equal(reads,1);
});
test('official Irys redirect is bounded to its exact transaction while arbitrary CDN URLs remain rejected',async()=>{
 const b=new Uint8Array(100);b.set([137,80,78,71,13,10,26,10]);new DataView(b.buffer).setUint32(16,1024);new DataView(b.buffer).setUint32(20,1024);const cdn='https://'+'a'.repeat(52)+'.mainnet-1.datasprite-cdn.com/transaction/';let calls=0;const resolve=createGoodsPrintAssetResolver({fetchImpl:async url=>{calls++;return String(url).includes('gateway.irys.xyz')?new Response(null,{status:302,headers:{location:cdn}}):new Response(b)}});assert.equal((await resolve({image:'https://gateway.irys.xyz/transaction'})).width,1024);assert.equal(calls,2);await assert.rejects(()=>resolve({image:cdn}));assert.equal(calls,2);await assert.rejects(()=>resolve({image:'https://gateway.irys.xyz/wrong-transaction'}));assert.equal(calls,3);
});
test('concurrent requests cannot issue duplicate codes or reserve beyond last order slot',async()=>{
 const h=await harness();await h.login();await h.store.reserve({id:'historic',wallet:h.w.address,kind:'discount',key:'historic',state:'consumed',now:1,expiresAt:1});await h.store.update('historic',{active:0},1);for(let i=0;i<9;i++)await h.store.run('INSERT INTO goods_benefit_orders VALUES(?,?,?,?,?,?)','old-'+i,h.w.address,'discount','historic','CONFIRMED',1);
 const results=await Promise.all(Array.from({length:6},()=>h.api('/discount',{})));assert.ok(results.some(x=>x.status===200));assert.equal(h.calls.filter(c=>c[0]==='promotion').length,1);assert.equal((await h.store.all("SELECT * FROM goods_benefit_requests WHERE active=1")).length,1);
 const r=await h.store.active(h.w.address,'discount');h.orders.set('paid',order('paid',{promotionId:r.promotion_id}));await h.handler.reconcileOrder('paid');assert.equal(await h.store.count(h.w.address,'discount'),10);assert.equal((await h.api('/discount',{})).status,409);
});
test('uncertain coupon creation reconciles by cryptographic code instead of creating again',async()=>{
 const h=await harness();await h.login();const create=h.provider.createPromotion;h.provider.createPromotion=async b=>{await create(b);throw Error('network lost after write')};assert.equal((await h.api('/discount',{})).status,200);const retry=await h.api('/discount',{});assert.equal(retry.status,200);assert.equal(h.calls.filter(c=>c[0]==='promotion').length,1);
});
test('holder codes never expire locally and a used unreported code never permits replacement',async()=>{
 const h=await harness();await h.login();const initial=await h.api('/discount',{});assert.equal(initial.body.expiresAt,undefined);const r=await h.store.active(h.w.address,'discount');h.advance(365*86400000);await h.login();const again=await h.api('/discount',{});assert.equal(again.body.code,initial.body.code);assert.equal(h.calls.filter(c=>c[0]==='promotion').length,1);assert.equal((await h.api('/status')).body.discount.expiresAt,undefined);
 h.promotions.get(r.promotion_id).usageCount=1;h.promotions.get(r.promotion_id).status='AllUsed';assert.equal((await h.api('/discount',{})).status,409);assert.equal((await h.store.request(r.id)).active,1);
});
test('cancelled restored code reserves its original slot even alongside a newer code, without duplicate issuance',async()=>{
 const h=await harness();await h.login();const first=(await h.api('/discount',{})).body,r1=await h.store.active(h.w.address,'discount');h.promotions.get(r1.promotion_id).usageCount=1;h.promotions.get(r1.promotion_id).status='AllUsed';const paid=order('first-order',{promotionId:r1.promotion_id});h.orders.set(paid.id,paid);await h.handler.reconcileOrder(paid.id);const second=(await h.api('/discount',{})).body;assert.notEqual(first.code,second.code);
 h.promotions.get(r1.promotion_id).usageCount=0;h.promotions.get(r1.promotion_id).status='Live';const cancelled={...paid,status:'CANCELLED',updatedAt:'2026-10-08T12:02:00Z'};h.orders.set(paid.id,cancelled);await h.handler.reconcileOrder(paid.id);assert.equal(await h.store.count(h.w.address,'discount'),0);assert.equal((await h.store.all("SELECT * FROM goods_benefit_requests WHERE active=1 AND kind='discount'")).length,2);await h.api('/discount',{});assert.equal(h.calls.filter(c=>c[0]==='promotion').length,2);
 h.orders.set(paid.id,paid);await h.handler.reconcileOrder(paid.id);assert.equal((await h.store.request(r1.id)).active,1);assert.equal(await h.store.count(h.w.address,'discount'),0);
});
test('cancelled order allowance is not freed before authoritative promotion readback succeeds',async()=>{
 const h=await harness();await h.login();await h.api('/discount',{});const r=await h.store.active(h.w.address,'discount'),paid=order('order-to-cancel',{promotionId:r.promotion_id});h.orders.set(paid.id,paid);await h.handler.reconcileOrder(paid.id);const original=h.provider.getPromotion;h.provider.getPromotion=async()=>{throw Error('provider unavailable')};h.orders.set(paid.id,{...paid,status:'CANCELLED',updatedAt:'2026-10-08T12:03:00Z'});await assert.rejects(()=>h.handler.reconcileOrder(paid.id));assert.equal(await h.store.count(h.w.address,'discount'),1);
 h.provider.getPromotion=original;h.promotions.get(r.promotion_id).usageCount=1;h.promotions.get(r.promotion_id).status='AllUsed';await h.handler.reconcileOrder(paid.id);assert.equal(await h.store.count(h.w.address,'discount'),0);assert.equal((await h.store.request(r.id)).active,0);
});
test('provider-ended unused code releases safely, but an ended used code waits for its paid order',async()=>{
 const h=await harness();await h.login();const first=(await h.api('/discount',{})).body,r=await h.store.active(h.w.address,'discount');h.promotions.get(r.promotion_id).status='Ended';const second=await h.api('/discount',{});assert.equal(second.status,200);assert.notEqual(first.code,second.body.code);assert.equal((await h.store.request(r.id)).active,0);const next=await h.store.active(h.w.address,'discount');h.promotions.get(next.promotion_id).status='Ended';h.promotions.get(next.promotion_id).usageCount=1;assert.equal((await h.api('/discount',{})).status,409);assert.equal((await h.store.request(next.id)).active,1);
});
test('duplicate cancellation after restored code is used again cannot reactivate the spent code',async()=>{
 const h=await harness();await h.login();await h.api('/discount',{});const r=await h.store.active(h.w.address,'discount'),one=order('first-use',{promotionId:r.promotion_id});h.orders.set(one.id,one);await h.handler.reconcileOrder(one.id);h.orders.set(one.id,{...one,status:'CANCELLED',updatedAt:'2026-10-08T12:01:00Z'});await h.handler.reconcileOrder(one.id);assert.equal((await h.store.request(r.id)).active,1);
 h.promotions.get(r.promotion_id).status='AllUsed';h.promotions.get(r.promotion_id).usageCount=1;const two=order('second-use',{promotionId:r.promotion_id,updatedAt:'2026-10-08T12:02:00Z'});h.orders.set(two.id,two);await h.handler.reconcileOrder(two.id);await h.handler.reconcileOrder(one.id);assert.equal((await h.store.request(r.id)).active,0);assert.equal(await h.store.count(h.w.address,'discount'),1);
});
test('new custom tee can use a previously issued holder code without a provider promotion update',async()=>{
 const h=await harness();await h.login();const discount=(await h.api('/discount',{})).body;h.provider.setPromotionProducts=async()=>{throw Error('must never update')};h.provider.endPromotion=async()=>{throw Error('must never end')};const c=await h.api('/custom',{mint:h.mint,colour:'Butter',size:'M',idempotencyKey:'new-custom-holder-123456'});const checkout=await h.api('/custom/'+c.body.id+'/checkout',{holderDiscount:true});assert.equal(checkout.status,200);assert.equal(h.calls.find(x=>x[0]==='cart')[1].code,discount.code);assert.equal(h.calls.filter(c=>c[0]==='promotion').length,1);
});
test('verified webhook persists before acknowledgment; duplicates count once, cancellation restores quota and stale updates cannot undo it',async()=>{
 const h=await harness();await h.login();await h.api('/discount',{});const r=await h.store.active(h.w.address,'discount');const o=order('order-1',{promotionId:r.promotion_id});h.orders.set(o.id,o);const event={id:'e1',shopId:'shop-fixture',type:'ORDER_PLACED',testMode:false,data:{id:o.id}};
 assert.equal((await webhook(h,event)).status,200);assert.equal(await h.store.count(h.w.address,'discount'),0);await h.handler.drainEvents();await webhook(h,event);await h.handler.drainEvents();assert.equal(await h.store.count(h.w.address,'discount'),1);
 h.orders.set(o.id,{...o,status:'CANCELLED',updatedAt:'2026-10-08T12:01:00Z'});await h.handler.reconcileOrder(o.id);assert.equal(await h.store.count(h.w.address,'discount'),0);
 h.orders.set(o.id,o);await h.handler.reconcileOrder(o.id);assert.equal(await h.store.count(h.w.address,'discount'),0);
 assert.equal(h.promotions.get(r.promotion_id).status,'Live');assert.equal((await h.store.request(r.id)).active,1);assert.equal((await h.store.request(r.id)).state,'ready');
});
test('invalid HMAC, another shop and test-mode events cannot consume order allowance',async()=>{
 const h=await harness();const bad=await h.handler(new Request('https://bullenciaga.com/goods/api/webhook',{method:'POST',body:'{}',headers:{'X-Fourthwall-Hmac-SHA256':'AA=='}}));assert.equal(bad.status,401);
 assert.equal((await webhook(h,{id:'x',shopId:'another',type:'ORDER_PLACED',data:{id:'order'}})).status,403);
 assert.equal((await webhook(h,{id:'t',shopId:'shop-fixture',testMode:true,type:'ORDER_PLACED',data:{id:'order'}})).status,200);assert.equal((await h.store.pendingEvents()).length,0);
 const raw='{"test":true}';assert.equal(await verifyFourthwallWebhook(enc.encode(raw),await signature(raw),'webhook-fixture-secret-long-enough'),true);assert.equal(await verifyFourthwallWebhook(enc.encode(raw+' '),await signature(raw),'webhook-fixture-secret-long-enough'),false);
});
test('custom tee validates specific owner, current colour/size, idempotency and actual supplier variant before checkout',async()=>{
 const h=await harness();await h.login();let body={mint:h.mint,colour:'Butter',size:'M',idempotencyKey:'same-request-id-123456'};h.setOwns(false);assert.equal((await h.api('/custom',body)).status,403);h.setOwns(true);assert.equal((await h.api('/custom',{...body,colour:'Black'})).status,409);
 const a=await h.api('/custom',body);assert.equal(a.status,202);assert.equal(a.body.state,'ready');assert.equal(a.body.price,54.99);assert.equal((await h.api('/custom',body)).body.id,a.body.id);assert.equal(h.calls.filter(c=>c[0]==='product').length,1);assert.equal((await h.api('/custom',{...body,size:'3XL'})).status,409);
 const checkout=await h.api(`/custom/${a.body.id}/checkout`,{});assert.equal(checkout.status,200);assert.match(checkout.body.checkoutUrl,/store.bullenciaga.com/);
 h.products.get('custom-1').variants[0].unitPrice.value=55.99;assert.equal((await h.api(`/custom/${a.body.id}/checkout`,{})).status,409);
});
test('custom preview reflects provider product and ambiguous product write is held for review, never duplicated',async()=>{
 const h=await harness();await h.login();h.provider.createProduct=async()=>{throw Error('ambiguous external write')};const body={mint:h.mint,colour:'Butter',size:'M',idempotencyKey:'uncertain-custom-123456'};const x=await h.api('/custom',body);assert.equal(x.body.state,'review_required');const r=await h.store.request(x.body.id);assert.equal(r.stage,'product_pending');assert.equal(r.active,1);assert.equal((await h.api('/custom',{...body,idempotencyKey:'next-custom-123456789'})).body.id,x.body.id);
});
test('low-resolution art is review-required without product creation or used order quota',async()=>{
 const h=await harness();await h.login();h.setResolve(async()=>{const {GoodsBenefitError}=await import('../src/goods-benefits.mjs');throw new GoodsBenefitError('ARTWORK_REVIEW','Needs higher resolution.',409)});const x=await h.api('/custom',{mint:h.mint,colour:'Butter',size:'M',idempotencyKey:'low-resolution-123456'});assert.equal(x.body.state,'review_required');assert.equal((await h.store.request(x.body.id)).active,0);assert.equal(h.calls.filter(c=>c[0]==='product').length,0);assert.equal(await h.store.count(h.w.address,'custom'),0);
});
test('custom quota counts orders not tee quantities, shared link attribution uses product identity, then sold-out',async()=>{
 const h=await harness();await h.login();const x=await h.api('/custom',{mint:h.mint,colour:'Butter',size:'M',idempotencyKey:'shared-custom-123456'});const r=await h.store.request(x.body.id);
 const o=order('shared-order',{offers:[{id:r.product_id,quantity:7}],metadata:{custom_request:'forged-other-request'}});h.orders.set(o.id,o);await h.handler.reconcileOrder(o.id);assert.equal(await h.store.count(h.w.address,'custom'),1);assert.equal(h.products.get(r.product_id).state.type,'SOLD_OUT');assert.equal((await h.api(`/custom/${r.id}/checkout`,{})).status,409);await h.handler.reconcileOrder(o.id);assert.equal(await h.store.count(h.w.address,'custom'),1);
});
test('fresh chain checks exact ownership, collection and unburnt Core assets; unverified legacy spoof rejected',async()=>{
 const h=await harness(),collection=Object.keys(GOODS_OFFICIAL_COLLECTIONS)[0],a={id:h.mint,interface:'MplCoreAsset',ownership:{owner:h.w.address},grouping:[{group_key:'collection',group_value:collection}],content:{metadata:{name:'HERD #42'},links:{image:h.asset.image}}};assert.equal(officialOwnedAsset(a,h.w.address).mint,h.mint);assert.equal(officialOwnedAsset({...a,burnt:true},h.w.address),null);assert.equal(officialOwnedAsset({...a,interface:'V1_NFT'},h.w.address),null);assert.equal(officialOwnedAsset({...a,grouping:[...a.grouping,...a.grouping]},h.w.address),null);
 const calls=[];const client=createGoodsChainClient({rpcBinding:{fetch:async req=>{const b=await req.json();calls.push(b);assert.equal(new URL(req.url).pathname,'/rpc');return Response.json({result:b.method==='getTokenAccountsByOwner'?{value:[{account:{data:{parsed:{info:{owner:h.w.address,mint:GOODS_BULLEN_MINT,tokenAmount:{decimals:6,amount:'250000000000'}}}}}}]}:a})}}});assert.equal((await client.balance(h.w.address)).percent,1);assert.equal((await client.owned(h.w.address,h.mint)).mint,h.mint);assert.equal(calls[0].params[2].commitment,'finalized');assert.equal(calls[1].method,'getAsset');
});
test('print resolver blocks arbitrary URLs and redirected private hosts before downloading, validates source dimensions',async()=>{
 let calls=0;const resolver=createGoodsPrintAssetResolver({fetchImpl:async()=>{calls++;return new Response(null,{status:302,headers:{Location:'http://127.0.0.1/secret'}})}});await assert.rejects(()=>resolver({image:'https://attacker.invalid/x'}));assert.equal(calls,0);await assert.rejects(()=>resolver({image:'https://gateway.irys.xyz/x'}));assert.equal(calls,1);
 const b=new Uint8Array(100);b.set([137,80,78,71,13,10,26,10]);const d=new DataView(b.buffer);d.setUint32(16,512);d.setUint32(20,512);assert.equal(readRasterSize(b).width,512);await assert.rejects(()=>createGoodsPrintAssetResolver({fetchImpl:async()=>new Response(b)})({image:'https://gateway.irys.xyz/x'}),/higher-resolution/);
});
test('Fourthwall adapter uses documented one-use fields, no expiry fiction, never follows credentialed redirects',async()=>{
 const calls=[];const p=createFourthwallBenefitsClient({username:'test-user',password:'test-secret',storefrontToken:'token',fetchImpl:async(u,o)=>{calls.push({u:String(u),o});return Response.json({id:'promotion'})}});await p.createPromotion({code:'BULLEN-TEST',percent:4,productIds:['p1']});const b=JSON.parse(calls[0].o.body);assert.deepEqual(b.discount,{type:'PERCENTAGE',percentage:4,shipping:'Excluded'});assert.deepEqual(b.limits,{maximumUse:1,oneUsePerCustomer:true});assert.equal(Object.hasOwn(b,'appliesToProducts'),false);assert.equal(calls[0].o.redirect,'manual');assert.equal(Object.hasOwn(b,'expiresAt'),false);
 const bad=createFourthwallBenefitsClient({username:'never',password:'leak',fetchImpl:async()=>new Response(null,{status:307,headers:{Location:'https://attacker.invalid/'}})});await assert.rejects(()=>bad.getProduct('p'),e=>!e.message.includes('leak'));
});

test('pre-write provider failure is recoverable and custom job survives page reload',async()=>{
 const h=await harness();await h.login();const original=h.provider.getProduct;let unavailable=true;h.provider.getProduct=async id=>{if(unavailable)throw Error('before write');return original(id)};
 assert.equal((await h.api('/discount',{})).status,503);assert.equal(h.calls.filter(c=>c[0]==='promotion').length,0);unavailable=false;assert.equal((await h.api('/discount',{})).status,200);
 const c=await h.api('/custom',{mint:h.mint,colour:'Butter',size:'M',idempotencyKey:'restore-custom-123456'});const status=await h.api('/status');assert.equal(status.body.custom.activeRequest.id,c.body.id);
});
test('expired custom cannot free its last slot in browser before missing paid order reconciliation',async()=>{
 const h=await harness();await h.login();await h.store.reserve({id:'history',wallet:h.w.address,kind:'custom',key:'history',state:'consumed',now:1,expiresAt:1});await h.store.update('history',{active:0},1);for(let i=0;i<9;i++)await h.store.run('INSERT INTO goods_benefit_orders VALUES(?,?,?,?,?,?)','custom-history-'+i,h.w.address,'custom','history','CONFIRMED',1);
 const c=await h.api('/custom',{mint:h.mint,colour:'Butter',size:'M',idempotencyKey:'tenth-custom-123456'});const r=await h.store.request(c.body.id);h.orders.set('tenth-paid',order('tenth-paid',{offers:[{id:r.product_id,quantity:1}]}));h.advance(86400001);await h.login();
 const another=await h.api('/custom',{mint:h.mint,colour:'Black',size:'3XL',idempotencyKey:'eleventh-custom-123456'});assert.equal(another.status,409);assert.equal((await h.store.request(r.id)).active,1);assert.equal(h.calls.filter(c=>c[0]==='product').length,1);
 await h.handler.reconcile();assert.equal(await h.store.count(h.w.address,'custom'),10);assert.equal((await h.api('/custom',{mint:h.mint,colour:'Butter',size:'M',idempotencyKey:'eleventh-custom-123457'})).status,409);
});
test('production queue receives request ID and redelivery does not create a second product',async()=>{
 const queued=[];const h=await harness({enqueueCustom:async id=>queued.push(id)});await h.login();const c=await h.api('/custom',{mint:h.mint,colour:'Butter',size:'M',idempotencyKey:'queued-custom-123456'});assert.equal(c.body.state,'preparing');assert.deepEqual(queued,[c.body.id]);assert.equal(h.calls.filter(c=>c[0]==='product').length,0);await h.handler.processCustom(c.body.id);await h.handler.processCustom(c.body.id);assert.equal((await h.api('/custom/'+c.body.id)).body.state,'ready');assert.equal(h.calls.filter(c=>c[0]==='product').length,1);
});
test('missing runtime attribution/webhook secret fails closed before any provider write',async()=>{
 for(const missing of [{metadataSecret:''},{webhookSecret:''},{shopId:''}]){const h=await harness(missing);await h.login();assert.equal((await h.api('/discount',{})).status,503);assert.equal((await h.api('/custom',{mint:h.mint,colour:'Butter',size:'M',idempotencyKey:'misconfigured-123456'})).status,503);assert.equal(h.calls.length,0)}
});
test('explicit supplier429 preserves retry delay and resumes customization/product writes without duplication',async()=>{
 for(const operation of['createCustomization','createProduct']){const h=await harness({enqueueCustom:async()=>{}});await h.login();const c=await h.api('/custom',{mint:h.mint,colour:'Butter',size:'M',idempotencyKey:'rate-limited-'+operation}),original=h.provider[operation];let rejected=false;h.provider[operation]=async b=>{if(!rejected){rejected=true;throw new FourthwallRateLimitError(120)}return original(b)};
  await assert.rejects(()=>h.handler.processCustom(c.body.id),e=>e.code==='PROVIDER_RATE_LIMIT'&&e.retryAfterSeconds===120);let r=await h.store.request(c.body.id);assert.equal(r.stage,'queued');assert.equal(r.active,1);assert.equal(r.retry_count,1);assert.equal(r.next_retry_at,h.time()+120000);await assert.rejects(()=>h.handler.processCustom(c.body.id),FourthwallRateLimitError);assert.equal((await h.store.request(c.body.id)).retry_count,1);h.advance(120001);await h.handler.processCustom(c.body.id);r=await h.store.request(c.body.id);assert.equal(r.state,'ready');assert.equal(h.calls.filter(c=>c[0]==='product').length,1);assert.equal(h.calls.filter(c=>c[0]==='customization').length,1);
 }
});
test('post-create readback429 resumes the same product, never creating a second product',async()=>{
 const h=await harness({enqueueCustom:async()=>{}});await h.login();const c=await h.api('/custom',{mint:h.mint,colour:'Butter',size:'M',idempotencyKey:'readback429-custom-123'}),get=h.provider.getProduct;let rejected=false;h.provider.getProduct=async id=>{if(id.startsWith('custom-')&&!rejected){rejected=true;throw new FourthwallRateLimitError()}return get(id)};await assert.rejects(()=>h.handler.processCustom(c.body.id),FourthwallRateLimitError);let r=await h.store.request(c.body.id);assert.equal(r.product_id,'custom-1');assert.equal(r.stage,'queued');h.advance(60001);await h.handler.processCustom(c.body.id);assert.equal((await h.store.request(c.body.id)).state,'ready');assert.equal(h.calls.filter(c=>c[0]==='product').length,1);assert.equal(h.calls.filter(c=>c[0]==='customization').length,1);
});
test('rate retries stop after five and release only a known-uncreated product reservation',async()=>{
 const h=await harness({enqueueCustom:async()=>{}});await h.login();const c=await h.api('/custom',{mint:h.mint,colour:'Butter',size:'M',idempotencyKey:'retry-cap-custom-123456'});h.provider.createProduct=async()=>{throw new FourthwallRateLimitError()};for(let i=0;i<5;i++){await assert.rejects(()=>h.handler.processCustom(c.body.id),FourthwallRateLimitError);h.advance(60001)}await h.handler.processCustom(c.body.id);const r=await h.store.request(c.body.id);assert.equal(r.state,'review_required');assert.equal(r.active,0);assert.equal(r.retry_count,5);assert.equal(r.product_id,null);assert.equal(h.calls.filter(c=>c[0]==='customization').length,1);
});
test('rate retry does not run provider writes after saved request expiry',async()=>{
 const h=await harness({enqueueCustom:async()=>{}});await h.login();const c=await h.api('/custom',{mint:h.mint,colour:'Butter',size:'M',idempotencyKey:'expired-retry-custom-123'});h.provider.createProduct=async()=>{throw new FourthwallRateLimitError()};await assert.rejects(()=>h.handler.processCustom(c.body.id),FourthwallRateLimitError);const count=h.calls.length;h.advance(86400001);await h.handler.processCustom(c.body.id);assert.equal(h.calls.length,count);assert.equal((await h.store.request(c.body.id)).active,1);
});
test('adapter preserves explicit429 only; timeouts and5xx stay ambiguous and Retry-After is bounded',async()=>{
 for(const [header,seconds]of[['2',60],['125',125],['99999',900]]){const p=createFourthwallBenefitsClient({username:'u',password:'p',fetchImpl:async()=>new Response(null,{status:429,headers:{'Retry-After':header}})});await assert.rejects(()=>p.createProduct({}),e=>e instanceof FourthwallRateLimitError&&e.retryAfterSeconds===seconds)}for(const status of[500,503]){const p=createFourthwallBenefitsClient({username:'u',password:'p',fetchImpl:async()=>new Response(null,{status})});await assert.rejects(()=>p.createProduct({}),e=>e.code==='UNAVAILABLE'&&!(e instanceof FourthwallRateLimitError))}
});
