import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {merchPreview} from '../src/merch-preview.mjs';
import website from '../src/website.mjs';

const origin='https://bullenciaga.com',prefix='unit-test-immutable-preview';
let reads=[];
const objects=new Map([
 [`${prefix}/index.html`,'<!doctype html><title>Goods fixture</title>'],
 [`${prefix}/storefront-v17.js`,'/* storefront fixture */'],
 [`${prefix}/storefront-v16.css`,'body{}'],
 [`${prefix}/goods-commerce-v14.mjs`,'export const fixture=true;'],
 [`${prefix}/goods-benefits-ui-v4.mjs`,'export const fixture=true;'],
 [`${prefix}/assets/goods-icons-v1/goods-bag.svg`,'<svg/>'],
 [`${prefix}/assets/goods-icons-v1/goods-bag-32.png`,'image fixture'],
 [`${prefix}/assets/fonts/Poppins-SemiBold-latin.woff2`,'font fixture'],
 [`${prefix}/images/hoodie.webp`,'image fixture'],
 // These really exist in the same bucket prefix but must not be served.
 [`${prefix}/assets/lore-v1/manifest.json`,'private manifest'],
 [`${prefix}/index-before-v17.html`,'private rollback'],
 [`${prefix}/review.html`,'private review'],
 [`${prefix}/report.json`,'private report'],
]);
const env={
 MERCH_PREVIEW_PREFIX:prefix,
 MERCH_PREVIEW_LIMIT:{async limit(){return{success:true}}},
 MERCH_PREVIEW_ASSETS:{
  async get(key){reads.push(['get',key]);return objects.has(key)?{body:objects.get(key)}:null},
  async head(key){reads.push(['head',key]);return objects.has(key)?{}:null},
 },
 ASSETS:{fetch(){throw Error('Goods route fell through to public assets')}},
};
const request=(path,options={})=>new Request(origin+path,options);
function securityHeaders(response){
 assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
 assert.equal(response.headers.get('Referrer-Policy'),'same-origin');
 assert.match(response.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);
 assert.match(response.headers.get('Content-Security-Policy'),/connect-src 'self'/);
 assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);
 assert.equal(response.headers.get('ETag'),null);
}
// The actual catalogue and public visual/module allowlist work without cookies
// or either obsolete preview secret; R2 remains the only content source.
for(const [path,type] of [
 ['/goods/','text/html'],['/goods/index.html','text/html'],
 ['/goods/storefront-v17.js','text/javascript'],['/goods/storefront-v16.css','text/css'],
 ['/goods/goods-commerce-v14.mjs','text/javascript'],['/goods/goods-benefits-ui-v4.mjs','text/javascript'],
 ['/goods/assets/goods-icons-v1/goods-bag.svg','image/svg+xml'],
 ['/goods/assets/goods-icons-v1/goods-bag-32.png','image/png'],
 ['/goods/assets/fonts/Poppins-SemiBold-latin.woff2','font/woff2'],['/goods/images/hoodie.webp','image/webp'],
])for(const method of ['GET','HEAD']){
 const response=await website.fetch(request(path,{method}),env);
 assert.equal(response.status,200,path);securityHeaders(response);
 assert.equal(response.headers.get('Content-Type').split(';')[0],type);
 assert.equal(response.headers.get('Cache-Control'),'no-store, max-age=0');
 assert.equal(response.headers.get('Vary'),null);assert.equal(response.headers.get('X-Robots-Tag'),null);
 assert.equal(response.headers.get('Set-Cookie'),null);
 if(method==='HEAD')assert.equal(await response.text(),'');
 else assert.doesNotMatch(await response.text(),/A first look|Enter your password/);
}
for(const cookie of ['__Secure-bullen_merch=expired','__Secure-bullen_merch=forged; __Secure-bullen_merch=duplicate']){
 assert.equal((await merchPreview(request('/goods/',{headers:{Cookie:cookie}}),env)).status,200);
}
for(const path of ['/goods','/goods?view=art']){
 const response=await merchPreview(request(path),env);
 assert.equal(response.status,308);assert.equal(response.headers.get('Location'),path.replace('/goods','/goods/'));
}
// Legacy paths stay local and preserve suffix/query; no open redirect.
for(const suffix of ['', '/', '/storefront-v17.js?next=https://evil.example', '//evil.example/path?x=1','/login','/logout'])for(const method of ['GET','HEAD']){
 const response=await website.fetch(request('/merch'+suffix,{method}),env);
 assert.equal(response.status,308);assert.equal(response.headers.get('Location'),'/goods'+suffix);
 assert.equal(await response.text(),'');assert.equal(response.headers.get('Set-Cookie'),null);
}
assert.equal((await merchPreview(request('/merch/api/checkout',{method:'POST'}),env)).status,404);
// Malformed/unapproved names are rejected before any bucket read.
const count=reads.length;
for(const path of [
 '/goods/images//hoodie.webp','/goods/%252e%252e/site.js','/goods/images%2fhoodie.webp','/goods/%5cindex.html',
 '/goods/.env','/goods/.git/config','/goods/README.md','/goods/index.html%00','/goods/images/',
 '/goods/assets/lore-v1/manifest.json','/goods/index-before-v17.html','/goods/review.html','/goods/report.json',
 '/goods/assets/review.html','/goods/assets/arbitrary.js','/goods/arbitrary.mjs','/goods/hoodie.png',
])assert.equal((await merchPreview(request(path),env)).status,404,path);
assert.equal(reads.length,count);
assert.equal((await merchPreview(request('/goods/images/missing.png'),env)).status,404);
for(const method of ['POST','PUT','DELETE','OPTIONS','PATCH'])assert.equal((await merchPreview(request('/goods/images/hoodie.webp',{method}),env)).status,405);
// Prefix/storage/rate configuration is still mandatory; never fall through.
for(const field of ['MERCH_PREVIEW_PREFIX','MERCH_PREVIEW_ASSETS','MERCH_PREVIEW_LIMIT']){
 assert.equal((await website.fetch(request('/goods/'),{...env,[field]:undefined})).status,503,field);
}
for(const prefix of ['../public','nested/prefix',''])assert.equal((await merchPreview(request('/goods/'),{...env,MERCH_PREVIEW_PREFIX:prefix})).status,503);
assert.equal((await merchPreview(new Request('http://bullenciaga.com/goods/'),env)).status,503);
const failure=await merchPreview(request('/goods/'),{...env,MERCH_PREVIEW_ASSETS:{head(){},get(){throw Error('secret fixture')}}});
assert.equal(failure.status,503);assert.doesNotMatch(await failure.text(),/secret fixture/);
// Cached login/logout forms only retire the obsolete page cookie. They never
// issue a new session, consume a password, or alter the separate wallet cookie.
for(const path of ['/goods/login','/goods/logout','/merch/login','/merch/logout']){
 for(const method of ['PUT','DELETE','OPTIONS']){
  const r=await merchPreview(request(path,{method}),env);assert.equal(r.status,405);assert.equal(r.headers.get('Allow'),'GET, HEAD, POST');
 }
 for(const header of [undefined,'null','https://evil.example','https://www.bullenciaga.com']){
  assert.equal((await merchPreview(request(path,{method:'POST',headers:header?{Origin:header}:{}}),env)).status,403);
 }
 assert.equal((await merchPreview(request(path,{method:'POST',headers:{Origin:origin,'Sec-Fetch-Site':'cross-site'}}),env)).status,403);
 const r=await merchPreview(request(path,{method:'POST',headers:{Origin:origin,Cookie:'__Secure-goods_wallet=fixture'},body:'password=obsolete'}),env);
 assert.equal(r.status,303);assert.equal(r.headers.get('Location'),'/goods/');
 assert.equal(r.headers.get('Set-Cookie'),'__Secure-bullen_merch=; Path=/goods; Max-Age=0; Secure; HttpOnly; SameSite=Strict');
 assert.doesNotMatch(r.headers.get('Set-Cookie'),/goods_wallet/);
}
for(const method of ['GET','HEAD'])assert.equal((await merchPreview(request('/goods/login',{method}),env)).status,303);
// This route cannot change unrelated public services or storage visibility.
for(const path of ['/','/unchanged','/goods-news','/merchandise','/goodsish/index.html']){
 assert.equal(await merchPreview(request(path),env),null);
 const response=await website.fetch(request(path),{ASSETS:{fetch(){return new Response('ordinary public page')}}});
 assert.equal(response.status,200);assert.equal(await response.text(),'ordinary public page');
 assert.equal(response.headers.get('Strict-Transport-Security'),'max-age=31536000');
}
for(const name of ['production','staging']){
 const config=JSON.parse(readFileSync(new URL(`../wrangler.${name}.jsonc`,import.meta.url),'utf8'));
 assert.equal(config.assets.run_worker_first,true);
 assert(config.r2_buckets.some(b=>b.binding==='MERCH_PREVIEW_ASSETS'&&b.bucket_name===`bullenciaga-merch-preview${name==='staging'?'-staging':''}`));
 assert(config.ratelimits.some(b=>b.name==='MERCH_PREVIEW_LIMIT'&&b.simple.limit===10));
 assert.match(config.vars.MERCH_PREVIEW_PREFIX,/^collection01-v2-20261005$/);
 assert(!('MERCH_PREVIEW_PASSWORD_SHA256'in config.vars));assert(!('MERCH_PREVIEW_SESSION_SECRET'in config.vars));
}
assert.match(readFileSync(new URL('./release-fingerprint.mjs',import.meta.url),'utf8'),/'src\/merch-preview\.mjs'/);
console.log('Public Goods: anonymous catalogue/assets, safe legacy redirects, private-bucket allowlist, retired preview forms, traversal defenses and route isolation passed.');
