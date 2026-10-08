import test from 'node:test';
import assert from 'node:assert/strict';
import {createGoodsHandler,normalizeVariant,validateMappings} from '../src/goods-fourthwall.mjs';
const mapping={product:'bb-hoodie',colour:'H01',size:'M',slug:'fixture-hoodie',productId:'fixture-product',variantId:'00000000-0000-0000-0000-000000000001',enabled:true,expectedColor:'Black',expectedSize:'M'};
const product=()=>({id:'fixture-product',slug:'fixture-hoodie',type:'PRODUCT',state:{type:'AVAILABLE'},access:{type:'HIDDEN'},variants:[{id:mapping.variantId,unitPrice:{value:99.99,currency:'USD'},attributes:{color:{name:'Black'},size:{name:'M'}},stock:{type:'UNLIMITED'}}]});
const config=()=>({schemaVersion:1,currency:'USD',salesEnabled:true,checkoutOrigin:'https://fixture-shop.fourthwall.com',variants:[{...mapping}]});
const storage=(initial={})=>{const values=new Map(Object.entries(initial));return {getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),values};};
function harness({p=product(),c=config(),auth=true,limited=false}={}){
 let calls=[],cartMutator=x=>x;
 const handler=createGoodsHandler({config:c,storefrontToken:'test-fixture-token',authorize:async()=>auth,rateLimit:async()=>!limited,fetchImpl:async(url,options)=>{
  const u=new URL(url);calls.push({path:u.pathname,options});assert.equal(u.origin,'https://storefront-api.fourthwall.com');assert.equal(u.searchParams.get('currency'),'USD');assert.ok(u.searchParams.get('storefront_token'));
  if(options.method==='GET')return Response.json(p);
  return Response.json(cartMutator({id:'fixture-cart',items:JSON.parse(options.body).items.map(x=>({quantity:x.quantity,variant:{...p.variants.find(v=>v.id===x.variantId)}}))}));
 }});
 const browserFetch=(url,options={})=>handler(new Request('https://bullenciaga.com'+url,{...options,headers:{...options.headers,origin:'https://bullenciaga.com','sec-fetch-site':'same-origin'}}));
 const makeRequest=body=>new Request('https://bullenciaga.com/goods/api/checkout',{method:'POST',headers:{'Content-Type':'application/json',origin:'https://bullenciaga.com'},body:JSON.stringify(body)});
 return {handler,browserFetch,p,c,calls,makeRequest,setCartMutator:x=>cartMutator=x};
}
const body=()=>({currency:'USD',items:[{product:mapping.product,colour:mapping.colour,size:mapping.size,variantId:mapping.variantId,quantity:1,expectedUnitPrice:99.99}]});


test('sold-out, private, archived, unknown stock and unmapped sizes fail closed',()=>{for(const patch of [{state:{type:'SOLD_OUT'}},{access:{type:'PRIVATE'}},{access:{type:'ARCHIVED'}}])assert.equal(normalizeVariant(mapping,{...product(),...patch},'USD').available,false);const p=product();p.variants[0].stock={type:'FUTURE_TYPE'};assert.equal(normalizeVariant(mapping,p,'USD').available,false);assert.throws(()=>normalizeVariant({...mapping,variantId:'different'},p,'USD'));});
test('server revalidates all client fields before any cart create',async()=>{for(const edit of [b=>b.items[0].quantity=0,b=>b.items[0].quantity=1.5,b=>b.items[0].quantity=21,b=>b.items[0].variantId='arbitrary',b=>b.items[0].size='XL',b=>b.items.push({...b.items[0]}),b=>b.currency='EUR',b=>b.items[0].expectedUnitPrice=1]){const h=harness(),b=body();edit(b);const res=await h.handler(h.makeRequest(b));assert.ok(res.status>=400);assert.equal(h.calls.filter(x=>x.options.method==='POST').length,0);}});
test('gate, cross-site origin, content type, route, rate limit are narrow',async()=>{const noauth=harness({auth:false});assert.equal((await noauth.handler(new Request('https://bullenciaga.com/goods/api/catalog'))).status,401);const limited=harness({limited:true});assert.equal((await limited.handler(new Request('https://bullenciaga.com/goods/api/catalog'))).status,429);const h=harness();assert.equal(await h.handler(new Request('https://bullenciaga.com/goods/api/orders')),null);let req=h.makeRequest(body());req.headers.set('origin','https://attacker.example');assert.equal((await h.handler(req)).status,403);req=h.makeRequest(body());req.headers.set('content-type','text/plain');assert.equal((await h.handler(req)).status,415);assert.equal(h.calls.length,0);});
test('upstream altered prices, quantities and extra rows cannot redirect',async()=>{for(const change of [c=>{c.items[0].variant.unitPrice={value:120,currency:'USD'};return c},c=>{c.items[0].quantity=2;return c},c=>{c.items.push(c.items[0]);return c}]){const h=harness();h.setCartMutator(change);const r=await h.handler(h.makeRequest(body()));assert.ok(r.status>=400);assert.ok(!('checkoutUrl' in await r.json()));}});
test('duplicate mapping, wrong product/colour/size and mixed currencies reject',()=>{assert.throws(()=>validateMappings({...config(),variants:[mapping,mapping]}));for(const change of [p=>p.id='wrong',p=>p.variants[0].attributes.size.name='L',p=>p.variants[0].attributes.color.name='White',p=>p.variants[0].unitPrice.currency='EUR']){const p=product();change(p);assert.throws(()=>normalizeVariant(mapping,p,'USD'));}});
test('upstream errors never leak token or response text',async()=>{const h=createGoodsHandler({config:config(),storefrontToken:'do-not-expose',authorize:async()=>true,rateLimit:async()=>true,fetchImpl:async()=>Response.json({secret:'do-not-expose'},{status:500})});const result=await h(new Request('https://bullenciaga.com/goods/api/catalog'));assert.equal(result.status,503);assert.ok(!(await result.text()).includes('do-not-expose'));});
test('disabled private draft mappings make no shopper upstream requests',async()=>{const c=config();c.variants[0].enabled=false;c.salesEnabled=false;const h=harness({c});const r=await h.handler(new Request('https://bullenciaga.com/goods/api/catalog'));assert.equal(r.status,200);assert.deepEqual((await r.json()).variants,[]);assert.equal(h.calls.length,0);});

