import test from 'node:test';
import assert from 'node:assert/strict';
import {merchPreview} from '../src/merch-preview.mjs';
import mappings from '../src/goods-mappings.mjs';
const origin='https://bullenciaga.com';
let calls=[];
const env={MERCH_PREVIEW_PREFIX:'fixture',MERCH_PREVIEW_ASSETS:{get:async()=>({body:'export const example=1;'}),head:async()=>({})},MERCH_PREVIEW_LIMIT:{limit:async({key})=>{calls.push(key);return {success:true};}}};
const req=(path,opts={})=>new Request(origin+path,opts);
test('public catalogue is rate limited and reveals no variants when sales are disabled',async()=>{calls=[];const r=await merchPreview(req('/goods/api/catalog'),env);assert.equal(r.status,200);const data=await r.json();assert.deepEqual(data.variants,[]);assert.equal(data.salesEnabled,false);assert.match(r.headers.get('Content-Security-Policy'),/connect-src 'self'/);assert.match(r.headers.get('Vary'),/Cookie/);assert.match(r.headers.get('Cache-Control'),/private, no-store/);assert.match(r.headers.get('X-Robots-Tag'),/noindex/);assert.equal(calls.length,1);assert.match(calls[0],/^[a-f0-9]{64}$/);});
test('provisioning token or runtime flag alone cannot activate checkout',async()=>{for(const overrides of [{GOODS_STOREFRONT_TOKEN:'fixture-token'},{GOODS_CHECKOUT_ENABLED:'1'}]){const r=await merchPreview(req('/goods/api/checkout',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({currency:'USD',items:[]})}),{...env,...overrides});assert.equal(r.status,409);assert.equal((await r.json()).code,'NOT_OPEN');}});
test('obsolete page cookies do not gate commerce; cross-origin checkout and unknown routes remain denied',async()=>{let r=await merchPreview(req('/goods/api/catalog',{headers:{Cookie:'__Secure-bullen_merch=bad'}}),env);assert.equal(r.status,200);r=await merchPreview(req('/goods/api/checkout',{method:'POST',headers:{Origin:'https://other.example','Content-Type':'application/json'},body:'{}'}),env);assert.equal(r.status,403);r=await merchPreview(req('/goods/api/orders',{}),env);assert.equal(r.status,404);});
test('public module asset uses JavaScript MIME without cookie',async()=>{const r=await merchPreview(req('/goods/goods-commerce.mjs'),env);assert.equal(r.status,200);assert.match(r.headers.get('Content-Type'),/^text\/javascript/);});

