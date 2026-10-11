import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const site = new URL('../site/', import.meta.url);
const html = fs.readFileSync(new URL('giveaways.html', site), 'utf8');
const script = fs.readFileSync(new URL('herd777.js', site), 'utf8');
const record = JSON.parse(fs.readFileSync(new URL('assets/giveaways/herd777/final-awards.json', site)));
const expected = [
 [777, 'BY2cjrXeqMnPkinCLZqkrTyos8njFyUZj1E3wgwXaUum'],
 [703, 'AZos1MFLKjFdny7FZsY8KsFyNJRJyUAYmZuR7VMNrdPA'],
 [159, '5Aa6EBJdaHdo1dvo5Z7S8kqrrAbt3uPGc31FVFXD3A67'],
 [31, 'At6eLYvJEaC65uBD6wTn4std4mSaEFGxs9tkuyu1wPgn'],
 [959, '75TeGJvosQDXcSaze3z3FVieD6RScX64dF3HgAhEm8ib']
];
assert.equal(record.status, 'completed');
assert.deepEqual(record.awards.map(a => [a.position, a.wallet]), expected);
const section = html.split('<article class="campaign h777 h777-completed"')[1].split('</article>')[0];
assert(html.indexOf('id="completed"') < html.indexOf('id="herd777"'));
assert(record.awards.every(a => !('recipient' in a)));
for (const [position, wallet] of expected) {
 const row = section.match(new RegExp(`<li data-prize="${position}">([\\s\\S]*?)</li>`))?.[1];
 assert(row?.includes(`<h4>HERD #${position}</h4>`));
 assert(row.includes(`href="https://solscan.io/account/${wallet}"`));
}
assert(!/hidden|\/herd777-api\/results/.test(section.split('id="h777-winners"')[1].split('</ol>')[0]));
assert(!section.includes('href="/buy"'));
const prizes = JSON.parse(fs.readFileSync(new URL('assets/giveaways/herd777/prizes.json', site))).prizes;
for (const award of record.awards) assert.equal(award.assetId, prizes.find(p => p.number === award.position).assetId);
let handler, response, calls = [], windowEvents = {};
const nodes = Object.fromEntries(['wallet', 'result'].map(id => ['h777-' + id, {value: '', textContent: '', dataset: {}, focus() {}}]));
const button = {disabled: false};
nodes['h777-form'] = {querySelector: () => button, addEventListener: (_, fn) => handler = fn};
vm.runInNewContext(script, {
 document: {getElementById: id => { assert(nodes[id], 'Lookup must never access or replace static final awards'); return nodes[id]; }},
 addEventListener: (type, fn) => windowEvents[type] = fn,
 AbortController, AbortSignal,
 fetch: async url => { calls.push(url); return {ok: true, json: async () => response}; }
});
assert.equal(calls.length, 0, 'Completed page must not poll status');
const wallet = expected[0][1], output = nodes['h777-result'];
const valid = {campaign: 'herd777-250m', ready: true, phase: 'drawn', snapshotHash: record.closingSnapshotHash, observedSlot: 455416504, wallet, entries: '106184', winners: [{position: 777, wallet: 'OriginalDrawMustNotReplaceFinalAwards'}]};
async function submit(value, data = valid) { nodes['h777-wallet'].value = value; response = data; await handler({preventDefault() {}}); }
await submit('bad-address'); assert.equal(calls.length, 0); assert.match(output.textContent, /complete Solana/);
await submit(wallet); assert.equal(output.dataset.result, 'ready'); assert.match(output.textContent, /^106,184 entries recorded at closing/); assert.equal(button.disabled, false);
for (const change of [{phase: 'live'}, {snapshotHash: '0'.repeat(64)}, {wallet: expected[1][1]}, {entries: '-1'}, {observedSlot: 455416505}, {ready: false}]) {
 await submit(wallet, {...valid, ...change}); assert.equal(output.dataset.result, ''); assert.match(output.textContent, /could not be loaded/); assert.equal(button.disabled, false);
}
await submit(wallet, {...valid, entries: '0'}); assert.match(output.textContent, /^0 entries/);
assert(calls.every(url => url === '/herd777-api/entries?wallet=' + wallet));
windowEvents.pagehide(); assert.equal(button.disabled, false);
console.log('HERD777 completed awards: exact owner allocations, prize identity, no polling/overwrites, sealed lookup validation PASS');