test('one withdrawn product does not hide the remaining catalogue and cannot create a mixed cart',async()=>{
 const missing={...mapping,product:'withdrawn',slug:'withdrawn',productId:'withdrawn',variantId:'00000000-0000-0000-0000-000000000002'};
 const c=config();c.variants.push(missing);let cartPosts=0;
 const handler=createGoodsHandler({config:c,storefrontToken:'fixture-token',authorize:async()=>true,rateLimit:async()=>true,fetchImpl:async(url,options)=>{
  if(options.method==='POST'){cartPosts++;throw Error('No cart may be created');}
  return new URL(url).pathname.endsWith('/withdrawn')?new Response('Not found',{status:404}):Response.json(product());
 }});
 const res=await handler(new Request('https://bullenciaga.com/goods/api/catalog'));
 assert.equal(res.status,200);assert.deepEqual((await res.json()).variants.map(v=>v.product),['bb-hoodie']);
 const mixed=body();mixed.items.push({...mixed.items[0],product:missing.product,variantId:missing.variantId});
 const denied=await handler(new Request('https://bullenciaga.com/goods/api/checkout',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://bullenciaga.com'},body:JSON.stringify(mixed)}));
 assert.equal(denied.status,409);assert.equal(cartPosts,0);
});

test('checkout cancels an oversized chunked body at20KB and rejects malformed byte lengths or UTF8',async()=>{
 const h=harness();let produced=0,cancelled=false;
 const stream=new ReadableStream({pull(controller){produced++;controller.enqueue(new Uint8Array(8192));if(produced===256)controller.close();},cancel(){cancelled=true;}});
 const request=new Request('https://bullenciaga.com/goods/api/checkout',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://bullenciaga.com'},duplex:'half',body:stream});
 const response=await h.handler(request);assert.equal(response.status,413);assert.equal(cancelled,true);assert.ok(produced<=4,`Consumed${produced*8192}bytes instead of stopping`);assert.equal(h.calls.length,0);
 for(const length of ['-1','NaN','1.5','9007199254740993']){const req=h.makeRequest(body());req.headers.set('Content-Length',length);assert.equal((await h.handler(req)).status,400);}
 const declared=h.makeRequest(body());declared.headers.set('Content-Length','20001');assert.equal((await h.handler(declared)).status,413);
 const invalid=new Request('https://bullenciaga.com/goods/api/checkout',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://bullenciaga.com'},body:new Uint8Array([0xc3,0x28])});assert.equal((await h.handler(invalid)).status,400);assert.equal(h.calls.length,0);
});

test('public Goods route supplies one canonical privacy header for commerce responses',async()=>{
 const {merchPreview}=await import('../src/merch-preview.mjs');
 const env={MERCH_PREVIEW_PREFIX:'fixture',MERCH_PREVIEW_ASSETS:{get:async()=>null,head:async()=>null},MERCH_PREVIEW_LIMIT:{limit:async()=>({success:true})}};
 const r=await merchPreview(new Request('https://bullenciaga.com/goods/api/catalog'),env);
 assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'private, no-store, max-age=0');assert.equal(r.headers.get('X-Content-Type-Options'),'nosniff');assert.equal(r.headers.get('Content-Type'),'application/json; charset=utf-8');
});

test('provider redirects are handled manually and never followed with the credential',async()=>{
 for(const status of [302,307]){let calls=0;const handler=createGoodsHandler({config:config(),storefrontToken:'never-forward-fixture',authorize:async()=>true,rateLimit:async()=>true,fetchImpl:async(url,options)=>{calls++;assert.equal(new URL(url).origin,'https://storefront-api.fourthwall.com');assert.equal(options.redirect,'manual');return new Response(null,{status,headers:{Location:'https://other.invalid/redirect-target'}});}});
 const r=await handler(new Request('https://bullenciaga.com/goods/api/catalog'));assert.equal(r.status,503);assert.equal(calls,1);const text=await r.text();assert.ok(!text.includes('never-forward-fixture'));assert.ok(!text.includes('other.invalid'));}
});

// Release routing contract: IDs below come from approved supplier readbacks.
const releaseMappings=(await import('../src/goods-mappings.mjs')).default;
test('approved catalogue has one route per selection and no variant shared across selections',()=>{
 assert.doesNotThrow(()=>validateMappings(releaseMappings));
 const rows=releaseMappings.variants;
 assert.equal(rows.length,142);assert.equal(new Set(rows.map(x=>x.product)).size,27);
 assert.equal(new Set(rows.map(x=>[x.product,x.colour,x.size].join('|'))).size,rows.length);
 assert.equal(new Set(rows.map(x=>x.variantId)).size,rows.length);
 const retired=new Set(['53ffe548-2e95-482d-909c-f3e592b17aed','6fc7156c-8666-46de-b939-48b228717f75']);
 assert.ok(rows.every(x=>x.enabled&&!retired.has(x.productId)));
 assert.ok(rows.every(x=>!x.product.includes('all-over')),'Abandoned AOP tees must not regain checkout routes');
});

test('lore hoodie routing covers only three approved character artworks and actual S–3XL sizes',()=>{
 const approved={
  'lily-aurelia-hoodie':'eae1cbf5-f2c1-4702-be8d-1feba822b2c6',
  'sakura-selene-hoodie':'9550c4d4-ef44-48de-a7eb-d2d8cbb57f23',
  'celestial-atelier-hoodie':'9d7800c0-e830-4486-98cd-cc525145eb99'
 };
 const lore=releaseMappings.variants.filter(x=>/^(lily-aurelia|sakura-selene|celestial-atelier|villa-perpetua|nocturne-atlas)-hoodie$/.test(x.product));
 assert.deepEqual([...new Set(lore.map(x=>x.product))].sort(),Object.keys(approved).sort());
 for(const [family,id] of Object.entries(approved)){
  const rows=lore.filter(x=>x.product===family);
  assert.equal(rows.length,6);assert.deepEqual(rows.map(x=>x.size).sort(),['S','M','L','XL','2XL','3XL'].sort());
  assert.ok(rows.every(x=>x.productId===id&&x.expectedColor==='Black'&&x.expectedSize===x.size));
 }
});

test('embroidered colours resolve to the approved pocketed blanks, including Cream and Arona',()=>{
 const rows=releaseMappings.variants.filter(x=>x.product==='embroidered-house-hoodie');
 const colours={E01:{name:'Black',productId:'e332b6d2-33db-47d8-818c-4edff0c6f60c'},E01A:{name:'Arona',productId:'e332b6d2-33db-47d8-818c-4edff0c6f60c'},E01S:{name:'Cream',productId:'fdecb177-6b5a-4bc5-bdab-42eee0b6b154'}};
 assert.deepEqual([...new Set(rows.map(x=>x.colour))].sort(),Object.keys(colours).sort());
 for(const [colour,expected] of Object.entries(colours)){
  const selected=rows.filter(x=>x.colour===colour);assert.equal(selected.length,7);
  assert.deepEqual(selected.map(x=>x.size).sort(),['XS','S','M','L','XL','2XL','3XL'].sort());
  assert.ok(selected.every(x=>x.productId===expected.productId&&x.expectedColor===expected.name&&x.expectedSize===x.size));
 }
 // Independent supplier XS records catch a Cream/Arona cross-wire even if labels change together.
 for(const [colour,variantId] of [['E01S','e3e4babc-555c-4922-ac18-618c0eea0c5d'],['E01A','cb0bb89c-7e7c-49c7-a407-388742b91476']]){
  const route=rows.find(x=>x.colour===colour&&x.size==='XS');assert.equal(route.variantId,variantId);
  const record={...product(),id:colours[colour].productId,slug:route.slug,variants:[{id:variantId,unitPrice:{value:124.99,currency:'USD'},attributes:{color:{name:colours[colour].name},size:{name:'XS'}},stock:{type:'UNLIMITED'}}]};
  assert.equal(normalizeVariant(route,record,'USD').available,true);
  record.variants[0].attributes.color.name=colour==='E01S'?'Arona':'Cream';
  assert.throws(()=>normalizeVariant(route,record,'USD'),'A swapped supplier colour must fail closed');
 }
});
