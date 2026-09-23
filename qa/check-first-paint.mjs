import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import crypto from 'node:crypto';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const site = path.join(root, 'site');
const htmlFiles = fs.readdirSync(site).filter(name => name.endsWith('.html'));
const failures = [];
const shellSource = fs.readFileSync(path.join(site, 'bullen-ui.js'), 'utf8').split('  /* Warm same-origin page navigations')[0];
const shellHash = crypto.createHash('sha256').update(shellSource).digest('hex');

for (const name of htmlFiles) {
  const html = fs.readFileSync(path.join(site, name), 'utf8');
  if (!html.includes('href="/bullen-ui.css')) continue;

  if (!html.includes(`data-bullen-shell-source="${shellHash}"`)) failures.push(`${name}: regenerate initial headers after changing the navigation builder`);
  const bodyAt = html.indexOf('<body', html.indexOf('</head>'));
  if (bodyAt < 0) failures.push(`${name}: missing actual document body`);
  const staticShell = html.match(/<!-- BULLEN_SHELL_START[\s\S]*?<!-- BULLEN_SHELL_END -->/g) || [];
  if (staticShell.length !== 1 || !staticShell[0].includes('data-bullen-shell') || !staticShell[0].includes('jumpto-btn')) failures.push(`${name}: finished navigation must be in the initial HTML`);
  const shellAtFirstPaint = html.indexOf('<!-- BULLEN_SHELL_START');
  const firstContent = html.slice(bodyAt).search(/<(?:main|section|article)\b/);
  if (shellAtFirstPaint < bodyAt || (firstContent >= 0 && shellAtFirstPaint > bodyAt + firstContent)) failures.push(`${name}: navigation must precede the page payload`);
  if (html.includes('bullen-crios')) failures.push(`${name}: Chrome must use the approved common reveal speed`);
  if (!html.includes('<style data-bullen-boot>')) failures.push(`${name} must hide the unfinished payload before external CSS arrives`);
  const bootAt = html.indexOf('__BULLEN_BOOT_TIMER');
  const sharedCssAt = html.indexOf('href="/bullen-ui.css');
  if (bootAt < 0 || bootAt > sharedCssAt) {
    failures.push(`${name} must establish page identity before the shared stylesheet`);
  }
  if (!html.includes('data-bullen-fonts') || !/href="\/fonts\/house-fonts(?:-bold|-full)?\.css"/.test(html) || html.includes('fonts.googleapis.com')) {
    failures.push(`${name} must load the shared House fonts directly`);
  }
  if (!html.includes('src="/bullen-ui.js')) {
    failures.push(`${name} is missing the shared shell script`);
  }
  const shellAt = html.indexOf('src="/bullen-ui.js');
  const pluginAt = html.indexOf('src="https://plugin.jup.ag/');
  if (shellAt > html.indexOf('</head>') || (pluginAt >= 0 && shellAt > pluginAt)) {
    failures.push(`${name} must discover the navigation before third-party deferred scripts`);
  }
  if ((html.match(/src="\/bullen-ui\.js"/g) || []).length !== 1) failures.push(`${name} must mount only one shell`);
  if (!html.includes("m?4000:1600") || !html.includes('rel="preload" href="/bullen-ui.css" as="style"')) {
    failures.push(`${name} must reserve the mobile boot window and preload the rail styles`);
  }
}

