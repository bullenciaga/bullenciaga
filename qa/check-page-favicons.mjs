import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = path.join(root, 'site');
const pages = new Map([
  ['index.html', 'home.svg'],
  ['giveaways.html', 'giveaways.svg'],
  ['stats.html', 'stats.svg'],
  ['chart.html', 'chart.svg'],
  ['curve.html', 'curve.svg'],
  ['refer.html', 'refer.svg'],
  ['thedrop.html', 'thedrop.svg'],
]);

const references = new Set();

for (const [page, icon] of pages) {
  const html = fs.readFileSync(path.join(site, page), 'utf8');
  const href = `/favicons/${icon}`;
  assert.match(
    html,
    new RegExp(`<link\\s+rel=["']icon["']\\s+type=["']image/svg\\+xml["']\\s+sizes=["']any["']\\s+href=["']${href.replace('/', '\\/')}["']>`),
    `${page} must declare ${href} as its SVG favicon`,
  );
  references.add(href);

  const svg = fs.readFileSync(path.join(site, 'favicons', icon), 'utf8');
  assert.match(svg, /^<svg\b/);
  assert.match(svg, /viewBox="0 0 64 64"/);
  assert.match(svg, /fill="#050505"/);
  assert.match(svg, /#c7a869/);
  assert.match(svg, /#f5f3ee/);
  assert.doesNotMatch(svg, /<(?:script|image|text)\b/i);
  assert.doesNotMatch(svg, /(?:href|src)="https?:/i);
}

assert.equal(references.size, pages.size, 'every page must use a unique favicon');
console.log(`page favicons: ok (${pages.size} unique icons)`);
