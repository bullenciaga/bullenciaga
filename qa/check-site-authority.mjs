import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const site = path.join(root, 'site');
const expectedIndexHash = 'dac6eacff29a032730fd0feb1c7ecee084cad14348736701e182cde0911e7782';
const prohibited = ['.DS_Store', 'index.html.bak', 'make-prize-reel.sh', 't_devfilter.mjs', 'proof.html'];
const required = [
  'index.html', '_redirects', 'stats.html', 'chart.html', 'curve.html',
  'transparency.html', 'whitepaper.pdf',
  'bullen-ui.css', 'bullen-ui.js', 'giveaways.html', 'giveaways.json',
  'objects.html', 'objects.css', 'objects.js', 'bullen-wallet-chooser.js',
  'tape.html', 'favicons/tape.svg',
  'patchnotes.html', 'patchnotes-001.html', 'house-record.css', 'favicons/patchnotes.svg', 'lock.html', 'favicons/lock.svg',
  'ledger.html', 'favicons/ledger.svg', 'house-ledger.js', 'ledger-preview.json',
  'passport.html', 'favicons/passport.svg', 'wallet-passport.js', 'house-intelligence.css',
  'house-burn-registry.js', 'market-surfaces.css', 'mobile-buy.css', 'mobile-buy.js',
  'giveaway-snapshot-2.json', 'giveaway-result-2.json',
];
const failures = [];

const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(site, 'index.html'))).digest('hex');
if (hash !== expectedIndexHash) failures.push(`index.html hash ${hash} does not match production authority`);
for (const name of required) if (!fs.existsSync(path.join(site, name))) failures.push(`missing site/${name}`);
for (const name of prohibited) if (fs.existsSync(path.join(site, name))) failures.push(`prohibited internal file site/${name}`);

const htmlFiles = fs.readdirSync(site).filter(name => name.endsWith('.html'));
const localAsset = /(?:src|href)=["'](?!https?:|data:|#|\/\/|mailto:|javascript:)([^"'?#]+)(?:[?#][^"']*)?["']/gi;
for (const name of htmlFiles) {
  const text = fs.readFileSync(path.join(site, name), 'utf8');
  for (const match of text.matchAll(localAsset)) {
    const ref = match[1].replace(/^\.\//, '').replace(/^\//, '');
    // Dynamic template expressions are resolved by the page at runtime and are
    // not static asset paths that can be verified on disk.
    if (ref.includes('${')) continue;
    if (!ref || ref.endsWith('/') || !path.extname(ref)) continue;
    if (!fs.existsSync(path.join(site, ref))) failures.push(`${name} references missing ${ref}`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`site authority: ok (${htmlFiles.length} HTML files)`);
