import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const site = new URL('../site/', import.meta.url);
const read = path => readFileSync(new URL(path, site), 'utf8');
const root = 'assets/dev/2026-09-28/';
const record = JSON.parse(read(`${root}record.json`));
const html = read('dev.html');
const receipts = name => read(`${root}${name}.csv`).trim().split(/\r?\n/).slice(1).map(line => {
  const [utc, amount, raw, category, signature, explorer] = line.split(',');
  assert(utc.endsWith(' UTC'), 'Every receipt must have an explicit UTC date');
  assert.equal(BigInt(amount.replace('.', '')), BigInt(raw), 'Display amount must exactly match raw six-decimal token units');
  assert.match(amount, /^\d+\.\d{6}$/);
  assert.equal(explorer, `https://solscan.io/tx/${signature}`);
  assert(html.includes(`href="${explorer}"`), 'Every CSV receipt must be inspectable on the page');
  return { raw: BigInt(raw), category, signature };
});
const sum = rows => rows.reduce((total, row) => total + row.raw, 0n);
const direct = receipts('direct-burns');
const deposits = receipts('dev-mint-deposits');
const shared = receipts('shared-escrow-burns');
assert.equal(direct.length, 78);
assert.equal(deposits.length, 92);
assert.equal(shared.length, 232);
for (const rows of [direct, deposits, shared]) assert.equal(new Set(rows.map(r => r.signature)).size, rows.length, 'No duplicate transaction in a receipt category');
assert.equal(sum(direct), BigInt(record.directBurnRaw));
assert.equal(sum(deposits), BigInt(record.devMintContributionRaw));
assert.equal(sum(shared), BigInt(record.allSharedEscrowBurnRaw));
assert.equal(sum(direct.filter(r => r.category === 'Scheduled milestone')), 12_500_000_000_000n);
assert.equal(sum(direct.filter(r => r.category === 'Other direct burn')), BigInt(record.otherDirectBurnRaw));
assert.equal(sum(direct) + sum(deposits), BigInt(record.devOriginUltimatelyBurnedRaw), 'Developer-origin total counts deposits once, not the entire shared escrow');
assert.equal(sum(direct) + sum(shared), BigInt(record.burnsSignedDirectAndSharedRaw));
assert.equal(record.asOf, '2026-09-28T13:24:30Z');
assert.equal(record.status, 'VERIFIED_SNAPSHOT');
assert.equal(record.decimals, 6);
assert.equal(record.escrowBalance, '0');
assert.equal((html.match(/<section\b/g) ?? []).length, 3);
assert.equal((html.match(/<tbody>/g) ?? []).length, 3);
assert.equal((html.match(/<tr>/g) ?? []).length - 3, 402);
assert.match(html, /Figures below are fixed to this review, not a live feed/);
assert.match(html, /not a cross-wallet audit/);
assert.match(html, /not a total of the dev’s personal purchases/);
assert.doesNotMatch(html, /draft|owner review|unpublished|template|__\w+__/i);
assert.deepEqual([...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map(match => match[1]), ['/bullen-focus.js', '/bullen-navigation.js']);
assert.match(html, /rel="canonical" href="https:\/\/bullenciaga.com\/dev"/);
const cover = html.match(/property="og:image" content="https:\/\/bullenciaga.com(\/assets\/social\/dev-[a-f0-9]+\.png)"/)[1];
assert(html.includes(`name="twitter:image" content="https://bullenciaga.com${cover}"`));
const png = readFileSync(new URL(cover.slice(1), site));
assert.equal(png.readUInt32BE(16), 1200);
assert.equal(png.readUInt32BE(20), 630);
assert(png.byteLength < 2_000_000);
// The owner-approved Edition 006 links the record. It stays out of the homepage and shared navigation.
for (const name of readdirSync(site).filter(name => /\.(html|js)$/.test(name) && !['dev.html', 'patchnotes.html'].includes(name))) {
  assert.doesNotMatch(read(name), /(?:href\s*[=:]\s*["'`]https:\/\/bullenciaga.com\/dev(?:["'`#?])|href\s*[=:]\s*["'`]\/dev(?:["'`#?]))/, `${name} must not link to /dev`);
}
console.log('Developer record: exact receipt totals, scope, share card and restricted editorial link verified.');
