import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createPreviewServer} from './serve-buy-preview.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const MINT='BULLENxRbvuwjo4DLBKBbh23cNQ4ZbpDeQKuoVXL7exN';
const SOL='So11111111111111111111111111111111111111112';
const server=createPreviewServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
await fs.mkdir(new URL('../.visual/buy-page/',import.meta.url),{recursive:true});
let checks=0;
const quoteStub=`window.Jupiter={init:config=>{window.__config=config;const host=document.getElementById(config.integratedTargetId);host.insertAdjacentHTML('beforeend','<div data-swap-stub style="height:380px;padding:30px;color:#c7a869">Isolated test swap · SOL → BULLEN</div>');}};`;
async function assertChange(page,text,className){
 await page.waitForFunction(expected=>document.querySelector('#market-change').textContent===expected,text);
 assert.equal(await page.locator('#market-change').getAttribute('class') || '',className);
}
async function controlledPage(){
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
 await context.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.hostname==='plugin.jup.ag')return route.fulfill({contentType:'text/javascript',body:quoteStub});
  return u.origin===base?route.continue():route.abort();
 });
 await context.addInitScript(()=>{
  const nativeFetch=window.fetch.bind(window);window.__buyRequests=[];
  window.fetch=(input,init)=>{
   const u=new URL(typeof input==='string'?input:input.url,location.href);
   if(!['/volume','/supply','/ohlcv'].includes(u.pathname))return nativeFetch(input,init);
   // Let even aborted requests settle, exercising the page's stale-response guard.
   return new Promise(resolve=>window.__buyRequests.push({path:u.pathname,range:u.searchParams.get('tf'),resolve,settled:false}));
  };
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/buy');
 await page.waitForFunction(()=>window.__buyRequests.length===3);
 return {context,page,errors};
}
async function respond(page,path,body,{range=null,status=200}={}){
 await page.waitForFunction(({path,range})=>window.__buyRequests.some(r=>!r.settled&&r.path===path&&r.range===range),{path,range});
 await page.evaluate(({path,range,body,status})=>{
  const request=window.__buyRequests.find(r=>!r.settled&&r.path===path&&r.range===range);
  request.settled=true;request.resolve(new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}}));
 },{path,range,body,status});
 await page.evaluate(()=>new Promise(requestAnimationFrame));
}
const marketFixture=()=>({ok:true,price:.00024,volume24h:480,liquidityUsd:41000,priceChange24h:-99,marketStale:false,fetchedAt:Date.now()});
const supplyFixture={mint:MINT,totalSupply:820000000,circulatingSupply:580000000};
const closes=(first,last)=>({ok:true,candles:[[Date.now()-3600000,0,0,0,first],[Date.now()-1800000,0,0,0,last]]});
try {
 for(const width of [320,375,390,430,820,1440]){
  const chartNow=Date.now(), day=86400000, chartRanges=[];
  const candles=[[chartNow-40*day,0,0,0,.0001],[chartNow-3*day,0,0,0,.00018],[chartNow-3600000,0,0,0,.0002],[chartNow-3600000,0,0,0,.00021],[chartNow-1800000,0,0,0,.00024],[chartNow-900000,0,0,0,null],[chartNow+day,0,0,0,100]];
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await context.route('**/*',route=>{
   const u=new URL(route.request().url());
   if(u.hostname==='plugin.jup.ag')return route.fulfill({contentType:'text/javascript',body:quoteStub});
   if(u.pathname==='/volume')return route.fulfill({json:{ok:true,price:.00024,volume24h:480,liquidityUsd:41000,priceChange24h:-2.5,marketStale:false,fetchedAt:Date.now()}});
   if(u.pathname==='/supply')return route.fulfill({json:{mint:MINT,totalSupply:820000000,circulatingSupply:580000000}});
   if(u.pathname==='/ohlcv'){chartRanges.push(u.searchParams.get('tf'));return route.fulfill({json:{ok:true,candles}});}
   if(u.origin===base || /fonts\.(googleapis|gstatic)\.com/.test(u.hostname))return route.continue();
   return route.abort();
  });
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/buy');await page.locator('[data-swap-stub]').waitFor();await page.waitForFunction(()=>document.querySelector('#market-cap').textContent!=='—');await page.locator('#price-chart').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${width}: no horizontal overflow`);
  assert.equal(await page.locator('.wallet-jump').textContent(),'WALLET OPTIONS ↓');
  if(width>760){const edges=await page.evaluate(()=>['.swap-panel','.contract-panel'].map(s=>document.querySelector(s).getBoundingClientRect().bottom));assert(Math.abs(edges[0]-edges[1])<1,`${width}: panel bottoms align ${edges}`);}
  const config=await page.evaluate(()=>window.__config);
  assert.equal(config.displayMode,'integrated');assert.equal(config.autoConnect,false);assert.equal(config.formProps.initialOutputMint,MINT);assert.equal(config.formProps.initialInputMint,SOL);assert.equal(config.formProps.fixedMint,MINT);assert.equal(config.formProps.initialAmount,undefined);assert.equal(config.formProps.referralFee,undefined);
  assert.equal(await page.locator('#market-cap').textContent(),'$139,200');assert.equal(await page.locator('#market-fdv').textContent(),'$196,800');
  await page.locator('#copy-contract').click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),MINT);
  assert.equal(await page.locator('#price-chart').isVisible(),true);
  assert((await page.locator('#chart-line').getAttribute('d')).includes('L'));assert(!(await page.locator('#chart-line').getAttribute('d')).includes('NaN'));
  assert.equal(chartRanges[0],'all','First load requests the all-history feed');
  assert.equal(await page.locator('[data-range="all"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('[data-range][aria-pressed="true"]').count(),1);
  assert.equal((await page.locator('#chart-line').getAttribute('d')).match(/L/g).length,3,'Default All time includes older history while excluding duplicate, invalid and future samples');
  await assertChange(page,'+140.00% · all time','positive');
  for(const wallet of ['phantom','solflare']){
   const href=await page.locator(`[data-wallet=${wallet}]`).getAttribute('href');const u=new URL(href);
   if(wallet==='phantom')assert.equal(u.searchParams.get('buy'),'solana:101/address:'+MINT);
   else assert.equal(u.href,`https://www.solflare.com/prices/bullenciaga/${MINT}/`);
  }
  await page.locator('.other-wallets summary').click();assert.equal(await page.locator('[data-wallet]').count(),6);
  for(const wallet of ['backpack','coinbase','trust','okx'])assert(decodeURIComponent(decodeURIComponent(await page.locator(`[data-wallet=${wallet}]`).getAttribute('href'))).includes('https://bullenciaga.com/buy'));
  for(const link of await page.locator('[data-route=jupiter]').all()){const u=new URL(await link.getAttribute('href'));assert.equal(u.searchParams.get('buy'),MINT);assert.equal(u.searchParams.get('sell'),SOL);}
  await page.locator('[data-range="7d"]').click();await page.waitForFunction(()=>!document.querySelector('#price-chart').hasAttribute('hidden'));assert.equal(await page.locator('[data-range="7d"]').getAttribute('aria-pressed'),'true');
  assert.equal((await page.locator('#chart-line').getAttribute('d')).match(/L/g).length,2,'7D includes the three-day sample');
  await assertChange(page,'+33.33% · 7d','positive');
  await page.locator('[data-range="all"]').click();await page.waitForFunction(()=>!document.querySelector('#price-chart').hasAttribute('hidden'));
  assert.equal(await page.locator('[data-range="all"]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('[data-range][aria-pressed="true"]').count(),1);
  assert.equal((await page.locator('#chart-line').getAttribute('d')).match(/L/g).length,3,'All time keeps history older than seven days without invalid or future points');
  assert((await page.locator('#chart-description').textContent()).includes(await page.evaluate(t=>new Date(t).toLocaleString(),chartNow-40*day)),'All time begins at the oldest available sample');
  assert(chartRanges.includes('all'),'All time requests the existing all-history feed');
  await assertChange(page,'+140.00% · all time','positive');
  await page.locator('[data-range="24h"]').click();await page.waitForFunction(()=>!document.querySelector('#price-chart').hasAttribute('hidden'));
  assert.equal((await page.locator('#chart-line').getAttribute('d')).match(/L/g).length,1,'Switching back restores the 24H window');
  await assertChange(page,'+14.29% · 24h','positive');
  await page.evaluate(()=>{window.phantom={solana:{connect(){throw new Error('Must not connect automatically');}}};window.dispatchEvent(new Event('focus'));});
  await page.locator('[data-wallet=phantom]').click();assert.equal(new URL(page.url()).pathname,'/buy');assert.match(await page.locator('#copy-status').textContent(),/Connect Wallet/);
  assert.equal(errors.length,0,errors.join('\n'));
  await page.screenshot({path:new URL(`../.visual/buy-page/test-${width}.png`,import.meta.url).pathname,fullPage:true});
  checks++;await context.close();
 }
 // Changes use plotted closing prices, and every new range clears old values/colors.
 {
  const {context,page,errors}=await controlledPage();
  await assertChange(page,'— · all time','');
  await respond(page,'/volume',marketFixture());await respond(page,'/supply',supplyFixture);
  await respond(page,'/ohlcv',closes(2,3),{range:'all'});await assertChange(page,'+50.00% · all time','positive');
  await page.locator('[data-range="7d"]').click();await assertChange(page,'— · 7d','');
  assert.equal(await page.locator('#price-chart').isVisible(),false);
  await respond(page,'/ohlcv',closes(4,2),{range:'7d'});await assertChange(page,'-50.00% · 7d','negative');
  await page.locator('[data-range="all"]').click();await assertChange(page,'— · all time','');
  await respond(page,'/ohlcv',closes(2,2),{range:'all'});await assertChange(page,'0.00% · all time','');
  await page.locator('[data-range="24h"]').click();await assertChange(page,'— · 24h','');
  await respond(page,'/ohlcv',closes(1,.9999999),{range:'24h'});await assertChange(page,'0.00% · 24h','');
  await page.locator('[data-range="7d"]').click();await assertChange(page,'— · 7d','');
  await respond(page,'/ohlcv',{ok:false},{range:'7d',status:503});await assertChange(page,'7d change unavailable','');
  assert.equal(await page.locator('#price-chart').isVisible(),false);
  assert.match(await page.locator('#chart-empty').textContent(),/unavailable/);
  await page.locator('[data-range="all"]').click();await assertChange(page,'— · all time','');
  await respond(page,'/ohlcv',{ok:true,candles:[[Date.now()-3600000,0,0,0,2]]},{range:'all'});
  await assertChange(page,'all time change unavailable','');
  await page.locator('[data-range="24h"]').click();await assertChange(page,'— · 24h','');
  await respond(page,'/ohlcv',closes(2,3),{range:'24h'});await assertChange(page,'+50.00% · 24h','positive');
  assert.equal(await page.locator('#price-chart').isVisible(),true);
  assert.deepEqual(errors,[]);checks++;await context.close();
 }
 // Independent market success and failure cannot replace a selected chart change.
 for(const marketFails of [false,true]){
  const {context,page,errors}=await controlledPage();
  await respond(page,'/ohlcv',closes(2,3),{range:'all'});
  await page.locator('[data-range="all"]').click();await assertChange(page,'— · all time','');
  await respond(page,'/ohlcv',closes(1,2),{range:'all'});await assertChange(page,'+100.00% · all time','positive');
  await respond(page,'/volume',marketFails?{ok:false}:marketFixture(),{status:marketFails?503:200});
  await assertChange(page,'+100.00% · all time','positive');
  await respond(page,'/supply',supplyFixture);
  await page.waitForFunction(fails=>fails?/unavailable/.test(document.querySelector('#market-status').textContent):document.querySelector('#market-cap').textContent==='$139,200',marketFails);
  await assertChange(page,'+100.00% · all time','positive');
  assert.equal(await page.locator('[data-range="all"]').getAttribute('aria-pressed'),'true');
  assert.deepEqual(errors,[]);checks++;await context.close();
 }
 // Obsolete chart success and failure must leave the current selection intact.
 {
  const {context,page,errors}=await controlledPage();
  await respond(page,'/volume',marketFixture());await respond(page,'/supply',supplyFixture);
  await respond(page,'/ohlcv',closes(2,3),{range:'all'});
  await page.locator('[data-range="7d"]').click();await assertChange(page,'— · 7d','');
  await page.locator('[data-range="all"]').click();await assertChange(page,'— · all time','');
  await respond(page,'/ohlcv',closes(1,3),{range:'all'});await assertChange(page,'+200.00% · all time','positive');
  const currentChart=await page.locator('#chart-description').textContent();
  await respond(page,'/ohlcv',closes(1,10),{range:'7d'});
  await assertChange(page,'+200.00% · all time','positive');
  assert.equal(await page.locator('#chart-description').textContent(),currentChart);
  assert.equal(await page.locator('[data-range="all"]').getAttribute('aria-pressed'),'true');
  await page.locator('[data-range="24h"]').click();await assertChange(page,'— · 24h','');
  await page.locator('[data-range="7d"]').click();await assertChange(page,'— · 7d','');
  await respond(page,'/ohlcv',closes(4,2),{range:'7d'});await assertChange(page,'-50.00% · 7d','negative');
  await respond(page,'/ohlcv',{ok:false},{range:'24h',status:503});await assertChange(page,'-50.00% · 7d','negative');
  assert.equal(await page.locator('#price-chart').isVisible(),true);
  assert.equal(await page.locator('[data-range="7d"]').getAttribute('aria-pressed'),'true');
  assert.deepEqual(errors,[]);checks++;await context.close();
 }
 // A failed plugin and failed market endpoints must leave real buying links usable.
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 const page=await context.newPage();await page.goto(base+'/buy');await page.locator('#retry-swap').waitFor();
 assert.match(await page.locator('#market-status').textContent(),/unavailable/);
 assert.equal(await page.locator('#market-price').textContent(),'—');
 assert.equal(await page.locator('[data-route=pump]').count(),1);assert.match(await page.locator('#swap-status').textContent(),/unavailable/);
 await context.route('https://plugin.jup.ag/**',r=>r.fulfill({contentType:'text/javascript',body:quoteStub}));await page.locator('#retry-swap').click();await page.locator('[data-swap-stub]').waitFor();checks++;
 await context.close();
 const nojs=await browser.newContext({javaScriptEnabled:false});const np=await nojs.newPage();await np.goto(base+'/buy');assert.equal(await np.locator('[data-wallet=phantom]').isVisible(),true);assert.equal(await np.locator('[data-route=pump]').isVisible(),true);checks++;await nojs.close();
 assert(!/^\/buy\s/m.test(await fs.readFile(new URL('../site/_redirects',import.meta.url),'utf8')));
 console.log(`Buy page: ${checks} scenarios passed; six widths, mint/amount configuration, copy, six wallet destinations, in-wallet continuation, chart-range changes, signed/neutral/loading/error states, market/chart request isolation, market cap/FDV, failure recovery and no-JS routes.`);
}finally{await browser.close();server.close();}
