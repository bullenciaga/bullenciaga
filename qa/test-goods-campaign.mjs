import assert from 'node:assert/strict';
import {merchPreview} from '../src/merch-preview.mjs';
const fixture='<html><head><link rel="canonical" href="https://bullenciaga.com/goods/"><meta property="og:url" content="https://bullenciaga.com/goods/"><meta property="og:image" content="https://bullenciaga.com/assets/social/goods-mile-v2.jpg"></head><body>Goods content</body></html>';
let reads=0;
const env={MERCH_PREVIEW_PROTECTED:'0',MERCH_PREVIEW_PREFIX:'fixture',MERCH_PREVIEW_ASSETS:{get:async key=>{reads++;assert.equal(key,'fixture/index.html');return {body:fixture};},head:async()=>({})},MERCH_PREVIEW_LIMIT:{limit:async()=>({success:true})}};
for(const userAgent of ['Mozilla/5.0','Twitterbot/1.0']){
 const response=await merchPreview(new Request('https://bullenciaga.com/goods/make-it-look-easy?from=share',{headers:{'user-agent':userAgent}}),env);
 assert.equal(response.status,200);assert.equal(response.headers.get('Location'),null);
 const html=await response.text();assert.match(html,/<meta property="og:url" content="https:\/\/bullenciaga.com\/goods\/make-it-look-easy">/);
 assert.match(html,/<link rel="canonical" href="https:\/\/bullenciaga.com\/goods\/">/);
 assert.ok(html.includes('Goods content'));assert.ok(!html.includes('from=share'));
}
const normal=await merchPreview(new Request('https://bullenciaga.com/goods/'),env);
assert.equal(await normal.text(),fixture);
const before=reads;
const unknown=await merchPreview(new Request('https://bullenciaga.com/goods/unknown-campaign'),env);assert.equal(unknown.status,404);assert.equal(reads,before);
const post=await merchPreview(new Request('https://bullenciaga.com/goods/make-it-look-easy',{method:'POST'}),env);assert.equal(post.status,405);
const head=await merchPreview(new Request('https://bullenciaga.com/goods/make-it-look-easy',{method:'HEAD'}),env);assert.equal(head.status,200);assert.equal(await head.text(),'');
const privateEnv={...env,MERCH_PREVIEW_PROTECTED:'1',MERCH_PREVIEW_PASSWORD_SHA256:'a'.repeat(64),MERCH_PREVIEW_SESSION_SECRET:'b'.repeat(40)};
const privatePage=await merchPreview(new Request('https://bullenciaga.com/goods/make-it-look-easy'),privateEnv);assert.equal(privatePage.status,200);const gate=await privatePage.text();assert.ok(gate.includes('Password'));assert.ok(!gate.includes('Goods content'));assert.match(privatePage.headers.get('X-Robots-Tag'),/noindex/);
console.log('Goods campaign: unique share metadata, canonical destination, methods and private gate verified.');
