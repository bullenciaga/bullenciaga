// Optional browser checks for the current article and every preserved edition.
// Supply PLAYWRIGHT_MODULE and CHROMIUM_PATH when they are not on the normal path.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
const site=path.resolve(import.meta.dirname,'../site');
const output=process.env.VISUAL_OUTPUT || path.resolve(import.meta.dirname,'../.visual/house-record-007');
await fs.mkdir(output,{recursive:true});
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.woff2':'font/woff2','.mp4':'video/mp4'};
const server=createServer(async(req,res)=>{
 let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 if(name==='/')name='/index.html';else if(!path.extname(name))name+='.html';
 const file=path.resolve(site,'.'+name);
 if(!file.startsWith(site+'/'))return res.writeHead(403).end();
 try{res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'}).end(await fs.readFile(file));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=process.env.VISUAL_BASE_URL||`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
const results=[];const errors=[];
try{
 const context=await browser.newContext({reducedMotion:'reduce'});
 // Only the local site and the public read-only film/poster are needed.
 await context.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.origin===new URL(base).origin || (u.hostname==='bullenciaga.com' && u.pathname.startsWith('/goods/assets/videos/') && route.request().method()==='GET'))return route.continue();
  return route.abort();
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.__recordShifts=[];new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput)window.__recordShifts.push(e.value);}).observe({type:'layout-shift',buffered:true});});
 const goto=async route=>{await page.goto(base+route,{waitUntil:'domcontentloaded'});await page.waitForSelector('html.bullen-ready');await page.evaluate(()=>document.fonts.ready);};
 for(const width of [320,390,760,1024,1440,1920]){
  await page.setViewportSize({width,height:1000});await goto('/patchnotes');
  await page.getByRole('heading',{level:1,name:/The House, worn and heard\./}).waitFor();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Current page overflow at${width}`);
  const hero=page.locator('main img[src*="007-seated-"]').first();
  await hero.evaluate(img=>img.decode());
  const size=await hero.boundingBox();assert(size.width>0&&size.height>0);
  const intrinsic=await hero.evaluate(img=>({width:img.naturalWidth,height:img.naturalHeight,objectFit:getComputedStyle(img).objectFit}));
  assert(Math.abs(size.width/size.height-intrinsic.width/intrinsic.height)<.02,'Opening image retains complete framing');
  const headings=await page.locator('main h1,main h2,main h3').evaluateAll(nodes=>nodes.map(el=>({text:el.textContent.trim(),overflow:el.scrollWidth>el.clientWidth+1})));
  assert(headings.every(h=>!h.overflow),JSON.stringify(headings.filter(h=>h.overflow)));
  const picker=page.locator('.record-editions .record-picker');
  await picker.locator('summary').click();
  assert.equal(await picker.locator('li').count(),7);
  const menu=await picker.locator('ul').boundingBox();assert(menu.x>=0&&menu.x+menu.width<=width);
  await page.keyboard.press('Escape');assert.equal(await picker.getAttribute('open'),null);
  const contents=page.locator('#bullen-contents-button');await contents.click();
  assert.equal(await contents.getAttribute('aria-expanded'),'true');
  const ids=await page.locator('#bullen-contents-panel a').evaluateAll(links=>links.map(a=>a.hash.slice(1)));
  assert(ids.length>=5);for(const id of ids)assert.equal(await page.locator(`[id="${id}"]`).count(),1);
  await page.keyboard.press('Escape');assert.equal(await contents.getAttribute('aria-expanded'),'false');
  await page.locator('#bullen-explore-button').click();assert(await page.locator('#bullen-explore-panel').isVisible());await page.keyboard.press('Escape');
  const video=page.locator('main video');
  if(process.env.VISUAL_BASE_URL)await video.evaluate(v=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>img.decode().then(resolve,reject);img.onerror=()=>reject(new Error('Collection poster failed to load'));img.src=v.poster;}));
  assert.equal(await video.count(),1);assert.equal(await video.getAttribute('autoplay'),null);assert.equal(await video.getAttribute('preload'),'none');
  const cls=await page.evaluate(()=>window.__recordShifts.reduce((a,b)=>a+b,0));assert(cls<.02,`Opening layout shift ${width}: ${cls}`);
  if([390,1440].includes(width)){
   for(const img of await page.locator('main img[loading="lazy"]').all()){await img.scrollIntoViewIfNeeded();await img.evaluate(el=>el.decode());}
   await page.evaluate(()=>scrollTo(0,0));
   await page.screenshot({path:path.join(output,`edition007-top-${width}.png`)});
   await page.screenshot({path:path.join(output,`edition007-full-${width}.png`),fullPage:true});
  }
  if(width===1440&&process.env.VISUAL_BASE_URL){
   await page.locator('.record-film-play').click();await page.waitForFunction(()=>document.querySelector('.record-film-play').hidden);
   const media=await video.evaluate(async v=>{await new Promise(r=>setTimeout(r,1200));v.pause();return {currentTime:v.currentTime,readyState:v.readyState,error:v.error?.message||null,muted:v.muted};});
   assert(media.currentTime>.5&&media.readyState>=2&&!media.error&&media.muted,JSON.stringify(media));results.push({media,pass:true});
  }
  results.push({page:'007',width,cls,hero:size,pass:true});
  if([320,390,1440].includes(width))for(const n of ['001','002','003','004','005','006']){
   await goto('/patchnotes-'+n);assert(await page.locator('.record-archive-notice').isVisible());
   assert.equal(await page.locator('.record-editions a[aria-current]').getAttribute('href'),'/patchnotes-'+n);
   assert.equal(await page.locator('.record-editions li').count(),7);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Archive${n} overflow at${width}`);
   results.push({page:n,width,pass:true});
  }
 }
 assert.deepEqual(errors,[],'No JavaScript exceptions');
 if(process.env.VISUAL_BASE_URL){
  await context.route('**/goods/assets/videos/*.mp4',r=>r.abort());
  await goto('/patchnotes');await page.locator('.record-film-play').click();
  await page.locator('.record-film-status').waitFor({state:'visible'});
  assert(await page.locator('.record-film-play').isVisible());assert(await page.locator('.record-film-play').isEnabled());
  results.push({mediaFailure:'retry and direct link available',pass:true});
 }
 await context.close();
 const nojs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});const p=await nojs.newPage();await p.goto(base+'/patchnotes');
 assert(await p.locator('h1').isVisible());await p.locator('.record-editions summary').click();assert(await p.locator('.record-editions ul').isVisible());assert.equal(await p.locator('.record-editions li').count(),7);await nojs.close();
 results.push({page:'007',javascript:false,pass:true});
 await fs.writeFile(path.join(output,'browser-checks.json'),JSON.stringify({pass:true,checks:results,errors},null,2));
 console.log(JSON.stringify({pass:true,checks:results.length,output}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
