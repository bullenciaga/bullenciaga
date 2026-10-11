import assert from 'node:assert/strict';
import {rareFourPreviewRead} from '../src/rare-four-preview.mjs';
const calls=[],fake=async (...args)=>{calls.push(args);return new Response('{"phase":"not-started"}',{headers:{'Content-Type':'application/json'}});};
const stage='https://bullenciaga-staging.bullenciaga-e5c.workers.dev';
for(const p of ['/status','/rules','/entries?wallet=public','/snapshot','/results']){
 const r=await rareFourPreviewRead(new Request(stage+'/rare-four-api'+p,{headers:{Authorization:'Bearer never-forward-me',Cookie:'never-forward-me'}}),fake);assert.equal(r.status,200);assert.equal(calls.at(-1)[0],'https://bullenciaga-rare-four-staging.bullenciaga-e5c.workers.dev'+p);assert.deepEqual(calls.at(-1)[1].headers,{Accept:'application/json'});
}
for(const host of ['https://bullenciaga.com','https://www.bullenciaga.com','https://attacker.test'])assert.equal(rareFourPreviewRead(new Request(host+'/rare-four-api/status'),fake),null);
assert.equal(rareFourPreviewRead(new Request(stage+'/goods'),fake),null);
assert.equal((await rareFourPreviewRead(new Request(stage+'/rare-four-api/start',{method:'POST'}),fake)).status,404);
assert.equal((await rareFourPreviewRead(new Request(stage+'/rare-four-api/unknown'),fake)).status,404);assert.equal(calls.length,5);
console.log('PASS Rare Four staging: fixed read-only destination, no credentials forwarded, no activation/write proxy, production and unrelated routes unchanged.');
