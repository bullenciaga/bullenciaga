import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../site/thedrop.html', import.meta.url), 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
const nodes = new Map();
function element() {
  return { hidden: true, textContent: '', innerHTML: '', children: [],
    appendChild(child) { this.children.push(child); },
    setAttribute() {}, removeAttribute() {}, addEventListener() {} };
}
for (const id of [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1])) nodes.set(id, element());
let refresh, unavailable = false;
let payload = { ok: true, round: 1, verified: true, accountingStatus: 'verified',
  potSol: 2.41, targetSol: 2.5, pct: 96.4, entrySol: .25, share: .25,
  wallets: 10, tickets: 100, contributions: [] };
vm.runInNewContext(script, {
  document: { getElementById: id => nodes.get(id), createElement: element },
  navigator: {}, setTimeout() {}, setInterval(fn) { refresh = fn; },
  fetch: async () => { if (unavailable) throw Error('offline'); return { json: async () => payload }; },
});
const flush = () => new Promise(resolve => setImmediate(resolve));
await flush();
assert.equal(nodes.get('pct').textContent, '96.40%');
assert.match(nodes.get('funding-rule').textContent, /10\.00 SOL.*25%.*2\.50 SOL/);
assert.equal(nodes.get('funding-rule').hidden, false);
assert.equal(nodes.get('next-funding-rule').hidden, true, 'compatible with API before rollout');
payload.nextRoundFunding = { round: 2, feeTargetSol: 20, targetSol: 2.5, share: .125 };
refresh(); await flush();
assert.equal(nodes.get('next-funding-rule').hidden, false);
assert.match(nodes.get('next-funding-rule').textContent, /from round 2: 20\.00 SOL.*prize stays 2\.50 SOL/);
assert.equal(nodes.get('pct').textContent, '96.40%', 'pending terms never reprice current progress');
payload = { ...payload, round: 2, share: .125, potSol: 0, pct: 0, wallets: 0, tickets: 0, nextRoundFunding: null };
refresh(); await flush();
assert.match(nodes.get('funding-rule').textContent, /20\.00 SOL.*12\.5%.*2\.50 SOL/);
assert.equal(nodes.get('next-funding-rule').hidden, true);
assert.equal(nodes.get('pct').textContent, '0.00%');
assert.equal(nodes.get('unit').textContent, '0.25');
assert.equal(nodes.get('ledeprize').textContent, '2.50 SOL');
payload = { ...payload, share: 0, nextRoundFunding: { round: 9, feeTargetSol: 20, targetSol: 2.5 } };
refresh(); await flush();
assert.equal(nodes.get('funding-rule').hidden, true, 'invalid fee target does not produce Infinity');
assert.equal(nodes.get('next-funding-rule').hidden, true, 'mismatched next-round terms stay hidden');
unavailable = true; refresh(); await flush();
assert.equal(nodes.get('pct').textContent, '—');
assert.equal(nodes.get('funding-rule').hidden, true);
assert.equal(nodes.get('next-funding-rule').hidden, true);
console.log('Drop funding: legacy API, pending policy, rollover, entry/prize preservation and unavailable state passed');
