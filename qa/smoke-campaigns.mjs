import assert from 'node:assert/strict';
const base=(process.env.SMOKE_BASE_URL||'https://bullenciaga.com').replace(/\/$/,'');
const get=path=>fetch(base+path,{redirect:'manual',headers:{'User-Agent':'BULLENCIAGA-Campaign-Smoke/1.0'},signal:AbortSignal.timeout(20000)});
for(const path of ['/campaigns','/campaigns/admin','/campaigns/preview']){
  const r=await get(path);assert.equal(r.status,200,path);assert.match(r.headers.get('X-Robots-Tag')||'',/noindex/);assert.match(r.headers.get('Content-Security-Policy')||'',/frame-ancestors 'none'/);const text=await r.text();assert(text.includes('/campaigns/campaigns.js'));assert(!text.includes('fixture-owner'));
}
const health=await get('/campaigns/api/health');assert.equal(health.status,200);assert.equal((await health.json()).storage,'durable');
const config=await get('/campaigns/api/config');assert.equal(config.status,200);assert.equal((await config.json()).wallet,true);
const admin=await get('/campaigns/api/admin/campaigns');assert.equal(admin.status,401,'owner records must require authentication');
const list=await get('/campaigns/api/campaigns');assert.equal(list.status,200);assert(Array.isArray((await list.json()).campaigns));
console.log('Campaign smoke: pages, noindex, CSP, durable storage, public config, campaign listing and denied anonymous admin passed.');
