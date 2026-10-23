import assert from 'node:assert/strict';
const base=(process.env.SMOKE_BASE_URL||'https://bullenciaga.com').replace(/\/$/,'');
// A just-promoted Worker may briefly reach an edge still serving its previous
// route/asset manifest. Wait only for transient absence/unavailability, then
// run every original assertion. Authorization or content failures never pass.
async function get(path){
  const delays=[0,500,1000,2000,4000,8000,12000,12000,12000];
  for(let attempt=0;attempt<delays.length;attempt++){
    if(delays[attempt])await new Promise(resolve=>setTimeout(resolve,delays[attempt]));
    const response=await fetch(base+path,{redirect:'manual',headers:{'User-Agent':'BULLENCIAGA-Campaign-Smoke/1.0','Cache-Control':'no-cache'},signal:AbortSignal.timeout(20000)});
    if(![404,502,503,504].includes(response.status)||attempt===delays.length-1)return response;
    console.log(`Waiting for campaign route ${path}: HTTP ${response.status}, attempt ${attempt+1}`);
    await response.body?.cancel();
  }
}
for(const path of ['/campaigns','/campaigns/admin','/campaigns/preview']){
  const r=await get(path);assert.equal(r.status,200,path);assert.match(r.headers.get('X-Robots-Tag')||'',/noindex/);assert.match(r.headers.get('Content-Security-Policy')||'',/frame-ancestors 'none'/);const text=await r.text();assert(text.includes('/campaigns/campaigns.js'));assert(!text.includes('fixture-owner'));
}
const health=await get('/campaigns/api/health');assert.equal(health.status,200);assert.equal((await health.json()).storage,'durable');
const config=await get('/campaigns/api/config');assert.equal(config.status,200);assert.equal((await config.json()).wallet,true);
const admin=await get('/campaigns/api/admin/campaigns');assert.equal(admin.status,401,'owner records must require authentication');
const list=await get('/campaigns/api/campaigns');assert.equal(list.status,200);assert(Array.isArray((await list.json()).campaigns));
console.log('Campaign smoke: pages, noindex, CSP, durable storage, public config, campaign listing and denied anonymous admin passed.');
