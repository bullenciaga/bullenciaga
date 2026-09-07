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
      const fontRequests = [];
      context.on('request', request => { if(request.resourceType()==='font') fontRequests.push(request.url()); });
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
          if (name==='pagereveal' && event.viewTransition) event.viewTransition.ready.then(() => {
            const style=getComputedStyle(document.documentElement,'::view-transition-new(bullen-header)');
            window.recordHandoff({event:'transition-ready',animation:style.animationName,opacity:style.opacity,...window.handoffGeometry()});
          }).catch(error => window.recordHandoff({event:'transition-error',error:String(error)}));
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
      await page.goto(base+'/buy',{waitUntil:'domcontentloaded'});await settled();
      for (const destination of ['/', '/patchnotes']) {
        // Use real, existing links; pause only the destination document.
        if (destination==='/patchnotes' && mode!=='desktop') await page.locator('.bullen-nav-toggle').click();
        if (destination==='/patchnotes' && mode==='desktop') await page.locator('.bullen-nav-group summary').filter({hasText:'House'}).click();
        const link=destination==='/'?page.locator('.bullen-site-brand'):page.locator('.bullen-site-nav a[href="/patchnotes.html"]:visible');
        const before=await page.evaluate(()=>window.handoffGeometry());
        const pending=new Promise(resolve=>{requested=resolve;});pauseNext=true;
        const click=link.click({noWaitAfter:true});await pending;
        // During a native view-transition capture the old document's JS can
        // be suspended. Record its last geometry in pageswap instead of waiting
        // for a requestAnimationFrame that the browser intentionally freezes.
        await new Promise(resolve=>setTimeout(resolve,500));
        resume();await click;await page.waitForURL(url=>url.pathname===destination);await settled();
        events.splice(0,events.length,...await page.evaluate(()=>JSON.parse(sessionStorage.getItem('bullen-navigation-qa')||'[]')));
        await fs.writeFile(evidence+'.events',JSON.stringify({engine,mode,events,before},null,2));
        const departure=events.filter(e=>e.event==='pageswap' && e.path===before.path).at(-1);
        assert(departure,'record the outgoing document, before its replacement');
        assert(departure.header);assert.equal(departure.opacity,'1');assert.equal(departure.visibility,'visible');
        for(const key of ['y','height','contentY','padding']) assert.equal(departure[key],before[key],key+' moved on departure');
        const after=await page.evaluate(()=>window.handoffGeometry());assert(after.header);assert.equal(after.y,0);assert.equal(after.opacity,'1');
        results.push({engine,mode,destination,before,after,departure});
      }
      await page.reload({waitUntil:'domcontentloaded'});await settled();
      assert.equal(await page.locator('.bullen-site-shell').count(),1);
      await page.goBack({waitUntil:'domcontentloaded'});await settled();
      await page.goForward({waitUntil:'domcontentloaded'});await settled();
      if(mode!=='desktop'){await page.locator('.bullen-nav-toggle').click();assert.equal(await page.locator('.bullen-nav-toggle').getAttribute('aria-expanded'),'true');await page.keyboard.press('Escape');}
      events.splice(0,events.length,...await page.evaluate(()=>JSON.parse(sessionStorage.getItem('bullen-navigation-qa')||'[]')));
      const swaps=events.filter(e=>e.event==='pageswap');
      assert(swaps.every(e=>!e.transition),'document snapshots must not replace the persistent header');
      if(mode==='chrome') {
        assert.equal(await page.locator('.bullen-site-brand').evaluate(e=>getComputedStyle(e).fontFamily),'Arial, sans-serif');
        assert.equal(await page.locator('link[data-bullen-fonts],link[as="font"]').count(),0);
        assert.deepEqual(fontRequests,[], 'native typography must not download fonts during navigation');
      }
      results.push({engine,mode,events});console.log('PASS',engine,mode,'departure, arrival, reload, back/forward and controls');
      await fs.writeFile(evidence,JSON.stringify({base,nativeIPhoneVerified:false,results},null,2));
      await context.close();
    }
  } finally {await browser.close();}
}
