import assert from 'node:assert/strict';
import { normalizeAth, marketAth } from '../src/market-ath.mjs';
import worker from '../src/website.mjs';
const now = Date.parse('2026-09-26T19:00:00Z');
const fixture = () => ({ id:'bullen', platforms:{solana:'BULLENxRbvuwjo4DLBKBbh23cNQ4ZbpDeQKuoVXL7exN'}, market_data:{ath:{usd:0.00057599},ath_date:{usd:'2026-09-26T18:55:20Z'},last_updated:'2026-09-26T18:55:30Z'} });
assert.equal(normalizeAth(fixture(), now).priceUsd, 0.00057599);
for (const change of [d=>d.id='other', d=>d.platforms.solana='wrong',d=>d.market_data.ath.usd=0,d=>d.market_data.ath.usd='0.1',d=>d.market_data.ath.usd=Infinity,d=>d.market_data.ath_date.usd='bad',d=>d.market_data.ath_date.usd='2026-09-27',d=>d.market_data.last_updated='2026-09-25',d=>d.market_data.last_updated='2026-09-27']) {
  const data=fixture();change(data);assert.throws(()=>normalizeAth(data,now));
}
let calls=0,time=now;
const store=new Map();const cache={match:async key=>store.get(key.url)?.clone(),put:async(key,response)=>{store.set(key.url,response);}};
const deps={now:()=>time,cache,fetcher:async()=>{calls++;return Response.json(fixture());}};
const request=(method='GET',query='')=>new Request('https://bullenciaga.com/market/ath'+query,{method});
let response=await marketAth(request(),null,deps);assert.equal(response.status,200);assert.equal((await response.json()).priceUsd,0.00057599);assert.equal(calls,1);
response=await marketAth(request('GET','?bypass=123'),null,deps);assert.equal(response.status,200);assert.equal(calls,1,'query must share cache');
response=await marketAth(request('HEAD'),null,deps);assert.equal(await response.text(),'');assert.equal(calls,1);
assert.equal((await marketAth(request('POST'),null,deps)).status,405);assert.equal(calls,1);
time+=301000;await marketAth(request(),null,deps);assert.equal(calls,2,'expired cache must refresh');
store.clear();deps.fetcher=async()=>{calls++;return new Response('upstream failure',{status:429});};
response=await marketAth(request(),null,deps);assert.equal(response.status,503);assert.equal((await response.json()).priceUsd,undefined);const failedCalls=calls;
await marketAth(request(),null,deps);assert.equal(calls,failedCalls,'brief negative cache prevents retry storms');
time+=31000;deps.fetcher=async()=>{calls++;return Response.json(fixture());};assert.equal((await marketAth(request(),null,deps)).status,200,'recovers after source failure');
for (const body of ['bad json','x'.repeat(262145),JSON.stringify({...fixture(),id:'wrong'})]) {
  const r=await marketAth(request(),null,{now:()=>now,fetcher:async()=>new Response(body)});assert.equal(r.status,503);assert.equal((await r.json()).priceUsd,undefined);
}
const savedFetch=globalThis.fetch;
try {
 globalThis.fetch=async()=>Response.json(fixture());
 // Router must not pass the data endpoint to static assets, even on iPhone.
 const result=await worker.fetch(request('POST'),{ASSETS:{fetch:()=>{throw new Error('wrong route');}}});assert.equal(result.status,405);
}finally{globalThis.fetch=savedFetch;}
console.log('ATH: mint/source validation, numeric/date bounds, cache reuse/expiry, method routing, bounded responses, failure and recovery passed');
