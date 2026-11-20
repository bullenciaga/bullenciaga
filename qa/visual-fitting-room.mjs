// Exercise actual browser animations, interrupted selections and the downloaded image.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.VISUAL_BASE_URL || 'https://fitting-room.test';
const site = path.resolve(import.meta.dirname,'../site');
const browser = await chromium.launch({channel:process.env.CHROME_CHANNEL || 'chrome',headless:true});
try {
  for (const [width,height] of [[1440,950],[390,844],[320,568],[844,390],[568,320]]) {
    const reduced = width === 320;
    const ctx = await browser.newContext({viewport:{width,height},
      reducedMotion:reduced ? 'reduce' : 'no-preference',acceptDownloads:true});
    if (!process.env.VISUAL_BASE_URL) {
      await ctx.route(base + '/**',async route => {
        const pathname = new URL(route.request().url()).pathname;
        const file = path.resolve(site,'.' + (pathname === '/' ? '/index.html' : path.extname(pathname) ? pathname : pathname + '.html'));
        assert(file.startsWith(site + path.sep));
        await route.fulfill({path:file});
      });
    }
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror',error => errors.push(error.message));
    await p.addInitScript(() => {
      window.fittingMotion = [];
      const animate = Element.prototype.animate;
      Element.prototype.animate = function(frames,options) {
        const part = this.closest('[data-layer]')?.dataset.layer;
        const record = {part,keys:Object.keys(frames[0])};
        const animation = animate.call(this,frames,options);
        if (this.classList.contains('wardrobe-track')) {
          const slot = this.parentElement.getBoundingClientRect();
          record.travel = frames.map(frame => frame.transform);
          record.positions = [0,.5,1].map(fraction => {
            animation.currentTime = options.duration * fraction;
            return [...this.children].map(piece => {
              const style = getComputedStyle(piece);
              return {x:(piece.getBoundingClientRect().left-slot.left)/slot.width,
                opacity:style.opacity,clip:style.clipPath};
            });
          });
          animation.currentTime = 0;
        }
        window.fittingMotion.push(record);
        return animation;
      };
    });
    await p.goto(base + '/tfr');
    const ready = () => p.locator('#download[href]').waitFor();
    await ready();
    await p.evaluate(() => document.fonts.ready);
    assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const type = await p.evaluate(() => {
      const title = document.querySelector('.opening h1');
      const style = getComputedStyle(title);
      const wardrobe = getComputedStyle(document.querySelector('.wardrobe-head h2'));
      const brand = getComputedStyle(document.querySelector('.bullen-header-brand'));
      const range = document.createRange();
      range.selectNodeContents(title);
      return {
        titleFont:style.fontFamily.split(',')[0].replace(/["']/g,''),
        titleLoaded:[...document.fonts].some(face => face.family.replace(/["']/g,'') === 'Great Vibes' && face.status === 'loaded'),
        titleCase:style.textTransform,
        lines:range.getClientRects().length,
        wardrobeMatchesBrand:wardrobe.fontFamily === brand.fontFamily && wardrobe.fontWeight === brand.fontWeight
      };
    });
    assert.deepEqual(type,{titleFont:'Great Vibes',titleLoaded:true,titleCase:'none',lines:1,wardrobeMatchesBrand:true});
    const community = p.locator('.bullen-header-group').filter({has:p.locator('summary',{hasText:'Community'})});
    assert.equal(await community.getByRole('link',{name:/The Fitting Room/,includeHidden:true}).getAttribute('href'),'/tfr');
    if (process.env.TFR_SCREENSHOTS) {
      await fs.mkdir(process.env.TFR_SCREENSHOTS,{recursive:true});
      await p.screenshot({path:path.join(process.env.TFR_SCREENSHOTS,'fitting-room-'+width+'.png'),fullPage:true});
    }
    const clothTiles = await p.locator('#fold-clothing .choice-art').evaluateAll(tiles => tiles.map(tile => tile.getBoundingClientRect().top));
    for (let i=0;i<clothTiles.length;i++) {
      assert(Math.abs(clothTiles[i] - clothTiles[i - i%4]) < 1,'Clothing thumbnails align across each row');
    }
    if (width < 1000) {
      const wardrobe = p.locator('.wardrobe');
      const portrait = p.locator('#print');
      const start = await portrait.boundingBox();
      await wardrobe.evaluate(el => el.scrollTo(0,el.scrollHeight));
      const geometry = await wardrobe.evaluate(el => {
        const box = el.getBoundingClientRect();
        const portrait = document.querySelector('#print').getBoundingClientRect();
        const dl = document.querySelector('#download').getBoundingClientRect();
        const hit = document.elementFromPoint(portrait.x + portrait.width/2,portrait.y + portrait.height/2);
        return {
          pinned:document.querySelector('#print').contains(hit) && portrait.top >= document.querySelector('[data-bullen-header]').getBoundingClientRect().bottom - 1,
          wardrobeBelow:box.top >= portrait.bottom,
          scrolled:el.scrollTop>0 && window.scrollY===0,
          downloadVisible:dl.bottom<=innerHeight && dl.top>=el.querySelector('.wardrobe-head').getBoundingClientRect().bottom - 1
        };
      });
      assert.deepEqual(geometry,{pinned:true,wardrobeBelow:true,scrolled:true,downloadVisible:true});
      assert.deepEqual(await portrait.boundingBox(),start);
      await wardrobe.evaluate(el => el.scrollTo(0,0));
    }
    const open = async group => {
      const toggle = p.locator('[data-category="'+group+'"]');
      if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
    };
    const pick = async (part,id) => {
      await p.locator('[data-group="'+part+'"][data-id="'+id+'"]').click();
      await ready();
    };
    await pick('clothing','white-tee');
    await open('fur'); await pick('fur','brown');
    await open('horns'); await pick('horns','white');
    await open('accessories'); await pick('eyewear','black-glasses'); await pick('headwear','grey-beanie');
    const history = await p.evaluate(() => window.fittingMotion);
    if (reduced) assert.deepEqual(history,[]);
    else {
      for (const part of ['clothing','eyewear','headwear']) {
        const swaps = history.filter(a=>a.part===part);
        assert.equal(swaps.length,1,part+' uses one shared animation');
        const swap = swaps[0];
        assert.deepEqual(swap.keys,['transform']);
        assert.match(swap.travel[1],/^translateX\(-?100%\)$/);
        for (const sample of swap.positions) for (const face of sample) {
          assert.equal(face.opacity,'1');
          assert.equal(face.clip,'none');
        }
      }
      const [start,mid,end] = history.find(a=>a.part==='clothing').positions;
      const near = (a,b) => Math.abs(a-b)<.003;
      assert(near(start[0].x,0) && near(Math.abs(start[1].x),1));
      assert(near(Math.abs(mid[0].x-mid[1].x),1) && Math.abs(mid[0].x)>.05 && Math.abs(mid[0].x)<.95);
      assert(near(Math.abs(end[0].x),1) && near(end[1].x,0));
      for (const part of ['fur','horns']) {
        assert(history.some(a=>a.part===part&&a.keys.includes('opacity')),part);
        assert(!history.some(a=>a.part===part&&a.keys.includes('transform')),part);
      }
      assert(!history.some(a=>['background','eyes'].includes(a.part)));
    }
    await open('clothing');
    await p.evaluate(() => {
      for(const id of ['grey-turtleneck','black-tee','black-hoodie']) document.querySelector('[data-group=clothing][data-id="'+id+'"]').click();
    });
    await ready();
    assert.match(await p.locator('#print').getAttribute('aria-label'),/Black hoodie/);
    const correct = await p.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1024;
      const c = canvas.getContext('2d',{willReadFrequently:true});
      for(const slot of document.querySelectorAll('[data-layer]')) {
        if(slot.children.length>1) return false;
        for(const image of slot.querySelectorAll('img')) c.drawImage(image,0,0);
      }
      const displayed = new Uint32Array(c.getImageData(0,0,1024,1024).data.buffer);
      const img = await createImageBitmap(await (await fetch(document.getElementById('download').href)).blob());
      c.drawImage(img,0,0);
      const exported = new Uint32Array(c.getImageData(0,0,1024,1024).data.buffer);
      return img.width===1024 && img.height===1024 && displayed.every((v,i)=>v===exported[i]);
    });
    assert(correct,'Every exported pixel matches the displayed layers');
    await p.locator('.crop-switch [data-crop=avatar]').click();
    assert.equal(await p.locator('#print').getAttribute('data-crop'),'avatar');
    const received = p.waitForEvent('download');
    await p.locator('#download').click();
    assert.equal((await received).suggestedFilename(),'bullenciaga-brown-champagne-gold.png');
    await p.locator('#shuffle').click(); await ready();
    assert.deepEqual(errors,[]);
    console.log(width+'px, correct layers and motion, matching PNG, crop, shuffle and Community link passed.');
    await ctx.close();
  }
} finally { await browser.close(); }