// Exercise every page's independent fallback, including a stalled shared script.
for (const name of htmlFiles) {
  const html = fs.readFileSync(path.join(site, name), 'utf8');
  const boot = html.match(/<script>([^<]*__BULLEN_BOOT_TIMER[^<]*)<\/script>/)?.[1];
  if (!boot) continue;
  const sheetPath = html.match(/data-bullen-fonts[^>]*href="([^"]+)"/)[1];
  const sheet = fs.readFileSync(path.join(site, sheetPath), 'utf8');
  assert(sheet.includes("font-family: 'Poppins'") && sheet.includes("font-family: 'Space Mono'"));
  for (const [, fontPath, digest] of sheet.matchAll(/url\((\/fonts\/house-([a-f0-9]{16})\.woff2)\)/g)) {
    const bytes = fs.readFileSync(path.join(site, fontPath));
    assert.equal(bytes.subarray(0, 4).toString(), 'wOF2');
    assert(crypto.createHash('sha256').update(bytes).digest('hex').startsWith(digest));
  }
  for (const mobile of [true, false]) {
    for (const outcome of ['ready', 'timeout', 'parsing']) {
      const classes = new Set(), fontLink = { disabled: false }, events = new Map();
      let timeout;
      const document = {
        readyState: outcome === 'parsing' ? 'loading' : 'interactive',
        documentElement: { dataset: {}, classList: {
          add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c),
        } },
        querySelectorAll: () => [fontLink],
        addEventListener: (event, handler) => events.set(event, handler),
      };
      const window = {};
      vm.runInNewContext(boot, {document, window, location: {pathname: '/' + name},
        matchMedia: () => ({matches: mobile}), setTimeout: fn => { timeout = fn; return 1; }, clearTimeout: () => {}});
      assert(classes.has('bullen-booting'));
      if (outcome === 'ready') window.__BULLEN_REVEAL(true);
      else {
        timeout();
        if (outcome === 'parsing') {
          assert(classes.has('bullen-booting'), `${name}: never reveal partially parsed markup`);
          events.get('DOMContentLoaded')();
        }
      }
      assert(classes.has('bullen-ready') && !classes.has('bullen-booting'));
      assert.equal(fontLink.disabled, mobile && outcome !== 'ready');
      window.__BULLEN_REVEAL(outcome !== 'ready');
      assert.equal(fontLink.disabled, mobile && outcome !== 'ready', 'late completion cannot change the chosen font set');
    }
  }
}
for (const license of ['Poppins-OFL.txt', 'SpaceMono-OFL.txt']) {
  assert(fs.readFileSync(path.join(site, 'fonts', license), 'utf8').includes('SIL OPEN FONT LICENSE'));
}

