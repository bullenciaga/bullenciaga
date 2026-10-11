import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {merchPreview} from '../src/merch-preview.mjs';
import {createGoodsRuntime} from '../src/goods-runtime.mjs';
import {GoodsBenefitsStore} from '../src/goods-benefits.mjs';
import mappings from '../src/goods-mappings.mjs';
const origin='https://bullenciaga.com';
function database(){
 const sqlite=new DatabaseSync(':memory:');
 for(const file of readdirSync(new URL('../migrations/goods/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../migrations/goods/'+file,import.meta.url),'utf8'));
 return {sqlite,prepare:sql=>({bind(...args){const statement=sqlite.prepare(sql);return {first:async()=>statement.get(...args)||null,all:async()=>({results:statement.all(...args)}),run:async()=>({meta:{changes:Number(statement.run(...args).changes)}})};}}),batch:async statements=>{sqlite.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results}catch(error){sqlite.exec('ROLLBACK');throw error}}};
}
function harness(){
 const db=database(),store=new GoodsBenefitsStore(db),wallet='11111111111111111111111111111111',otherWallet='22222222222222222222222222222222',token='a'.repeat(64),otherToken='b'.repeat(64),now=Date.now();
 for(const [t,w] of [[token,wallet],[otherToken,otherWallet]])db.sqlite.prepare('INSERT INTO goods_wallet_sessions VALUES(?,?,?)').run(createHash('sha256').update(t).digest('hex'),w,now+600000);
 const env={MERCH_PREVIEW_PROTECTED:'0',MERCH_PREVIEW_PREFIX:'fixture',MERCH_PREVIEW_ASSETS:{get:async()=>null,head:async()=>null},MERCH_PREVIEW_LIMIT:{limit:async()=>({success:true})},GOODS_BENEFITS_ENABLED:'1',GOODS_CHECKOUT_ENABLED:'1',GOODS_DB:db,GOODS_CUSTOM_QUEUE:{send:async()=>{}},CONTROL_AUTH:{fetch:async()=>{throw Error('No chain writes or reads expected during checkout')}},GOODS_PLATFORM_USERNAME:'fixture-user',GOODS_PLATFORM_PASSWORD:'fixture-password',GOODS_STOREFRONT_TOKEN:'fixture-token',GOODS_SHOP_ID:'fixture-shop',GOODS_WEBHOOK_SECRET:'fixture-webhook-secret-at-least-24',GOODS_BENEFIT_METADATA_SECRET:'fixture-metadata-secret-at-least-24'};
 const m=mappings.variants.find(v=>v.product==='house-ritual-mug')||mappings.variants.find(v=>v.enabled),products=new Map(),orders=new Map(),carts=[],reads=[];
 const variant=(id,price,colour,size)=>({id,unitPrice:{value:price,currency:'USD'},attributes:{color:{name:colour},size:{name:size}},stock:{type:'UNLIMITED'}});
 products.set(m.productId,{id:m.productId,slug:m.slug,type:'STANDARD',state:{type:'AVAILABLE'},access:{type:'PUBLIC'},variants:[variant(m.variantId,24.99,m.expectedColor,m.expectedSize)]});
 function custom(id,garment,colour,size,price){
  db.sqlite.prepare("INSERT INTO goods_benefit_requests(id,wallet,kind,idempotency_key,state,created_at,updated_at,expires_at,product_id,variant_id,price,colour,size,garment,name) VALUES(?,?,'custom',?,'ready',?,?,?,?,?,?,?,?,?,?)").run(id,wallet,id,now,now,now+600000,'product-'+id,'variant-'+id,price,colour,size,garment,'HERD #42');
  products.set('product-'+id,{id:'product-'+id,type:'STANDARD',state:{type:'AVAILABLE'},access:{type:'HIDDEN'},variants:[variant('variant-'+id,price,colour,size)]});
  return {customRequestId:id,quantity:1,expectedUnitPrice:price};
 }
 const mug=custom('custom-mug','mug','Black','11oz',29.99),tee=custom('custom-tee','tee','Butter','M',49.99),hoodie=custom('custom-hoodie','hoodie','Natural','L',99.99);
 const regular={product:m.product,colour:m.colour,size:m.size,variantId:m.variantId,quantity:2,expectedUnitPrice:24.99};
 let cartMutator=async x=>x,readHook=async()=>{},cartError=false;
 const promotion={id:'promotion-fixture',code:'BULLEN-FIXTURE',type:'SHOP_SINGLE',status:'Live',usageCount:0,discount:{type:'PERCENTAGE',percentage:4,shippingOption:'Excluded'},limits:{maximumUsesNumber:1},appliesTo:{type:'ENTIRE_ORDER'}};
 const fetchImpl=async(u,o)=>{
  const url=new URL(u);assert.equal(o.redirect,'manual');
  if(url.hostname==='api.fourthwall.com'){
   if(url.pathname.includes('/promotions/'))return Response.json(promotion);
   if(url.pathname.includes('/order/'))return Response.json(orders.get(decodeURIComponent(url.pathname.split('/').at(-1))));
   if(o.method==='PUT'&&url.pathname.endsWith('/availability')){const id=decodeURIComponent(url.pathname.split('/').at(-2));products.get(id).state.type=JSON.parse(o.body).available?'AVAILABLE':'SOLD_OUT';return Response.json({});}
   const id=decodeURIComponent(url.pathname.split('/').at(-1));
   reads.push(id);await readHook(id);return Response.json(products.get(id));
  }
  assert.equal(url.hostname,'storefront-api.fourthwall.com');
  if(o.method==='GET'){const p=[...products.values()].find(p=>url.pathname.endsWith('/'+p.slug));return Response.json({...p,type:'PRODUCT'});}
  const body=JSON.parse(o.body);carts.push(body);if(cartError)return new Response('private provider details',{status:500});
  return Response.json(await cartMutator({id:'mixed-cart-fixture',items:body.items.map(item=>({quantity:item.quantity,variant:structuredClone([...products.values()].flatMap(p=>p.variants).find(v=>v.id===item.variantId))})).reverse()}));
 };
 const request=(path,body,headers={})=>new Request(origin+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:'__Secure-goods_wallet='+token,...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const checkout=async(items=[regular,mug],patch={},headers={})=>{const original=globalThis.fetch;globalThis.fetch=fetchImpl;try{const response=await merchPreview(request('/goods/api/checkout',{currency:'USD',items,...patch},headers),env);return {status:response.status,body:await response.json()};}finally{globalThis.fetch=original}};
 const runtime=createGoodsRuntime(env,{authorize:async()=>true,rateLimit:async()=>true,fetchImpl});
 function discount(){db.sqlite.prepare("INSERT INTO goods_benefit_requests(id,wallet,kind,idempotency_key,state,created_at,updated_at,expires_at,percent,code,promotion_id) VALUES(?,?,'discount',?,'ready',?,?,?,?,?,?)").run('discount',wallet,'discount',now,now,0,4,promotion.code,promotion.id);}
 return {db,store,env,wallet,token,otherToken,products,orders,carts,reads,regular,mug,tee,hoodie,m,checkout,runtime,request,discount,now,setCartMutator:x=>cartMutator=x,setReadHook:x=>readHook=x,setCartError:x=>cartError=x};
}

test('regular quantities and multiple custom types reach one exact Fourthwall cart in either order',async()=>{
 for(const direction of ['regular-first','custom-first']){
  const h=harness(),items=direction==='regular-first'?[h.regular,h.mug,h.tee,h.hoodie]:[h.hoodie,h.mug,h.regular,h.tee];
  const result=await h.checkout(items);assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(h.carts.length,1);
  assert.deepEqual(h.carts[0].items,items.map(item=>({variantId:item.customRequestId?'variant-'+item.customRequestId:item.variantId,quantity:item.quantity})));
  const url=new URL(result.body.checkoutUrl);assert.equal(url.hostname,'store.bullenciaga.com');assert.equal(url.searchParams.get('cartId'),'mixed-cart-fixture');assert.equal(result.body.checkoutHost,url.hostname);
  assert.equal(await h.store.count(h.wallet,'custom'),0,'Opening checkout does not consume an order');
  assert.deepEqual(h.carts[0].metadata,{source:'bullenciaga_goods'});assert.ok(!JSON.stringify(h.carts[0]).includes(h.wallet));
 }
});
test('custom-only and anonymous regular-only bags use the same endpoint',async()=>{
 const h=harness();assert.equal((await h.checkout([h.mug,h.tee])).status,200);assert.equal((await h.checkout([h.regular],{},{Cookie:''})).status,200);assert.equal(h.carts.length,2);
});
test('missing or wrong wallet sessions cannot add another wallet custom product',async()=>{
 for(const cookie of ['', '__Secure-goods_wallet='+'b'.repeat(64)]){const h=harness(),result=await h.checkout(undefined,{},{Cookie:cookie});assert.equal(result.status,cookie?409:401);assert.equal(result.body.code,cookie?'CUSTOM_NOT_READY':'WALLET_REQUIRED');assert.equal(h.carts.length,0);assert.equal(h.reads.length,0);}
});
test('duplicate, arbitrary-variant, malformed and quantity-inflated custom rows reject before provider carts',async()=>{
 for(const make of [h=>[h.mug,h.mug],h=>[{...h.mug,variantId:'attacker'}],h=>[{...h.mug,product:'attacker'}],h=>[{...h.mug,quantity:2}],h=>[{...h.mug,quantity:0}],h=>[{...h.mug,expectedUnitPrice:'29.99'}],h=>[{...h.mug,customRequestId:'../custom'}],h=>[{...h.mug,customRequestId:'unknown'}],h=>[{...h.mug,expectedUnitPrice:1}]]){
  const h=harness(),result=await h.checkout(make(h));assert.ok(result.status>=400);assert.equal(h.carts.length,0);assert.equal(h.reads.length,0);
 }
});
test('expired, consumed, discarding, preparing, disabled and unowned requests fail closed',async()=>{
 for(const change of ["expires_at=1","state='consumed',active=0","discard_requested_at=1","state='preparing'","active=0","wallet='other'"]){const h=harness();h.db.sqlite.exec(`UPDATE goods_benefit_requests SET ${change} WHERE id='custom-mug'`);const result=await h.checkout();assert.equal(result.status,409);assert.equal(result.body.code,'CUSTOM_NOT_READY');assert.equal(h.carts.length,0);}
 const h=harness();h.env.GOODS_BENEFITS_ENABLED='0';const result=await h.checkout();assert.equal(result.status,409);assert.equal(result.body.code,'BENEFITS_UNAVAILABLE');assert.equal(h.carts.length,0);
});
test('custom supplier identity, stock, selection, currency and price are checked before a mixed cart',async()=>{
 for(const change of [p=>p.id='wrong',p=>p.type='DIGITAL',p=>p.state.type='SOLD_OUT',p=>p.access.type='ARCHIVED',p=>p.variants[0].id='wrong',p=>p.variants[0].stock={type:'LIMITED',inStock:0},p=>p.variants[0].unitPrice.value=30.99,p=>p.variants[0].unitPrice.currency='EUR',p=>p.variants[0].attributes.color.name='White',p=>p.variants[0].attributes.size.name='15oz']){const h=harness();change(h.products.get('product-custom-mug'));const result=await h.checkout();assert.equal(result.status,409);assert.equal(result.body.code,'VARIANT_CHANGED');assert.equal(h.carts.length,0);}
});
test('full-price mixed products retain the single issued holder discount and reject sale exclusions',async()=>{
 const h=harness();h.discount();const result=await h.checkout([h.regular,h.mug,h.tee],{holderDiscount:true,coupon:'FORGED'});assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(new URL(result.body.checkoutUrl).searchParams.get('coupon'),'BULLEN-FIXTURE');assert.equal(h.carts[0].metadata.benefit_request,'discount');assert.ok(h.carts[0].metadata.benefit_mac);assert.ok(!JSON.stringify(h.carts[0]).includes('FORGED'));
 for(const id of [h.m.productId,'product-custom-mug']){h.products.get(id).variants[0].compareAtPrice={value:999,currency:'USD'};const rejected=await h.checkout(undefined,{holderDiscount:true});assert.equal(rejected.status,409);assert.equal(rejected.body.code,'DISCOUNT_SCOPE');assert.equal(h.carts.length,1);delete h.products.get(id).variants[0].compareAtPrice;}
});
test('provider reordering is allowed but altered custom/regular rows, prices, counts and quantities cannot redirect',async()=>{
 for(const change of [c=>{c.items[0].variant.id='other';return c},c=>{c.items[0].quantity=2;return c},c=>{c.items[0].variant.unitPrice.value=0;return c},c=>{c.items[0].variant.unitPrice.currency='EUR';return c},c=>{c.items.push(c.items[0]);return c},c=>{c.items.pop();return c},c=>{c.items[1]=c.items[0];return c}]){const h=harness();h.setCartMutator(change);const result=await h.checkout();assert.ok(result.status>=400);assert.equal(result.body.checkoutUrl,undefined);}
 const h=harness();h.setCartError(true);const result=await h.checkout();assert.equal(result.status,503);assert.ok(!JSON.stringify(result).includes('private provider details'));
});
test('discard or expiry before cart creation and during provider cart IO never exposes a checkout URL',async()=>{
 for(const during of ['read','cart']){const h=harness();if(during==='read')h.setReadHook(async()=>h.store.update('custom-mug',{state:'discarding'},h.now));else h.setCartMutator(async cart=>{await h.store.update('custom-mug',{expires_at:1},h.now);return cart;});const result=await h.checkout();assert.equal(result.status,409);assert.equal(result.body.code,'CUSTOM_NOT_READY');assert.equal(result.body.checkoutUrl,undefined);assert.equal(h.carts.length,during==='read'?0:1);}
});
test('custom paid-order quota is checked before and after cart creation without counting bag items',async()=>{
 for(const timing of ['before','during']){const h=harness();const exhaust=()=>{for(let i=0;i<10;i++)h.db.sqlite.prepare('INSERT INTO goods_benefit_orders VALUES(?,?,?,?,?,?)').run('old-'+i,h.wallet,'custom','custom-tee','CONFIRMED',1);};if(timing==='before')exhaust();else h.setCartMutator(async cart=>{exhaust();return cart;});const result=await h.checkout([h.regular,h.mug,h.tee]);assert.equal(result.status,409);assert.equal(result.body.code,'LIMIT_REACHED');assert.equal(result.body.checkoutUrl,undefined);assert.equal(h.carts.length,timing==='before'?0:1);}
});
test('multiple custom pieces consume one paid order, all saved designs close, cancellation and stale events stay safe',async()=>{
 const h=harness(),order={id:'paid-mixed',status:'CONFIRMED',createdAt:new Date(h.now).toISOString(),updatedAt:new Date(h.now).toISOString(),offers:[{id:h.m.productId,quantity:2},{id:'product-custom-mug',quantity:1},{id:'product-custom-tee',quantity:1}],metadata:{custom_request:'FORGED'}};h.orders.set(order.id,order);
 await h.runtime.handler.reconcileOrder(order.id);assert.equal(await h.store.count(h.wallet,'custom'),1);
 for(const id of ['custom-mug','custom-tee']){assert.equal((await h.store.request(id)).state,'consumed');assert.equal((await h.store.request(id)).active,0);assert.equal(await h.store.markDiscard(id,h.wallet,h.now),false);const response=await h.runtime.handler(h.request('/goods/api/benefits/custom/'+id+'/discard',{}));assert.equal(response.status,409);assert.equal((await response.json()).error.code,'CUSTOM_PURCHASED');}
 await h.runtime.handler.reconcileOrder(order.id);assert.equal(await h.store.count(h.wallet,'custom'),1);
 h.orders.set(order.id,{...order,status:'CANCELLED',updatedAt:new Date(h.now+1000).toISOString()});await h.runtime.handler.reconcileOrder(order.id);assert.equal(await h.store.count(h.wallet,'custom'),0);
 h.orders.set(order.id,order);await h.runtime.handler.reconcileOrder(order.id);assert.equal(await h.store.count(h.wallet,'custom'),0);
 for(const id of ['custom-mug','custom-tee']){assert.equal((await h.store.request(id)).state,'consumed');assert.equal(h.products.get('product-'+id).state.type,'SOLD_OUT');assert.equal((await h.runtime.handler(h.request('/goods/api/benefits/custom/'+id+'/discard',{}))).status,409);}
});
