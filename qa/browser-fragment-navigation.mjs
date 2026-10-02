// Real document checks, including the Worker-served iPhone body scroll surface.
// All financial/API writes and third-party requests are blocked.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:8798';
const evidence = process.env.NAV_EVIDENCE || '/tmp/bullen-fragment-navigation.json';
const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL || 'chrome' });
const results = [];
const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.7339.39 Mobile/15E148 Safari/604.1';
const sections = ['stats', 'how-to-buy', 'nft', 'gallery', 'roadmap', 'faq'];
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport: { width: mobile ? 390 : 1440, height: 900 }, ...(mobile ? {userAgent:iphone,isMobile:true,hasTouch:true} : {}) });
    let delayGallery = false;
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== new URL(base).origin || !['GET','HEAD'].includes(request.method())) return route.abort();
      if (delayGallery && url.pathname === '/gallery-manifest.json') await new Promise(resolve => setTimeout(resolve, 1800));
      return route.continue();
    });
    const page = await context.newPage();
    const ready = async () => {
      await page.evaluate(() => document.fonts.ready);
      if (await page.locator('[data-bullen-shell]').count()) await page.waitForFunction(() => document.documentElement.classList.contains('bullen-ready'));
    };
    const position = async id => page.evaluate(id => {
      const target = document.getElementById(id), root = document.documentElement;
      const bodyScroll = getComputedStyle(root).getPropertyValue('--bullen-scroll-surface').trim() === 'body';
      const surface = bodyScroll ? document.body : document.scrollingElement;
      const y = bodyScroll ? surface.scrollTop : window.scrollY;
      const header = document.querySelector('header');
      const top = Math.max(header && ['fixed','sticky'].includes(getComputedStyle(header).position) ? header.getBoundingClientRect().bottom + 12 : 12, (parseFloat(getComputedStyle(root).scrollPaddingTop)||0) + (parseFloat(getComputedStyle(target).scrollMarginTop) || 0));
      const targetY = target.getBoundingClientRect().top;
      const max = surface.scrollHeight - (bodyScroll ? surface.clientHeight : innerHeight);
      return {targetY,top,y,max,bodyScroll,windowY:window.scrollY,error:Math.min(Math.abs(targetY-top), Math.abs(y-max))};
    },id);
    const aligned = async id => {
      await page.waitForFunction(({id}) => {
        const target = document.getElementById(id), header = document.querySelector('header');
        const surface = getComputedStyle(document.documentElement).getPropertyValue('--bullen-scroll-surface').trim() === 'body' ? document.body : document.scrollingElement;
        const top = Math.max(header && ['fixed','sticky'].includes(getComputedStyle(header).position) ? header.getBoundingClientRect().bottom + 12 : 12, (parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop)||0) + (parseFloat(getComputedStyle(target).scrollMarginTop) || 0));
        return Math.abs(target.getBoundingClientRect().top-top)<3 || Math.abs(surface.scrollTop-(surface.scrollHeight-surface.clientHeight))<3;
      }, {id}, {timeout:5000});
      const data = await position(id); assert(data.error < 3,JSON.stringify(data));
      if (mobile && data.bodyScroll) assert.equal(data.windowY,0,'iPhone must keep root at zero');
      return data;
    };
    for (const id of sections) {
      await page.goto(`${base}/?arrival=${id}#${id}`,{waitUntil:'domcontentloaded'}); await ready();
      results.push({mobile,test:'fresh fragment',id,...await aligned(id)});
    }
    delayGallery = true;
    await page.goto(base + '/?delayed=1#roadmap',{waitUntil:'domcontentloaded'}); await ready();
    await aligned('roadmap');
    await page.waitForFunction(() => document.querySelectorAll('#galleryGrid .gallery-card').length > 0);
    results.push({mobile,test:'late gallery preserves destination',...await aligned('roadmap')});
    delayGallery = false;
    // Let the old initial-load observer go: deliberate scrolling must win.
    await page.mouse.move(20,850); await page.mouse.wheel(0,250); await page.waitForTimeout(120);
    const before = await position('roadmap');
    await page.evaluate(() => { document.getElementById('galleryGrid').style.paddingTop = '200px'; });
    await page.waitForTimeout(100);
    const after = await position('roadmap');
    assert(before.error>20 && after.error>20,'manual scroll must not snap back to the anchor');
    results.push({mobile,test:'manual scroll cancels follow',before,after});
    await page.goto(base + '/', {waitUntil:'domcontentloaded'}); await ready();
    for (const id of sections) {
      await page.locator('#jumpToBtn').click();
      const start = Date.now(); await page.locator(`#jumpToMenu a[href="#${id}"]`).click();
      const landed = await aligned(id);
      assert(Date.now()-start<1000,'menu link should land promptly');
      assert.equal(new URL(page.url()).hash,'#'+id);
      assert.equal(await page.locator('#jumpToBtn').getAttribute('aria-expanded'),'false');
      results.push({mobile,test:'rebuilt Jump To',id,elapsed:Date.now()-start,...landed});
    }
    // A new click cancels the first animation, rather than competing with it.
    await page.evaluate(() => {
      for (const id of ['stats','faq']) { const a=document.createElement('a');a.href='#'+id;document.body.append(a);a.click();a.remove(); }
    });
    results.push({mobile,test:'rapid navigation latest wins',...await aligned('faq')});
    await page.goto(base+'/patchnotes',{waitUntil:'domcontentloaded'}); await ready();
    await page.locator('.record-sections').scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
    const previous = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bullen-scroll-surface').trim()==='body'?document.body.scrollTop:window.scrollY);
    await page.locator('.record-sections a[href="#archive"]').click(); await aligned('archive');
    await page.waitForTimeout(550); await page.goBack(); await page.waitForTimeout(400);
    const back = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bullen-scroll-surface').trim()==='body'?document.body.scrollTop:window.scrollY);
    assert(Math.abs(back-previous)<3,`Back ${back} != ${previous}`);
    await page.goForward(); await page.waitForTimeout(400);
    results.push({mobile,test:'history position and forward',previous,back,...await aligned('archive')});
    await page.goto(base+'/lock',{waitUntil:'domcontentloaded'}); await ready();
    await page.locator('.jumpto-btn').click();
    await page.locator('.jumpto-menu a[href="/#roadmap"]').click(); await page.waitForURL("**/#roadmap"); await ready();
    results.push({mobile,test:'cross-page Jump To',...await aligned('roadmap')});
    for (const [route,id] of [['/flywheel','supply'],['/dev','receipts'],['/what-if-i-held','your-wallet']]) {
      await page.goto(base+route+'#'+id,{waitUntil:'domcontentloaded'});await ready();
      results.push({mobile,test:'standalone fragment',route,...await aligned(id)});
    }
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.goto(base+'/',{waitUntil:'domcontentloaded'});await ready();
    await page.locator('#contractBtn').click();
    results.push({mobile,test:'reduced motion immediate',...await aligned('nft')});
    await context.close();
  }
} finally {
  await fs.writeFile(evidence, JSON.stringify(results,null,2)+'\n');
  await browser.close();
}
console.log(`Fragment navigation: ${results.length} desktop/iPhone checks passed; ${evidence}`);
