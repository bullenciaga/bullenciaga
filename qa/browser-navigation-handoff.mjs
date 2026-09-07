// Real document departure/arrival checks. Run against Wrangler or production.
// Requires Playwright; this does not emulate Chrome's native iOS browser UI.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {chromium, webkit} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:8798';
const evidence = process.env.HANDOFF_EVIDENCE || '/tmp/bullen-handoff.json';
const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) ';
const results = [];
for (const engine of (process.env.CHECK_ENGINES || 'chromium,webkit').split(',')) {
  const browser = await (engine === 'webkit' ? webkit.launch() : chromium.launch({executablePath:process.env.CHROME_EXECUTABLE}));
  try {
    for (const mode of ['chrome','safari','desktop']) {
      const events = [];
      const context = await browser.newContext({viewport:{width:mode==='desktop'?1440:440,height:850},isMobile:mode!=='desktop',
        userAgent:mode==='desktop'?'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36':iphone+(mode==='chrome'?'CriOS/140.0':'Version/26.0')+' Mobile/15E148 Safari/604.1'});
      await context.addInitScript(() => {
        window.recordHandoff = data => {
          const events=JSON.parse(sessionStorage.getItem('bullen-navigation-qa')||'[]');events.push(data);
          sessionStorage.setItem('bullen-navigation-qa',JSON.stringify(events));
        };
        window.handoffGeometry = () => {
          const header=document.querySelector('[data-bullen-shell]');
          const content=document.querySelector('.hero,.buy-desk') || document.querySelector('main');
          const style=header && getComputedStyle(header);
          return {path:location.pathname,t:performance.now(),header:!!header,y:header?.getBoundingClientRect().y,height:header?.getBoundingClientRect().height,
            opacity:style?.opacity,visibility:style?.visibility,name:style?.viewTransitionName,blur:style?.backdropFilter,contentY:content?.getBoundingClientRect().y,padding:document.body && getComputedStyle(document.body).paddingTop};
        };
        for (const name of ['pageswap','pagehide','pagereveal','pageshow']) addEventListener(name, event => {
          const data={event:name,transition:!!event.viewTransition,persisted:event.persisted,...window.handoffGeometry()};
          window.recordHandoff(data);
        });
      });
      let pauseNext=false, requested, resume;
      await context.route('**/*', async route => {
        const url=new URL(route.request().url());
        if (url.origin!==base) return route.abort();
        if (pauseNext && route.request().isNavigationRequest()) {
          pauseNext=false;
          await new Promise(resolve => {resume=resolve;requested();});
        }
        return route.continue();
      });
      const page=await context.newPage();
      const settled=async () => {await page.waitForFunction(()=>document.documentElement.classList.contains('bullen-ready'));await page.waitForTimeout(300);};
      const scrollChecks=[];
      const checkScrollSurface=async (stage) => {
        if(mode!=='chrome') return;
        const before=await page.evaluate(() => ({...window.handoffGeometry(),
          rootHeight:document.documentElement.clientHeight,rootExtent:document.documentElement.scrollHeight,
          bodyHeight:document.body.clientHeight,bodyExtent:document.body.scrollHeight,
          rootY:window.scrollY,bodyY:document.body.scrollTop,position:getComputedStyle(document.querySelector('[data-bullen-shell]')).position}));
        assert(before.rootExtent<=before.rootHeight+1,`${engine}: root must fit its viewport after ${stage}`);
        assert.equal(before.rootY,0,`${engine}: native root must remain at zero after ${stage}`);
        assert.equal(before.position,'fixed');assert.equal(before.y,0);assert.equal(before.name,'none');
        assert(before.bodyExtent>before.bodyHeight+100,`${engine}: ${stage} needs scrollable content`);
        await page.evaluate(() => {
          window.scrollTo({top:120,behavior:'instant'});
          document.body.scrollTo({top:320,behavior:'instant'});
        });
        await page.waitForFunction(()=>document.body.scrollTop>100);
        const after=await page.evaluate(() => ({...window.handoffGeometry(),rootY:window.scrollY,bodyY:document.body.scrollTop}));
        assert.equal(after.rootY,0,`${engine}: content scrolling must not move the native root`);
        assert(after.bodyY>100);assert.equal(after.y,before.y);assert.equal(after.height,before.height);
        assert.equal(after.opacity,'1');assert.equal(after.visibility,'visible');
        scrollChecks.push({stage,before,after});
        await page.evaluate(()=>document.body.scrollTo({top:0,behavior:'instant'}));
        await page.waitForFunction(()=>document.body.scrollTop===0);
      };
      await page.goto(base+'/buy',{waitUntil:'domcontentloaded'});await settled();
      await checkScrollSurface('initial arrival');
      for (const destination of ['/', '/patchnotes']) {
        // Use real, existing links; pause only the destination document.
        if (destination==='/patchnotes' && mode!=='desktop') await page.locator('.bullen-nav-toggle').click();
        if (destination==='/patchnotes' && mode==='desktop') await page.locator('.bullen-nav-group summary').filter({hasText:'House'}).click();
        const link=destination==='/'?page.locator('.bullen-site-brand'):page.locator('.bullen-site-nav a[href="/patchnotes.html"]:visible');
        const before=await page.evaluate(()=>window.handoffGeometry());
        const pending=new Promise(resolve=>{requested=resolve;});pauseNext=true;
        const click=link.click({noWaitAfter:true});await pending;
        // Keep the request pending, then compare the last outgoing geometry
        // recorded by pageswap with the settled source document.
        await new Promise(resolve=>setTimeout(resolve,500));
        resume();await click;await page.waitForURL(url=>url.pathname===destination);await settled();
        events.splice(0,events.length,...await page.evaluate(()=>JSON.parse(sessionStorage.getItem('bullen-navigation-qa')||'[]')));
        await fs.writeFile(evidence+'.events',JSON.stringify({engine,mode,events,before},null,2));
        const departure=events.filter(e=>e.event==='pageswap' && e.path===before.path).at(-1);
        assert(departure,'record the outgoing document, before its replacement');
        assert(departure.header);assert.equal(departure.opacity,'1');assert.equal(departure.visibility,'visible');
        for(const key of ['y','height','contentY','padding']) assert.equal(departure[key],before[key],key+' moved on departure');
        const after=await page.evaluate(()=>window.handoffGeometry());assert(after.header);assert.equal(after.y,0);assert.equal(after.opacity,'1');
        await checkScrollSurface('arrival '+destination);
        results.push({engine,mode,destination,before,after,departure});
      }
      await page.reload({waitUntil:'domcontentloaded'});await settled();
      assert.equal(await page.locator('.bullen-site-shell').count(),1);
      await checkScrollSurface('reload');
      await page.goBack({waitUntil:'domcontentloaded'});await settled();
      await checkScrollSurface('back');
      await page.goForward({waitUntil:'domcontentloaded'});await settled();
      await checkScrollSurface('forward');
      if(mode!=='desktop'){await page.locator('.bullen-nav-toggle').click();assert.equal(await page.locator('.bullen-nav-toggle').getAttribute('aria-expanded'),'true');await page.keyboard.press('Escape');}
      events.splice(0,events.length,...await page.evaluate(()=>JSON.parse(sessionStorage.getItem('bullen-navigation-qa')||'[]')));
      const swaps=events.filter(e=>e.event==='pageswap');
      if(mode==='chrome') {
        assert(swaps.every(e=>!e.transition),`${engine}: Chrome must not use cross-document header snapshots`);
      } else assert(swaps.every(e=>!e.transition),'other browsers must retain their existing handoff');
      results.push({engine,mode,events,scrollChecks});console.log('PASS',engine,mode,'departure, arrival, reload, back/forward, controls and scroll surface');
      await fs.writeFile(evidence,JSON.stringify({base,nativeIPhoneVerified:false,results},null,2));
      await context.close();
    }
  } finally {await browser.close();}
}
