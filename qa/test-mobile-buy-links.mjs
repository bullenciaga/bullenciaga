import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const site = new URL('../site/', import.meta.url);
const read = name => fs.readFileSync(new URL(name, site), 'utf8');
const mint = 'BULLENxRbvuwjo4DLBKBbh23cNQ4ZbpDeQKuoVXL7exN';
const sol = 'So11111111111111111111111111111111111111112';
const expected = `https://jup.ag/swap?buy=${mint}&sell=${sol}`;

// Tiny DOM fixture: exercise the actual shared click handlers without a wallet.
class Element {
  children = [];
  selectors = new Map();
  handlers = new Map();
  classList = { add() {}, remove() {} };
  setAttribute() {}
  addEventListener(type, handler) { this.handlers.set(type, handler); }
  append(...children) { this.children.push(...children); }
  replaceChildren() { this.children = []; }
  querySelector(selector) {
    if (!this.selectors.has(selector)) this.selectors.set(selector, new Element());
    return this.selectors.get(selector);
  }
  focus() {}
  click() { this.handlers.get('click')(); }
}
const body = new Element();
const navigations = [];
const window = {
  innerWidth: 390,
  location: { assign: url => navigations.push(url) },
  requestAnimationFrame: fn => fn(),
  setTimeout() {},
  matchMedia: () => ({ matches: false }),
};
vm.runInNewContext(read('mobile-buy.js'), {
  window,
  navigator: { userAgent: '', maxTouchPoints: 0 },
  document: { body, activeElement: null, createElement: () => new Element(), addEventListener() {} },
  HTMLElement: Element,
});
const picker = window.BullenMobileBuy;
assert.equal(picker.jupiterSwapUrl(mint), expected);
assert.equal(picker.request(null), false);
assert.equal(picker.request({}), false);
assert.equal(body.children.length, 0);

// Cached callers may still provide the old broken URL or an incorrect pair.
// The public contract mint, not that caller URL, must select the buy token.
for (const jupiterUrl of [undefined, `https://jup.ag/swap/SOL-${mint}`, 'https://jup.ag/swap?buy=USDC']) {
  assert.equal(picker.request({ mint, jupiterUrl }), true);
  assert.equal(navigations.length, 0, 'opening a modal must never launch a wallet');
  const root = body.children[0];
  assert.equal(root.querySelector('[data-buy-jupiter]').href, expected);
  const choices = root.querySelector('.bullen-mobile-buy__choices').children;
  assert.equal(choices.length, 3, 'one Solflare choice alongside Phantom and the embedded swap');
  assert.equal(choices.filter(choice => choice.innerHTML.includes('<strong>Solflare</strong>')).length, 1);
  assert(choices[1].innerHTML.includes('tap Buy to swap'), 'native route must disclose the extra tap');
  choices[1].click();
  assert.equal(navigations.pop(), `https://www.solflare.com/prices/bullenciaga/${mint}/`);
  choices[0].click();
  const phantom = new URL(navigations.pop());
  assert.equal(phantom.origin, 'https://phantom.app');
  assert.equal(phantom.searchParams.get('buy'), 'solana:101/address:' + mint);
}
assert.equal(body.children.length, 1, 'reuse the same canonical modal');
window.innerWidth = 1440;
assert.equal(picker.request({ mint }), false, 'desktop continues using the existing embedded swap');

// Every page-level and JavaScript-disabled fallback must use the same pair.
for (const name of ['index.html', 'tape.html', 'thedrop-buy.js', 'patchnotes.html', 'patchnotes-001.html']) {
  const source = read(name);
  const expression = source.match(/const JUPITER_FALLBACK = (.*);/)[1];
  const fallback = vm.runInNewContext(expression, { CONFIG: { TOKEN_ADDRESS: mint }, BULLEN_MINT: mint, SOL_MINT: sol });
  assert.equal(fallback, expected, `${name}: incorrect fallback pair`);
}
assert(read('thedrop.html').includes(`href="${expected.replace('&', '&amp;')}"`));
for (const name of fs.readdirSync(site).filter(name => /\.(html|js)$/.test(name))) {
  assert(!read(name).includes('https://jup.ag/swap/SOL-'), `${name}: obsolete Jupiter route`);
}
console.log('Buy links: exactly one native Solflare route, all Jupiter fallbacks, stale callers and Phantom unchanged: ok');
