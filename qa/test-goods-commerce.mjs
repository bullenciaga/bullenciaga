import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {merchPreview} from '../src/merch-preview.mjs';
import mappings from '../src/goods-mappings.mjs';
const origin='https://bullenciaga.com',password='fixture-password';
let calls=[];
const env={MERCH_PREVIEW_PASSWORD_SHA256:createHash('sha256').update(password).digest('hex'),MERCH_PREVIEW_SESSION_SECRET:'fixture-secret-at-least-thirty-two-characters',MERCH_PREVIEW_PREFIX:'fixture',MERCH_PREVIEW_ASSETS:{get:async()=>({body:'export const example=1;'}),head:async()=>({})},MERCH_PREVIEW_LIMIT:{limit:async({key})=>{calls.push(key);return {success:true};}}};
const req=(path,opts={})=>new Request(origin+path,opts);
async function login(){const r=await merchPreview(req('/goods/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password})}),env);assert.equal(r.status,303);assert.match(r.headers.get('Set-Cookie'),/Path=\/goods;/);return r.headers.get('Set-Cookie').split(';')[0];}
test('unauthenticated catalogue cannot expose private data or hit rate limiter/upstream',async()=>{calls=[];const r=await merchPreview(req('/goods/api/catalog'),env);assert.equal(r.status,401);assert.match(r.headers.get('Content-Security-Policy'),/connect-src 'self'/);assert.match(r.headers.get('Vary'),/Cookie/);assert.equal(calls.length,0);});
test('normal /goods cookie authorizes catalogue, remains private/no-store, default no sales',async()=>{const cookie=await login();const r=await merchPreview(req('/goods/api/catalog',{headers:{Cookie:cookie}}),env);assert.equal(r.status,200);const data=await r.json();assert.deepEqual(data.variants,[]);assert.equal(data.salesEnabled,false);assert.match(r.headers.get('Cache-Control'),/private, no-store/);assert.match(r.headers.get('X-Robots-Tag'),/noindex/);assert.match(calls.at(-1),/^[a-f0-9]{64}$/);});
test('provisioning token or runtime flag alone cannot activate checkout',async()=>{const cookie=await login();for(const overrides of [{GOODS_STOREFRONT_TOKEN:'fixture-token'},{GOODS_CHECKOUT_ENABLED:'1'}]){const r=await merchPreview(req('/goods/api/checkout',{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({currency:'USD',items:[]})}),{...env,...overrides});assert.equal(r.status,409);assert.equal((await r.json()).code,'NOT_OPEN');}});
test('invalid session, cross-origin checkout and unknown commerce route remain denied',async()=>{let r=await merchPreview(req('/goods/api/catalog',{headers:{Cookie:'__Secure-bullen_merch=bad'}}),env);assert.equal(r.status,401);const cookie=await login();r=await merchPreview(req('/goods/api/checkout',{method:'POST',headers:{Cookie:cookie,Origin:'https://other.example','Content-Type':'application/json'},body:'{}'}),env);assert.equal(r.status,403);r=await merchPreview(req('/goods/api/orders',{headers:{Cookie:cookie}}),env);assert.equal(r.status,404);});
test('module asset extension served only after authentication with JavaScript MIME',async()=>{const cookie=await login();let r=await merchPreview(req('/goods/goods-commerce.mjs'),env);assert.equal(r.status,401);r=await merchPreview(req('/goods/goods-commerce.mjs',{headers:{Cookie:cookie}}),env);assert.equal(r.status,200);assert.match(r.headers.get('Content-Type'),/^text\/javascript/);});

test('authenticated handler creates an exact provider cart and returns the approved hosted checkout URL',async()=>{
  const eligible=mappings.variants.filter(v=>v.enabled);assert.ok(eligible.length>0);
  const chosen=eligible[0], observed=[];const nativeFetch=globalThis.fetch;
  const variant=m=>({id:m.variantId,unitPrice:{value:89.99,currency:'USD'},attributes:{color:{name:m.expectedColor},size:{name:m.expectedSize}},stock:{type:'UNLIMITED'}});
  globalThis.fetch=async(url,options)=>{
    const parsed=new URL(url);assert.equal(parsed.origin,'https://storefront-api.fourthwall.com');assert.equal(parsed.searchParams.get('storefront_token'),'fixture-token');assert.equal(options.redirect,'error');assert.equal(options.headers['User-Agent'],'BULLENCIAGA Goods/1.0');
    observed.push({path:parsed.pathname,method:options.method});
    if(options.method==='GET'){
      const slug=parsed.pathname.split('/').at(-1), rows=eligible.filter(m=>m.slug===slug);assert.ok(rows.length);
      return Response.json({id:rows[0].productId,slug,type:'PRODUCT',access:{type:'HIDDEN'},state:{type:'AVAILABLE'},variants:rows.map(variant)});
    }
    assert.equal(parsed.pathname,'/v1/carts');const body=JSON.parse(options.body);assert.deepEqual(body.items,[{variantId:chosen.variantId,quantity:1}]);
    return Response.json({id:'fixture-cart',items:[{variant:variant(chosen),quantity:1}]});
  };
  try{
    const cookie=await login(), activeEnv={...env,GOODS_STOREFRONT_TOKEN:'fixture-token',GOODS_CHECKOUT_ENABLED:'1'};
    const catalogue=await merchPreview(req('/goods/api/catalog',{headers:{Cookie:cookie}}),activeEnv);assert.equal(catalogue.status,200);const data=await catalogue.json();assert.equal(data.salesEnabled,true);assert.equal(data.variants.length,eligible.length);assert.ok(data.variants.every(v=>v.available));
    const r=await merchPreview(req('/goods/api/checkout',{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json','Sec-Fetch-Site':'same-origin'},body:JSON.stringify({currency:'USD',items:[{product:chosen.product,colour:chosen.colour,size:chosen.size,variantId:chosen.variantId,quantity:1,expectedUnitPrice:89.99}]})}),activeEnv);
    assert.equal(r.status,200);assert.deepEqual(await r.json(),{checkoutUrl:'https://bullenciaga-shop.fourthwall.com/cart/checkout?cartId=fixture-cart&currency=USD',checkoutHost:'bullenciaga-shop.fourthwall.com'});assert.equal(observed.filter(v=>v.method==='POST').length,1);assert.match(r.headers.get('Cache-Control'),/private, no-store/);
  }finally{globalThis.fetch=nativeFetch;}
});

test('supplier-unavailable Signature Black sizes remain unmapped despite provider UNLIMITED offers',async()=>{
 const rows=mappings.variants.filter(v=>v.product==='signature-tee' && v.colour==='T01B' && v.enabled);
 assert.deepEqual(rows.map(v=>v.size),['3XL']);
 const cookie=await login(), nativeFetch=globalThis.fetch;let upstreamCalls=0;
 globalThis.fetch=async()=>{upstreamCalls++;throw new Error('Unmapped sizes must be rejected locally');};
 try{
  const r=await merchPreview(req('/goods/api/checkout',{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({currency:'USD',items:[{product:'signature-tee',colour:'T01B',size:'S',variantId:'640a54a7-01eb-4793-948c-3a3ff22bad02',quantity:1,expectedUnitPrice:44.99}]})}),{...env,GOODS_STOREFRONT_TOKEN:'fixture-token',GOODS_CHECKOUT_ENABLED:'1'});
  assert.equal(r.status,400);assert.equal(upstreamCalls,0);
 }finally{globalThis.fetch=nativeFetch;}
});
