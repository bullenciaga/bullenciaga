import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../site/deepdive.js', import.meta.url), 'utf8');
const historical = JSON.parse(fs.readFileSync(new URL('../site/deepdive-snapshot.json', import.meta.url), 'utf8'));
const now = Date.parse('2026-10-06T17:00:00Z');
const fresh = { ...historical, asOf: new Date(now - 60000).toISOString(), slot: historical.slot + 100, holdersAtLeastOne: 1234 };
const current = { ...fresh, asOf: new Date(now).toISOString(), slot: fresh.slot + 100, holdersAtLeastOne: 1235 };

function page() {
  const nodes = new Map();
  const replies = [];
  function node(id) {
    if (!nodes.has(id)) {
      const classes = new Set();
      nodes.set(id, {
        textContent: '', innerHTML: '', disabled: true,
        setAttribute() {}, addEventListener() {},
        classList: {
          toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); },
          contains(name) { return classes.has(name); },
        },
      });
    }
    return nodes.get(id);
  }
  class FixedDate extends Date { static now() { return now; } }
  const context = vm.createContext({
    Date: FixedDate, Intl, AbortSignal,
    document: { getElementById: node, querySelectorAll: () => [], addEventListener() {} },
    setInterval() {},
    fetch: async url => {
      assert.ok(replies.length, `Unexpected request: ${url}`);
      const reply = replies.shift();
      assert.equal(url, reply.url);
      if (reply.error) throw reply.error;
      return { ok: reply.ok !== false, json: async () => structuredClone(reply.data) };
    },
  });
  // Exercise the real loader and renderer, driving refreshes explicitly instead of browser timers.
  assert.match(source, /^loadSnapshot\(\);loadMarket\(\);$/m);
  vm.runInContext(source.replace(/^loadSnapshot\(\);loadMarket\(\);$/m, '') + '\nglobalThis.refresh = loadSnapshot;', context);
  return {
    node,
    async refresh(...responses) {
      replies.push(...responses);
      await context.refresh();
      assert.equal(replies.length, 0, 'Every expected request must be consumed');
    },
  };
}

const live = data => ({ url: '/supply/deepdive', data });
const unavailable = { url: '/supply/deepdive', ok: false };
const p = page();
await p.refresh(live(fresh));
assert.match(p.node('snapshot-status').textContent, /^Live holder data/);
assert.equal(p.node('snapshot-status').classList.contains('stale'), false);
const priorProof = p.node('proof').innerHTML;
const priorCount = p.node('holder-count').textContent;

// A configuration-change 503 must immediately relabel even a one-minute-old in-memory snapshot.
await p.refresh(unavailable);
assert.match(p.node('snapshot-status').textContent, /^Last verified holder data/);
assert.match(p.node('snapshot-status').textContent, /Update delayed/);
assert.equal(p.node('snapshot-status').classList.contains('stale'), true);
assert.equal(p.node('proof').innerHTML, priorProof, 'Keep the dated proof of the retained observation');
assert.equal(p.node('holder-count').textContent, priorCount, 'Keep the last verified data on refresh failure');

// An older successful response cannot clear the failed-refresh warning or replace newer data.
await p.refresh(live({ ...fresh, asOf: new Date(now - 120000).toISOString(), holdersAtLeastOne: 1 }));
assert.match(p.node('snapshot-status').textContent, /^Last verified holder data/);
assert.equal(p.node('holder-count').textContent, priorCount);

await p.refresh(live(current));
assert.match(p.node('snapshot-status').textContent, /^Live holder data/);
assert.doesNotMatch(p.node('snapshot-status').textContent, /Update delayed/);
assert.equal(p.node('snapshot-status').classList.contains('stale'), false);
assert.equal(p.node('holder-count').textContent, '1,235');
assert.match(p.node('proof').innerHTML, new RegExp(String(current.slot)));

await p.refresh(live({ ok: true, schemaVersion: 99 }));
assert.match(p.node('snapshot-status').textContent, /^Last verified holder data/);
assert.equal(p.node('holder-count').textContent, '1,235');
await p.refresh(live(current));
assert.match(p.node('snapshot-status').textContent, /^Live holder data/);
assert.equal(p.node('snapshot-status').classList.contains('stale'), false);

const fallback = page();
await fallback.refresh(unavailable, { url: '/deepdive-snapshot.json', data: historical });
assert.match(fallback.node('snapshot-status').textContent, /^Saved snapshot/);
assert.equal(fallback.node('snapshot-status').classList.contains('stale'), true);
assert.match(fallback.node('proof').innerHTML, new RegExp(String(historical.slot)));
await fallback.refresh(unavailable);
assert.match(fallback.node('snapshot-status').textContent, /^Saved snapshot/);
await fallback.refresh(live(current));
assert.match(fallback.node('snapshot-status').textContent, /^Live holder data/);
assert.equal(fallback.node('snapshot-status').classList.contains('stale'), false);

console.log('Deep Dive freshness: failed refresh retains dated data, immediately labels last verified, and recovers only with an accepted live snapshot; saved fallback preserved');
