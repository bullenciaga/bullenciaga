// Exercise actual browser animations, interrupted selections and the downloaded image.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.VISUAL_BASE_URL || 'https://fitting-room.test';
const site = path.resolve(import.meta.dirname,'../site');
const browser = await chromium.launch({channel:process.env.CHROME_CHANNEL || 'chrome',headless:true});
try {
  for (const width of [1440,390,320]) {
    const reduced = width === 320;
    const ctx = await browser.newContext({viewport:{width,height:width === 1440 ? 950 : 844},
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
        window.fittingMotion.push({part:this.closest('[data-layer]')?.dataset.layer,keys:Object.keys(frames[0])});
        return animate.call(this,frames,options);
      };
    });
    await p.goto(base + '/tfr');
    const ready = () => p.locator('#download[href]').waitFor();
    await ready();
    await p.evaluate(() => document.fonts.ready);
    assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert(await p.evaluate(() => document.fonts.check('italic 20px "Room Serif"')));
    const community = p.locator('.bullen-header-group').filter({has:p.locator('summary',{hasText:'Community'})});
    assert.equal(await community.getByRole('link',{name:/The Fitting Room/,includeHidden:true}).getAttribute('href'),'/tfr');
    if (process.env.TFR_SCREENSHOTS) {
      await fs.mkdir(process.env.TFR_SCREENSHOTS,{recursive:true});
      await p.screenshot({path:path.join(process.env.TFR_SCREENSHOTS,'fitting-room-'+width+'.png'),fullPage:true});
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
      for (const part of ['clothing','eyewear','headwear']) assert(history.some(a=>a.part===part&&a.keys.includes('transform')),part);
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
