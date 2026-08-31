import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const pages = {
  'stats.html': 'market-stats',
  'tape.html': 'market-tape',
  'chart.html': 'market-chart',
  'curve.html': 'market-curve',
};

for (const [name, className] of Object.entries(pages)) {
  const html = fs.readFileSync(path.join(root, 'site', name), 'utf8');
  if (!html.includes('href="/market-surfaces.css"')) {
    throw new Error(`${name} is missing the shared market stylesheet`);
  }
  if (!html.match(new RegExp(`<body[^>]*\\b${className}\\b`))) {
    throw new Error(`${name} is missing ${className} on body`);
  }
}

const chart = fs.readFileSync(path.join(root, 'site', 'chart.html'), 'utf8');
if (!chart.includes('class="market-chart-shell"')) {
  throw new Error('chart.html is missing the shared 1440px chart shell');
}

const index = fs.readFileSync(path.join(root, 'site', 'index.html'), 'utf8');
if (!index.includes('class="market-home"') || !index.includes('href="/market-surfaces.css"')) {
  throw new Error('index.html burn module is not opted into the shared market language');
}

const tape = fs.readFileSync(path.join(root, 'site', 'tape.html'), 'utf8');
if (!tape.includes('flex:1 0 auto')) {
  throw new Error('Tape market rail must grow to the Live Prints baseline without shrinking on short windows');
}

const css = fs.readFileSync(path.join(root, 'site', 'market-surfaces.css'), 'utf8');
for (const selector of ['.market-stats', '.market-tape', '.market-chart', '.market-curve', '.market-home']) {
  if (!css.includes(selector)) throw new Error(`shared stylesheet is missing ${selector}`);
}
if (!css.includes('--market-home-burn-shell: 920px')) {
  throw new Error('home burn module must retain its compact 920px main-page rail');
}
if (!css.includes('@media (min-width: 981px) and (min-height: 860px)')) {
  throw new Error('Stats must reserve its expanded tier treatment for tall desktop canvases');
}
if (!css.includes('font-size: clamp(14px, 1vw, 20px)')
    || !css.includes('font-size: clamp(12px, 0.82vw, 16px)')) {
  throw new Error('Expanded Stats tiers must scale their typography with the taller desktop rows');
}
if (!css.includes('grid-template-columns: minmax(0, 1.32fr) minmax(460px, 1fr)')) {
  throw new Error('Stats must reserve a readable desktop rail for Recent Mints');
}
if (!css.includes('grid-template-columns: auto minmax(0, 1fr) auto')
    || !css.includes('white-space: normal')) {
  throw new Error('Recent Mint rows must preserve full NFT names between the image and category badge');
}

console.log('market surfaces: shared shell and scoped page hooks verified');
