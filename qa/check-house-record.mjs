import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const read = name => fs.readFileSync(new URL(`../site/${name}`, import.meta.url), 'utf8');
const current = read('patchnotes.html');
const archive = read('patchnotes-001.html');
const archive002 = read('patchnotes-002.html');
const archive003 = read('patchnotes-003.html');
const archive004 = read('patchnotes-004.html');
const originalBody = archive.slice(archive.indexOf('  <section class="hero">'), archive.indexOf('  <footer'));
assert.equal(createHash('sha256').update(originalBody).digest('hex'),
  '6ea46dbd3c313fcd51b4830ec733bfa7aa804b0dc310181ed709bcd012f48c11',
  'Edition 001 release text and layout must remain intact');
assert.equal(createHash('sha256').update(archive002.slice(archive002.indexOf('  <section class="hero"'), archive002.indexOf('  <footer'))).digest('hex'), '9bde9dc85451aed2698a6dde37fa42025a83d49273d2717418c89272a33b742e', 'Edition 002 article must remain intact');
assert.equal(createHash('sha256').update(archive003.slice(archive003.indexOf('  <section class="hero"'), archive003.indexOf('  <footer'))).digest('hex'), 'fa0ded96869e1f5ce56f821d370e92d5ad1cec95391f8df42bdb90aecef9e6c9', 'Edition 003 article must remain intact');
assert.match(current, /Public edition 005/);
assert.match(current, /Published 21 September 2026/);
assert.match(current, /href="\/patchnotes-001"/);
assert.match(archive002, /live-stream access and end-to-end delivery remain to be verified/i);
assert.match(archive, /class="record-archive-notice"/);
assert.match(archive, /f='patchnotes'/, 'Archive must retain House Record shared-shell identity');
assert.match(archive, /href="\/patchnotes"/);
for (const [source, canonical] of [[current, 'patchnotes'], [archive, 'patchnotes-001'], [archive002, 'patchnotes-002'], [archive003, 'patchnotes-003'], [archive004, 'patchnotes-004']]) {
  assert(source.includes(`<link rel="canonical" href="https://bullenciaga.com/${canonical}">`));
  assert(source.includes(`<meta property="og:url" content="https://bullenciaga.com/${canonical}">`));
  assert(source.includes('href="/favicons/patchnotes.svg"'));
  assert(source.includes('href="/house-record.css"'));
  const ids = [...source.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size, 'No duplicate IDs');
  for (const [, hash] of source.matchAll(/href="#([^"]+)"/g)) assert(ids.includes(hash), `Missing anchor ${hash}`);
  for (const [, route] of source.matchAll(/href="(\/(?!\/)[^"#?]*)/g)) {
    if (!route || route === '/') continue;
    const asset = route.includes('.') ? route.slice(1) : `${route.slice(1)}.html`;
    const redirects = fs.readFileSync(new URL('../site/_redirects', import.meta.url), 'utf8').split('\n').map(line => line.trim().split(/\s+/)[0]);
    assert(fs.existsSync(new URL(`../site/${asset}`, import.meta.url)) || redirects.includes(route), `Missing linked page ${route}`);
  }
}
for (const href of ['/ledger', '/passport', 'https://bullensaga.com/registrar',
  'https://gravemarket.io/creators/bullenciaga', 'https://gravemarket.io/collection/bullenciaga',
  'https://gravemarket.io/collection/bullenciaga-house-objects',
  'https://gravemarket.io/collection/bullensaga-founding-records', 'https://bullensaga.com/preorder']) {
  assert(archive002.includes(`href="${href}"`), `Missing public destination ${href}`);
}
for (const href of ['/buy', '/lock', '/ledger', '/whitepaper.pdf', '/giveaways#follow500', 'https://bullenciaga.com/#gallery', 'https://bullensaga.com/case', 'https://bullensaga.com/funding', 'https://bullenciaga.com/discord']) assert(archive004.includes(`href="${href}"`), `Missing edition 004 destination ${href}`);
assert.match(archive004, /not the actual gameplay or a playable demo/);
for (const source of [current, archive, archive002, archive003, archive004]) {
  assert(source.includes('src="/house-record.js"'));
  assert(source.includes('<details class="record-picker">'));
  for (const route of ['/patchnotes', '/patchnotes-004', '/patchnotes-003', '/patchnotes-002', '/patchnotes-001']) assert(source.includes(`href="${route}"`));
  assert(source.includes('aria-current="page"'));
}
assert.doesNotMatch(current, /href="[^"]*(?:delivery|admin|shares|control-room)[^"]*"/i, 'Private operator surfaces must not be linked');
const shared = read('bullen-ui.css');
const mobile = shared.slice(shared.indexOf('@media (max-width: 820px)'));
assert.match(mobile, /\.bullen-site-shell \.jumpto-btn \{[\s\S]*?width: 112px;[\s\S]*?padding: 10px 14px;[\s\S]*?font-size: 11px;/);
assert.doesNotMatch(shared.slice(0, shared.indexOf('@media (max-width: 820px)')), /width: 112px;/,
  'Wider Jump To must be mobile-only');
console.log('House Record: current edition, immutable 001/002/003/004 release bodies, archive navigation, public links, mobile-only control: ok');

const body004 = archive004.slice(archive004.indexOf('  <section class="hero"'), archive004.indexOf('  <footer')).replace(/<details class="record-picker">[\s\S]*?<\/details>/g, '');
assert.equal(createHash('sha256').update(body004).digest('hex'), '3b6ba42bc86eef8fd575baee4fa6fcec5a92a910d9255f27883281b95900ed09', 'Edition 004 release prose/layout must remain intact; archive navigation may evolve');
for (const href of ['/rooms', '/refer', '/objects', '/passport', '/raiders', '/giveaways', '/#gallery']) assert(current.includes(`href="${href}"`));
assert.match(current, /Ledger compatibility is new and needs more testing across wallets and devices/);
assert.match(current, /Older collection gaps remain disclosed/);
const currentArticle = current.slice(current.indexOf('  <section class="hero"'), current.indexOf('  <section class="record-archive"'));
assert.doesNotMatch(currentArticle, /on display\.|ondisplay|BULLENSAGA|bullensaga/);
