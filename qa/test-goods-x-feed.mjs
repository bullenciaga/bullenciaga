import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {buildGoodsXFeed,goodsProductUrl,goodsProductMetadata,goodsXFeed} from '../src/goods-x-feed.mjs';
import mappings from '../src/goods-mappings.mjs';import products from '../src/goods-x-products.mjs';import {merchPreview} from '../src/merch-preview.mjs';
const rows=mappings.variants.filter(v=>v.enabled);
const catalogue=()=>({schemaVersion:1,currency:'USD',salesEnabled:true,variants:rows.map(v=>({...v,unitPrice:49.99,currency:'USD',available:true,maxQuantity:20}))});
const env={GOODS_CHECKOUT_ENABLED:'1',GOODS_STOREFRONT_TOKEN:'fixture-only',MERCH_PREVIEW_PROTECTED:'0',MERCH_PREVIEW_PREFIX:'fixture',MERCH_PREVIEW_ASSETS:{get:async()=>({body:'<html></html>'}),head:async()=>({})},MERCH_PREVIEW_LIMIT:{limit:async()=>({success:true})}};
const request=(method='GET')=>new Request('https://bullenciaga.com/goods/x-feed.xml',{method});
function upstream(){let calls=0;return {get calls(){return calls},fetch:async(url,options)=>{calls++;assert.equal(options.method,'GET');assert.equal(new URL(url).origin,'https://storefront-api.fourthwall.com');const selected=rows.filter(v=>new URL(url).pathname.endsWith('/'+v.slug));assert.ok(selected.length);return Response.json({id:selected[0].productId,slug:selected[0].slug,type:'PRODUCT',state:{type:'AVAILABLE'},access:{type:'PUBLIC'},variants:selected.map(v=>({id:v.variantId,unitPrice:{value:v.size==='3XL'?53.99:49.99,currency:'USD'},attributes:{color:{name:v.expectedColor},size:{name:v.expectedSize}},stock:{type:'UNLIMITED'}}))})}}}
test('feed includes every approved variant with exact product/colour/size links and live price',()=>{
 const xml=buildGoodsXFeed(catalogue());assert.equal((xml.match(/<item>/g)||[]).length,rows.length);
 for(const v of rows){assert.ok(xml.includes('<g:id>'+v.variantId+'</g:id>'));assert.ok(xml.includes(goodsProductUrl(v.product,v.colour,v.size).replaceAll('&','&amp;')));}
 assert.equal((xml.match(/<g:price>49.99 USD<\/g:price>/g)||[]).length,rows.length);
 assert.ok(!xml.includes('storefront_token'));assert.ok(!xml.includes('store.bullenciaga.com'));
 for(const p of products)for(const c of p.colours){for(const image of new Set([c.image,...Object.values(c.imagesBySize||{})])){const b=fs.readFileSync(new URL('../site'+image,import.meta.url));assert.ok(b.length<5*1024*1024);assert.match(image,/^\/assets\/goods-x\/[a-z0-9-]+-[a-f0-9]{12}\.jpg$/);}}
});
test('sold out stays sold out; invalid/unknown/duplicate/cross-linked data cannot be advertised',()=>{
 const c=catalogue();c.variants[0].available=false;c.variants[1].maxQuantity=0;assert.equal((buildGoodsXFeed(c).match(/out of stock/g)||[]).length,2);
 for(const mutate of [c=>c.variants=[],c=>c.salesEnabled=false,c=>c.variants.push(c.variants[0]),c=>c.variants[0].variantId='unknown',c=>c.variants[0].size='invented',c=>c.variants[0].unitPrice=NaN,c=>c.variants[0].currency='EUR']){const x=catalogue();mutate(x);assert.throws(()=>buildGoodsXFeed(x));}
});
test('product metadata keeps ordinary Goods unchanged and escapes query values',()=>{
 const html='<title>Goods</title><link rel="canonical" href="https://bullenciaga.com/goods/"><meta property="og:title" content="Goods"><meta property="og:image" content="old"><meta property="og:image:height" content="630">';
 assert.equal(goodsProductMetadata(html,new URL('https://bullenciaga.com/goods/')),html);
 const v=rows[0],result=goodsProductMetadata(html,new URL(goodsProductUrl(v.product,v.colour,v.size)));
 assert.ok(result.includes('Make It Look Easy'));assert.ok(result.includes('goods-x'));assert.ok(result.includes('height" content="1200'));assert.ok(result.includes('&amp;colour='));
 assert.equal(goodsProductMetadata(html,new URL('https://bullenciaga.com/goods/?product=%3Cscript%3E')),html);
});
test('read-only upstream refresh, bounded cache, GET/HEAD, provider failure and disabled checkout',async()=>{
 const u=upstream(),store=new Map(),cache={match:async k=>store.get(k.url)?.clone(),put:async(k,v)=>store.set(k.url,v)};
 const r=await goodsXFeed(request(),env,null,{fetchImpl:u.fetch,cache});assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/application\/xml/);assert.match(r.headers.get('cache-control'),/max-age=900/);assert.ok((await r.text()).includes('53.99 USD'));const calls=u.calls;assert.ok(calls>0);
 const head=await goodsXFeed(request('HEAD'),env,null,{fetchImpl:u.fetch,cache});assert.equal(head.status,200);assert.equal(await head.text(),'');assert.equal(u.calls,calls);
 const fail=await goodsXFeed(request(),env,null,{fetchImpl:async()=>{throw Error('fixture-only')},cache:null});assert.equal(fail.status,503);assert.ok(!(await fail.text()).includes('fixture-only'));assert.equal(fail.headers.get('cache-control'),'no-store');
 assert.equal((await goodsXFeed(request('POST'),env,null,{fetchImpl:u.fetch,cache})).status,405);
 assert.equal((await goodsXFeed(request(),{...env,GOODS_CHECKOUT_ENABLED:'0'},null,{fetchImpl:u.fetch,cache})).status,503);assert.equal(u.calls,calls);
});
test('private and scheduled-before-launch shop never expose the feed',async()=>{
 for(const mode of ['1','scheduled']){
  const privateEnv={...env,MERCH_PREVIEW_PROTECTED:mode,MERCH_PREVIEW_PASSWORD_SHA256:'a'.repeat(64),MERCH_PREVIEW_SESSION_SECRET:'b'.repeat(40),GOODS_LAUNCH_AT:'2099-01-01T00:00:00Z'};
  assert.equal((await merchPreview(request(),privateEnv)).status,404);
 }
});