test('public handler creates an exact provider cart and returns the approved hosted checkout URL',async()=>{
  const eligible=mappings.variants.filter(v=>v.enabled);assert.ok(eligible.length>0);
  const chosen=eligible[0], observed=[];const nativeFetch=globalThis.fetch;
  const variant=m=>({id:m.variantId,unitPrice:{value:89.99,currency:'USD'},attributes:{color:{name:m.expectedColor},size:{name:m.expectedSize}},stock:{type:'UNLIMITED'}});
  globalThis.fetch=async(url,options)=>{
    const parsed=new URL(url);assert.equal(parsed.origin,'https://storefront-api.fourthwall.com');assert.equal(parsed.searchParams.get('storefront_token'),'fixture-token');assert.equal(options.redirect,'manual');assert.equal(options.headers['User-Agent'],'BULLENCIAGA Goods/1.0');
    observed.push({path:parsed.pathname,method:options.method});
    if(options.method==='GET'){
      const slug=parsed.pathname.split('/').at(-1), rows=eligible.filter(m=>m.slug===slug);assert.ok(rows.length);
      return Response.json({id:rows[0].productId,slug,type:'PRODUCT',access:{type:'HIDDEN'},state:{type:'AVAILABLE'},variants:rows.map(variant)});
    }
    assert.equal(parsed.pathname,'/v1/carts');const body=JSON.parse(options.body);assert.deepEqual(body.items,[{variantId:chosen.variantId,quantity:1}]);
    return Response.json({id:'fixture-cart',items:[{variant:variant(chosen),quantity:1}]});
  };
  try{
    const activeEnv={...env,GOODS_STOREFRONT_TOKEN:'fixture-token',GOODS_CHECKOUT_ENABLED:'1'};
    const catalogue=await merchPreview(req('/goods/api/catalog',{}),activeEnv);assert.equal(catalogue.status,200);const data=await catalogue.json();assert.equal(data.salesEnabled,true);assert.equal(data.variants.length,eligible.length);assert.ok(data.variants.every(v=>v.available));
    const r=await merchPreview(req('/goods/api/checkout',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','Sec-Fetch-Site':'same-origin'},body:JSON.stringify({currency:'USD',items:[{product:chosen.product,colour:chosen.colour,size:chosen.size,variantId:chosen.variantId,quantity:1,expectedUnitPrice:89.99}]})}),activeEnv);
    assert.equal(r.status,200);assert.deepEqual(await r.json(),{checkoutUrl:'https://store.bullenciaga.com/cart/checkout?cartId=fixture-cart&currency=USD',checkoutHost:'store.bullenciaga.com'});assert.equal(observed.filter(v=>v.method==='POST').length,1);assert.match(r.headers.get('Cache-Control'),/private, no-store/);
  }finally{globalThis.fetch=nativeFetch;}
});

test('supplier-unavailable Signature Black sizes remain unmapped despite provider UNLIMITED offers',async()=>{
 const rows=mappings.variants.filter(v=>v.product==='signature-tee' && v.colour==='T01B' && v.enabled);
 assert.deepEqual(rows.map(v=>v.size),['3XL']);
 const nativeFetch=globalThis.fetch;let upstreamCalls=0;
 globalThis.fetch=async()=>{upstreamCalls++;throw new Error('Unmapped sizes must be rejected locally');};
 try{
  const r=await merchPreview(req('/goods/api/checkout',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({currency:'USD',items:[{product:'signature-tee',colour:'T01B',size:'S',variantId:'640a54a7-01eb-4793-948c-3a3ff22bad02',quantity:1,expectedUnitPrice:44.99}]})}),{...env,GOODS_STOREFRONT_TOKEN:'fixture-token',GOODS_CHECKOUT_ENABLED:'1'});
  assert.equal(r.status,400);assert.equal(upstreamCalls,0);
 }finally{globalThis.fetch=nativeFetch;}
});

test('three House Emblem cap colours create one exact supplier cart at their live USD price',async()=>{
 const caps=mappings.variants.filter(v=>v.product==='house-emblem-cap' && v.enabled);
 assert.deepEqual(caps.map(v=>[v.colour,v.expectedColor,v.size,v.expectedSize]),[
  ['K03-BLACK','Black','One size','One size'],
  ['K03-CAMEL','Camel','One size','One size'],
  ['K03-OLIVE','Dark Olive','One size','One size']
 ]);
 assert.equal(new Set(caps.map(v=>v.productId)).size,3);
 assert.equal(new Set(caps.map(v=>v.variantId)).size,3);
 const nativeFetch=globalThis.fetch,gets=[],posts=[];
 const variant=row=>({id:row.variantId,unitPrice:{value:34.99,currency:'USD'},attributes:{color:{name:row.expectedColor},size:{name:'One size'}},stock:{type:'UNLIMITED'}});
 globalThis.fetch=async(url,options)=>{
  const parsed=new URL(url);assert.equal(parsed.origin,'https://storefront-api.fourthwall.com');
  if(options.method==='GET'){
   const row=caps.find(v=>parsed.pathname==='/v1/products/'+v.slug);assert.ok(row,'Only the selected cap listings may be read');gets.push(row.productId);
   return Response.json({id:row.productId,slug:row.slug,type:'PRODUCT',access:{type:'PUBLIC'},state:{type:'AVAILABLE'},variants:[variant(row)]});
  }
  assert.equal(parsed.pathname,'/v1/carts');const body=JSON.parse(options.body);posts.push(body);
  assert.deepEqual(body.items,caps.map(v=>({variantId:v.variantId,quantity:1})));
  return Response.json({id:'fixture-emblem-caps',items:caps.map(row=>({variant:variant(row),quantity:1}))});
 };
 try{
  const r=await merchPreview(req('/goods/api/checkout',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({currency:'USD',items:caps.map(v=>({product:v.product,colour:v.colour,size:v.size,variantId:v.variantId,quantity:1,expectedUnitPrice:34.99}))})}),{...env,GOODS_STOREFRONT_TOKEN:'fixture-token',GOODS_CHECKOUT_ENABLED:'1'});
  assert.equal(r.status,200);assert.equal((await r.json()).checkoutUrl,'https://store.bullenciaga.com/cart/checkout?cartId=fixture-emblem-caps&currency=USD');
  assert.deepEqual(new Set(gets),new Set(caps.map(v=>v.productId)));assert.equal(posts.length,1);
 }finally{globalThis.fetch=nativeFetch;}
});

test('cap checkout rejects a cross-colour variant and changed supplier attributes or price before cart creation',async()=>{
 const [black,camel]=mappings.variants.filter(v=>v.product==='house-emblem-cap' && v.enabled);
 const nativeFetch=globalThis.fetch;let reads=0,writes=0,mode='none';
 globalThis.fetch=async(url,options)=>{
  if(options.method!=='GET'){writes++;throw new Error('Invalid cap must not create a cart');}
  reads++;
  return Response.json({id:black.productId,slug:black.slug,type:'PRODUCT',access:{type:'PUBLIC'},state:{type:'AVAILABLE'},variants:[{id:black.variantId,unitPrice:{value:mode==='price'?37.99:34.99,currency:'USD'},attributes:{color:{name:mode==='colour'?'Camel':'Black'},size:{name:'One size'}},stock:{type:'UNLIMITED'}}]});
 };
 const checkout=variantId=>merchPreview(req('/goods/api/checkout',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({currency:'USD',items:[{product:black.product,colour:black.colour,size:black.size,variantId,quantity:1,expectedUnitPrice:34.99}]})}),{...env,GOODS_STOREFRONT_TOKEN:'fixture-token',GOODS_CHECKOUT_ENABLED:'1'});
 try{
  let r=await checkout(camel.variantId);assert.equal(r.status,400);assert.equal((await r.json()).code,'INVALID');assert.equal(reads,0);
  mode='colour';r=await checkout(black.variantId);assert.equal(r.status,503);assert.equal((await r.json()).code,'UNAVAILABLE');
  mode='price';r=await checkout(black.variantId);assert.equal(r.status,409);assert.equal((await r.json()).code,'PRICE_CHANGED');
  assert.equal(reads,2);assert.equal(writes,0);
 }finally{globalThis.fetch=nativeFetch;}
});
