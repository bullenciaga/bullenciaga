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

const css = fs.readFileSync(path.join(root, 'site', 'market-surfaces.css'), 'utf8');
for (const selector of ['.market-stats', '.market-tape', '.market-chart', '.market-curve', '.market-home']) {
  if (!css.includes(selector)) throw new Error(`shared stylesheet is missing ${selector}`);
}

console.log('market surfaces: shared shell and scoped page hooks verified');
