// Local-only UI fixture checks. No entry submissions, wallets or external APIs.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { FOLLOW500_ENDPOINTS, FOLLOW500_PRIZES } from '../site/follow500.js';
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
const status = () => {
  const phase = current === 'amendment-unavailable' ? 'drawn' : current;
  return { ok:true,campaign:'follow500',phase,armed:true,closed:['closed','committed','waiting-seed','drawn','review'].includes(phase),followers:{count:phase==='armed'?498:500,observedAt:new Date().toISOString(),target:500,account:'bullenciagax'},target:500,entryCount:32,eligibleCount:phase==='armed'?null:8,closedAt:phase==='armed'?null:new Date().toISOString(),drawnAt:phase==='drawn'?new Date().toISOString():null,error:null };
};
// Draw and reserve inputs are synthetic and independently hashed here so the
// production browser verifier executes against real, reproducible fixture data.
const sha256 = text => createHash('sha256').update(text).digest('hex');
const wallets = [...FOLLOW500_PRIZES.map(([, assetId]) => assetId), '1'.repeat(32), '2'.repeat(32), '3'.repeat(32)].sort();
const payload = { campaign:'follow500',wallets,count:wallets.length,seedCommitment:{targetSlot:440000100} };
const snapshotHash = sha256(JSON.stringify(payload));
const snapshot = { ...payload,snapshotHash,hashEncoding:'fixture JSON property order' };
const seed = {chain:'solana-mainnet-beta',targetSlot:440000100,slot:440000101,blockhash:'4'.repeat(44)};
const ranked = wallets.map(wallet=>({wallet,score:sha256(`follow500-v1\n${snapshotHash}\n${seed.blockhash}\n${wallet}\n`)})).sort((a,b)=>a.score<b.score?-1:a.score>b.score?1:a.wallet.localeCompare(b.wallet));
const result = { ok:true,campaign:'follow500',manualDelivery:true,payoutStatus:'awaiting-owner',snapshotHash,algorithm:{name:'sha256-rank-v1'},seed,winners:ranked.slice(0,5).map((row,index)=>({...row,rank:index+1,prizeNumber:FOLLOW500_PRIZES[index][0],assetId:FOLLOW500_PRIZES[index][1]})) };
const amendment = {
  schema:'bullenciaga.follow500.amendment.v1',campaign:'follow500',revision:1,type:'owner-authorized-exception',
  amendedAt:'2026-09-10T02:00:00.000Z',snapshotHash,seedBlockhash:seed.blockhash,manualDelivery:true,payoutStatus:'awaiting-owner',
  reason:'The owner authorized a replacement for HERD #737 after a post-draw check found the original recipient held zero BULLEN.',
  ruleDisclosure:'The original minimum balance rule applied when entering. This is a separate owner exception after the original draw.',
  replacement:{prizeNumber:737,assetId:FOLLOW500_PRIZES[2][1],previousWallet:ranked[2].wallet,wallet:ranked[5].wallet,originalRank:6,score:ranked[5].score},
};
const observations=[];
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport:{ width,height:1000 }, reducedMotion:'reduce' });
    await context.route('**/*', async route => {
      const url=new URL(route.request().url());
      if (url.origin !== base || /\.mp4$/.test(url.pathname)) return route.abort();
      if (url.pathname === '/entries/status') return current==='failure' ? route.fulfill({status:503,contentType:'application/json',body:'{}'}) : route.fulfill({contentType:'application/json',body:JSON.stringify(status())});
      if (url.pathname === '/entries/result') return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
      if (url.pathname === '/entries/snapshot') return route.fulfill({contentType:'application/json',body:JSON.stringify(snapshot)});
      if (url.pathname === FOLLOW500_ENDPOINTS.amendment) return current==='amendment-unavailable'
        ? route.fulfill({status:503,contentType:'application/json',body:'{}'})
        : route.fulfill({contentType:'application/json',body:JSON.stringify(amendment)});
      if (url.pathname === '/supply/minted') return route.fulfill({contentType:'application/json',body:'{"minted":588}'});
      if (route.request().method() !== 'GET') return route.abort();
      return route.continue();
    });
    const page = await context.newPage();
    const errors=[]; page.on('pageerror', error=>errors.push(error.message));
    for (const phase of ['armed','closed','waiting-seed','drawn','amendment-unavailable','review','failure']) {
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
      if(phase==='drawn') {
        assert.match(content,/Prizes have been delivered/);
        assert.equal(await panel.locator('.f500-note br').count(),3,'summary breaks the replacement sentence into readable lines');
        assert.match(content,/owner.{0,20}amendment/i);
        const recipientRows = await panel.locator('.f500-winners ol').innerText();
        assert.ok(recipientRows.includes(ranked[5].wallet),'amended recipient shown');
        assert.ok(!recipientRows.includes(ranked[2].wallet),'superseded recipient excluded from main table');
        await panel.locator('.f500-method summary').click();
        await panel.locator('[data-follow500-verify]').click();
        await panel.locator('[data-follow500-verification]').filter({hasText:'Verified:'}).waitFor();
        const verification = await panel.locator('[data-follow500-verification]').innerText();
        assert.match(verification,/original/i);
        assert.match(verification,/rank 6/i);
      }
      if(phase==='amendment-unavailable') {
        assert.equal(await panel.getAttribute('data-status'),'pending','missing amendment evidence stays pending');
        assert.match(content,/amended result awaiting verification/i);
        assert.equal(await panel.locator('[data-follow500-verify]').count(),0,'no verifier success implied with absent amendment');
      }
      await panel.screenshot({path:path.join(output,`giveaways-${width}-${phase}.png`)});
      observations.push({width,phase,status:await panel.getAttribute('data-status'),label:await panel.locator('.f500-label').innerText()});
      if(phase==='failure')assert.match(content,/Status unavailable/i);
    }
    await page.goto(base+'/',{waitUntil:'domcontentloaded'});
    await page.waitForSelector('header[data-bullen-hydrated="true"]');
    assert.equal(await page.locator('#giveaway').count(),0,'completed campaign is removed from homepage');
    assert.equal(await page.locator('a[href="#giveaway"], a[href="/#giveaway"]').count(),0,'no dead giveaway section links');
    assert.equal(await page.locator('section.hero + section#stats').count(),1,'live stats follow the hero directly');
    assert.ok(await page.locator('a[href="/giveaways.html"]').count(),'results remain accessible through shared navigation');
    assert.equal(errors.filter(error=>/follow500|giveawayModule|followerView|Unexpected token/.test(error)).length,0,errors.join('\n'));
    await context.close();
  }
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify({passed:observations.length,observations},null,2)+'\n');
  console.log(`Follower500 browser QA passed: ${observations.length} campaign renders and 2 homepage retirement checks.`);
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
