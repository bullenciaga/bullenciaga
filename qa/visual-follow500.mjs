// Local-only UI fixture checks. No entry submissions, wallets or external APIs.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import { FOLLOW500_PRIZES } from '../site/follow500.js';
const root = path.resolve(import.meta.dirname, '..');
const site = path.join(root, 'site');
const output = path.join(root, '.visual/follow500');
await fs.mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(site, '.' + (pathname === '/' ? '/index.html' : path.extname(pathname) ? pathname : pathname + '.html'));
  if (!file.startsWith(site + '/')) return res.writeHead(403).end();
  try {
    const body = await fs.readFile(file);
    res.setHeader('content-type', ({ '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.woff2':'font/woff2' })[path.extname(file)] || 'application/octet-stream');
    res.end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH });
let current = 'armed';
const status = () => ({ ok:true,campaign:'follow500',phase:current,armed:true,closed:['closed','committed','waiting-seed','drawn','review'].includes(current),followers:{count:current==='armed'?498:500,observedAt:new Date().toISOString(),target:500,account:'bullenciagax'},target:500,entryCount:32,eligibleCount:current==='armed'?null:28,closedAt:current==='armed'?null:new Date().toISOString(),drawnAt:current==='drawn'?new Date().toISOString():null,error:null });
const result = { ok:true,campaign:'follow500',manualDelivery:true,payoutStatus:'awaiting-owner',snapshotHash:'a'.repeat(64),algorithm:{name:'sha256-rank-v1'},seed:{chain:'solana-mainnet-beta',targetSlot:440000100,slot:440000101,blockhash:'4'.repeat(44)},winners:FOLLOW500_PRIZES.map(([prizeNumber,assetId],index)=>({rank:index+1,prizeNumber,assetId,wallet:assetId,score:String(index+1).repeat(64)})) };
const observations=[];
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport:{ width,height:1000 }, reducedMotion:'reduce' });
    await context.route('**/*', async route => {
      const url=new URL(route.request().url());
      if (url.origin !== base || /\.mp4$/.test(url.pathname)) return route.abort();
      if (url.pathname === '/entries/status') return current==='failure' ? route.fulfill({status:503,contentType:'application/json',body:'{}'}) : route.fulfill({contentType:'application/json',body:JSON.stringify(status())});
      if (url.pathname === '/entries/result') return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
      if (url.pathname === '/supply/minted') return route.fulfill({contentType:'application/json',body:'{"minted":588}'});
      if (route.request().method() !== 'GET') return route.abort();
      return route.continue();
    });
    const page = await context.newPage();
    const errors=[]; page.on('pageerror', error=>errors.push(error.message));
    for (const phase of ['armed','closed','waiting-seed','drawn','review','failure']) {
      current=phase;
      await page.goto(base+'/giveaways', {waitUntil:'networkidle'});
      const panel=page.locator('#follow500');
      await panel.waitFor();
      const content=await panel.innerText();
      assert.equal(await panel.locator('a.action.primary').count(),phase==='armed'?1:0,phase+' entry action');
      assert.equal(await panel.locator('.f500-winners li').count(),phase==='drawn'?5:0,phase+' winners');
      assert.equal(await page.locator('#herd-buy-hold-680-625-308').count(),1,'completed history preserved');
      assert.equal(await page.locator('#mint-round-3').count(),1,'future mint round preserved');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth + 1),`${width}px ${phase} has no horizontal page overflow`);
      await panel.screenshot({path:path.join(output,`giveaways-${width}-${phase}.png`)});
      observations.push({width,phase,status:await panel.getAttribute('data-status'),label:await panel.locator('.f500-label').innerText()});
      if(phase==='drawn')assert.match(content,/Delivery pending/);
      if(phase==='failure')assert.match(content,/Status unavailable/i);
    }
    for (const phase of ['armed','closed','failure']) {
      current=phase;
      await page.goto(base+'/?fixture='+phase+'#giveaway',{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>document.querySelector('#gvLiveStatus .f500-label'));
      assert.equal(await page.locator('#gvConnectBtn').isDisabled(),phase!=='armed',`homepage ${phase} button`);
      await page.locator('#gvLiveStatus').screenshot({path:path.join(output,`homepage-${width}-${phase}.png`)});
    }
    current='armed';
    await page.goto(base+'/?fixture=transition#giveaway',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.querySelector('#gvConnectBtn')?.disabled===false);
    current='closed';
    await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForFunction(()=>document.querySelector('#gvConnectBtn')?.textContent==='ENTRIES CLOSED');
    assert.equal(await page.locator('#gvConnectBtn').isDisabled(),true,'open homepage follows live cutoff');
    // Homepage unrelated graphics may fail because all external resources are
    // intentionally blocked. The giveaway module must never throw.
    assert.equal(errors.filter(error=>/follow500|giveawayModule|followerView|Unexpected token/.test(error)).length,0,errors.join('\n'));
    await context.close();
  }
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify({passed:observations.length,observations},null,2)+'\n');
  console.log(`Follower500 browser QA passed: ${observations.length} campaign renders and 6 homepage states.`);
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
