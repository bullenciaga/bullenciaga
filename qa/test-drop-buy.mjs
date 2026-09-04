import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = name => fs.readFileSync(new URL('../site/' + name, import.meta.url), 'utf8');
const script = read('thedrop-buy.js');
const html = read('thedrop.html');
const mint = 'BULLENxRbvuwjo4DLBKBbh23cNQ4ZbpDeQKuoVXL7exN';
const sol = 'So11111111111111111111111111111111111111112';
const fallback = 'https://jup.ag/swap/SOL-' + mint;
for (const asset of ['/mobile-buy.css', '/mobile-buy.js', '/thedrop-buy.js', '/bullen-ui.css', 'https://plugin.jup.ag/plugin-v1.js']) assert(html.includes(asset), asset);
assert(html.indexOf('src="/mobile-buy.js"') < html.indexOf('src="/thedrop-buy.js"'));
assert.match(html, /id="buyBullen"[\s\S]*?href="https:\/\/jup.ag\/swap\/SOL-BULLENx/);
assert(read('bullen-ui.css').includes('--jupiter-plugin-primary: 199, 168, 105'));

function setup({ mobile = false, plugin = true, picker = true, button = true } = {}) {
  const swaps = [], opens = [], choices = []; let handler; let prevented = 0;
  const window = { open: (...args) => opens.push(args) };
  if (plugin) window.Jupiter = { init: options => swaps.push(JSON.parse(JSON.stringify(options))) };
  if (picker) window.BullenMobileBuy = { request: options => { choices.push(options); return mobile; } };
  vm.runInNewContext(script, { window, document: { getElementById: () => button ? { addEventListener: (_, fn) => { handler = fn; } } : null } });
  return { swaps, opens, choices, click: (extra = {}) => handler({ preventDefault: () => prevented++, ...extra }), prevented: () => prevented };
}
const desktop = setup();
assert.equal(desktop.swaps.length, 0, 'never open or connect on page load');
desktop.click();
assert.equal(desktop.prevented(), 1);
assert.equal(desktop.swaps.length, 1);
assert.equal(desktop.opens.length, 0);
const tape = read('tape.html');
let tapeConfig;
new Function('window', 'SOL_MINT', 'BULLEN_MINT', 'JUPITER_FALLBACK', tape.slice(tape.indexOf('  function openJupiterSwap(){'), tape.indexOf('  function openBullenSwap(){')) + '\nopenJupiterSwap();')({ Jupiter: { init: value => tapeConfig = value } }, sol, mint, fallback);
assert.deepEqual(desktop.swaps[0], tapeConfig, 'same desktop modal configuration as The Tape');
const mobile = setup({ mobile: true }); mobile.click();
assert.equal(mobile.swaps.length, 0, 'mobile opens wallet picker first');
assert.equal(mobile.choices[0].mint, mint);
assert.equal(mobile.choices[0].jupiterUrl, fallback);
mobile.choices[0].continueWithJupiter();
assert.deepEqual(mobile.swaps[0], tapeConfig, 'in-wallet continuation retains swap settings');
const unavailable = setup({ plugin: false }); unavailable.click();
assert.deepEqual(unavailable.opens, [[fallback, '_blank', 'noopener,noreferrer']]);
const noPicker = setup({ picker: false }); noPicker.click(); assert.equal(noPicker.swaps.length, 1);
const modifier = setup(); modifier.click({ metaKey: true });
assert.equal(modifier.prevented(), 0); assert.equal(modifier.swaps.length, 0);
setup({ button: false });
console.log('Drop buy flow: shared modal parity, mobile handoff, fallback and navigation checks passed');
