import assert from 'node:assert/strict';
import {rareFourPreviewRead} from '../src/rare-four-preview.mjs';
const calls=[],env={RARE_FOUR_API:{fetch:async request=>{calls.push(request);return new Response('{"phase":"not-started"}',{headers:{'Content-Type':'application/json'}});}}};
const stage='https://bullenciaga-staging.bullenciaga-e5c.workers.dev',prod='https://bullenciaga.com';
for(const [host,target] of [[stage,'bullenciaga-rare-four-staging'],[prod,'bullenciaga-rare-four'],['https://www.bullenciaga.com','bullenciaga-rare-four']])for(const p of ['/status','/rules','/entries?wallet=public','/snapshot','/results']){
 const r=await rareFourPreviewRead(new Request(host+'/rare-four-api'+p,{headers:{Authorization:'Bearer never-forward-me',Cookie:'never-forward-me'}}),env);assert.equal(r.status,200);assert.equal(calls.at(-1).url,'https://'+target+'.bullenciaga-e5c.workers.dev'+p);assert.deepEqual([...calls.at(-1).headers],[['accept','application/json']]);
}
assert.equal(rareFourPreviewRead(new Request('https://attacker.test/rare-four-api/status'),env),null);
assert.equal(rareFourPreviewRead(new Request(stage+'/goods'),env),null);
assert.equal((await rareFourPreviewRead(new Request(stage+'/rare-four-api/start',{method:'POST'}),env)).status,404);
assert.equal((await rareFourPreviewRead(new Request(prod+'/rare-four-api/unknown'),env)).status,404);
assert.equal((await rareFourPreviewRead(new Request(prod+'/rare-four-api/status',{method:'POST'}),env)).status,404);
assert.equal(rareFourPreviewRead(new Request(prod+'/rare-four-api/status'),{}).status,503);
assert.equal(calls.length,15);
await rareFourPreviewRead(new Request(prod+'/rare-four-api/start',{method:'POST',headers:{Authorization:'Bearer private-operator',Cookie:'never-forward-me',Origin:'https://attacker.test','Content-Type':'application/json'},body:'{"confirm":"test"}'}),env);
const start=calls.at(-1);assert.equal(start.method,'POST');assert.equal(start.headers.get('Authorization'),'Bearer private-operator');assert.equal(start.headers.get('Origin'),'https://attacker.test');assert.equal(start.headers.get('Cookie'),null);assert.equal(await start.text(),'{"confirm":"test"}');
console.log('PASS Rare Four service gateway: isolated destinations, read credentials stripped, staging writes blocked, production start retains backend authentication and origin checks.');