const css = fs.readFileSync(path.join(site, 'bullen-ui.css'), 'utf8');
if (css.includes('@import')) failures.push('bullen-ui.css must not defer font discovery through @import');
for (const required of [
  'html.bullen-booting body > :not(.bullen-site-shell):not(.bullen-skip)',
  'html.bullen-ready body > :not(.bullen-site-shell):not(.bullen-skip)',
  'html[data-bullen-page]:not([data-bullen-page="index"]) body:not(.transparent)',
  '.bullen-site-aux:empty { display: none; }',
  '.bullen-site-shell .jumpto-chevron',
  'flex: 0 0 8px;',
  'width: 8px;',
  'height: 12px;',
]) {
  if (!css.includes(required)) failures.push(`bullen-ui.css is missing ${required}`);
}
if (/html\.bullen-(?:booting|ready) body\s*\{/.test(css)) {
  failures.push('bullen-ui.css must transition page content without fading the fixed navigation shell');
}

const js = fs.readFileSync(path.join(site, 'bullen-ui.js'), 'utf8');
if (!js.includes('mobilePaint ? 2500 : 500') || !js.includes("document.fonts.load('600 12px Poppins')")) {
  failures.push('mobile reveal must wait for the real header faces without changing the desktop font budget');
}
for (const required of ['document.fonts.ready', "hint.rel = 'prefetch'", 'window.__BULLEN_REVEAL(fontsReady)', 'const navigationGroups', "button.innerHTML = 'JUMP TO ", "appendGroup('On BULLENCIAGA'", "mobileDirectory.className = 'bullen-mobile-nav-directory'"]) {
  if (!js.includes(required)) failures.push(`bullen-ui.js is missing ${required}`);
}

const stats = fs.readFileSync(path.join(site, 'stats.html'), 'utf8');
if (stats.includes('█')) failures.push('stats.html must never paint block-character token placeholders');
const bootStart = stats.indexOf('async function boot()');
const reserveAt = stats.indexOf('paintVolume(0);', bootStart);
const firstAwait = stats.indexOf('await ', bootStart);
if (reserveAt < 0 || firstAwait < 0 || reserveAt > firstAwait) {
  failures.push('stats.html must reserve the static burn schedule before its first network await');
}

// Run the real image-entry helper, including BFCache restores. The document
// reveal is already settled on restoration: hiding its photograph again flashes.
const homepage = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
const heroSource = [...homepage.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(source => source.includes("const hero = document.querySelector('.hero-bg')"));
assert(heroSource, 'homepage must retain its decode-gated hero helper');
const microtasks = () => new Promise(resolve => setImmediate(resolve));
const heroHarness = () => {
  const classes = new Set(), frames = [], decodes = [], events = new Map(), imageEvents = new Map();
  const image = {
    complete: false,
    decode: () => new Promise((resolve, reject) => decodes.push({resolve, reject})),
    addEventListener: (name, handler) => {
      if (!imageEvents.has(name)) imageEvents.set(name, new Set());
      imageEvents.get(name).add(handler);
    },
    removeEventListener: (name, handler) => imageEvents.get(name)?.delete(handler),
  };
  const hero = { querySelector: () => image, classList: {
    add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name),
  } };
  vm.runInNewContext(heroSource, {
    document: {querySelector: () => hero}, requestAnimationFrame: handler => frames.push(handler),
    addEventListener: (name, handler) => events.set(name, handler),
  });
  return {
    image, decodes, imageEvents,
    pending: () => classes.has('hero-image-pending'),
    frame: () => frames.splice(0).forEach(handler => handler()),
    restore: persisted => events.get('pageshow')?.({persisted}),
    imageEvent: name => [...(imageEvents.get(name) || [])].forEach(handler => handler()),
  };
};
const finishHeroDecode = async (hero, index) => {
  hero.image.complete = true;
  hero.decodes[index].resolve();
  await microtasks();
  hero.frame();
  hero.frame();
};

const hero = heroHarness();
assert(hero.pending(), 'first entry waits for image decoding');
hero.frame(); hero.frame();
assert(hero.pending(), 'frames alone must not reveal an undecoded image');
hero.restore(false);
assert.equal(hero.decodes.length, 1, 'ordinary pageshow must not restart entry');
await finishHeroDecode(hero, 0);
assert(!hero.pending(), 'decoded image becomes visible');
for (let restore = 0; restore < 3; restore++) {
  hero.restore(true);
  assert(!hero.pending(), 'BFCache must never hide an already-visible hero');
  assert.equal(hero.decodes.length, 1, 'restoring a visible hero needs no new decode');
  await microtasks(); hero.frame(); hero.frame();
  assert(!hero.pending(), 'restored hero remains visible after queued work');
}

const unfinished = heroHarness();
unfinished.restore(true);
assert.equal(unfinished.decodes.length, 2, 'unfinished entry resumes on restore');
await finishHeroDecode(unfinished, 0);
assert(unfinished.pending(), 'stale pre-restoration callback cannot reveal the current entry');
await finishHeroDecode(unfinished, 1);
assert(!unfinished.pending(), 'resumed entry reveals when its decode completes');
unfinished.restore(true);
assert(!unfinished.pending(), 'later restores preserve the completed entry');

for (const outcome of ['load', 'error', 'complete']) {
  const fallback = heroHarness();
  fallback.image.complete = outcome === 'complete';
  fallback.decodes[0].reject(new Error('decode unavailable'));
  await microtasks();
  if (outcome !== 'complete') {
    assert(fallback.pending(), 'failed decode waits for the image load/error fallback');
    assert.equal(fallback.imageEvents.get('load')?.size, 1);
    assert.equal(fallback.imageEvents.get('error')?.size, 1);
    fallback.image.complete = true;
    fallback.imageEvent(outcome);
    await microtasks();
    assert.equal(fallback.imageEvents.get('load').size, 0, 'fallback removes load listener');
    assert.equal(fallback.imageEvents.get('error').size, 0, 'fallback removes error listener');
  }
  fallback.frame(); fallback.frame();
  assert(!fallback.pending(), `${outcome}: settled image must not stay hidden`);
  fallback.restore(true);
  assert(!fallback.pending(), `${outcome}: history restore preserves settled visibility`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`first paint: ${htmlFiles.length} page shells stabilize before reveal; hero entry and history restoration pass`);
