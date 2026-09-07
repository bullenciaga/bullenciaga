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
try {
 for(const width of [320,375,390,430,820,1440]){
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await context.route('**/*',route=>{
   const u=new URL(route.request().url());
   if(u.hostname==='plugin.jup.ag')return route.fulfill({contentType:'text/javascript',body:quoteStub});
   if(u.pathname==='/volume')return route.fulfill({json:{ok:true,price:.00024,volume24h:480,liquidityUsd:41000,priceChange24h:-2.5,marketStale:false,fetchedAt:Date.now()}});
   if(u.pathname==='/supply')return route.fulfill({json:{mint:MINT,totalSupply:820000000,circulatingSupply:580000000}});
   if(u.pathname==='/ohlcv')return route.fulfill({json:{ok:true,candles:[[Date.now()-3600000,0,0,0,.0002],[Date.now()-3600000,0,0,0,.00021],[Date.now()-1800000,0,0,0,.00024],[Date.now()-900000,0,0,0,null]]}});
   if(u.origin===base || /fonts\.(googleapis|gstatic)\.com/.test(u.hostname))return route.continue();
   return route.abort();
  });
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/buy');await page.locator('[data-swap-stub]').waitFor();await page.waitForFunction(()=>document.querySelector('#market-cap').textContent!=='—');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${width}: no horizontal overflow`);
  assert.equal(await page.locator('.wallet-jump').textContent(),'WALLET OPTIONS ↓');
  if(width>760){const edges=await page.evaluate(()=>['.swap-panel','.contract-panel'].map(s=>document.querySelector(s).getBoundingClientRect().bottom));assert(Math.abs(edges[0]-edges[1])<1,`${width}: panel bottoms align ${edges}`);}
  const config=await page.evaluate(()=>window.__config);
  assert.equal(config.displayMode,'integrated');assert.equal(config.autoConnect,false);assert.equal(config.formProps.initialOutputMint,MINT);assert.equal(config.formProps.initialInputMint,SOL);assert.equal(config.formProps.fixedMint,MINT);assert.equal(config.formProps.initialAmount,undefined);assert.equal(config.formProps.referralFee,undefined);
  assert.equal(await page.locator('#market-cap').textContent(),'$139,200');assert.equal(await page.locator('#market-fdv').textContent(),'$196,800');
  await page.locator('#copy-contract').click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),MINT);
  assert.equal(await page.locator('#price-chart').isVisible(),true);
  assert((await page.locator('#chart-line').getAttribute('d')).includes('L'));assert(!(await page.locator('#chart-line').getAttribute('d')).includes('NaN'));
  for(const wallet of ['phantom','solflare']){
   const href=await page.locator(`[data-wallet=${wallet}]`).getAttribute('href');const u=new URL(href);
   if(wallet==='phantom')assert.equal(u.searchParams.get('buy'),'solana:101/address:'+MINT);
   else assert.equal(u.href,`https://www.solflare.com/prices/bullenciaga/${MINT}/`);
  }
  await page.locator('.other-wallets summary').click();assert.equal(await page.locator('[data-wallet]').count(),6);
  for(const wallet of ['backpack','coinbase','trust','okx'])assert(decodeURIComponent(decodeURIComponent(await page.locator(`[data-wallet=${wallet}]`).getAttribute('href'))).includes('https://bullenciaga.com/buy'));
  for(const link of await page.locator('[data-route=jupiter]').all()){const u=new URL(await link.getAttribute('href'));assert.equal(u.searchParams.get('buy'),MINT);assert.equal(u.searchParams.get('sell'),SOL);}
  await page.locator('[data-range="7d"]').click();await page.waitForFunction(()=>!document.querySelector('#price-chart').hasAttribute('hidden'));assert.equal(await page.locator('[data-range="7d"]').getAttribute('aria-pressed'),'true');
  await page.evaluate(()=>{window.phantom={solana:{connect(){throw new Error('Must not connect automatically');}}};window.dispatchEvent(new Event('focus'));});
  await page.locator('[data-wallet=phantom]').click();assert.equal(new URL(page.url()).pathname,'/buy');assert.match(await page.locator('#copy-status').textContent(),/Connect Wallet/);
  assert.equal(errors.length,0,errors.join('\n'));
  await page.screenshot({path:new URL(`../.visual/buy-page/test-${width}.png`,import.meta.url).pathname,fullPage:true});
  checks++;await context.close();
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
 console.log(`Buy page: ${checks} scenarios passed; six widths, mint/amount configuration, copy, six wallet destinations, in-wallet continuation, chart, market cap/FDV, failure recovery and no-JS routes.`);
}finally{await browser.close();server.close();}
