import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const site = path.join(root, 'site');
const htmlFiles = fs.readdirSync(site).filter(name => name.endsWith('.html'));
const failures = [];

for (const name of htmlFiles) {
  const html = fs.readFileSync(path.join(site, name), 'utf8');
  if (!html.includes('href="/bullen-ui.css')) continue;

  const bootAt = html.indexOf('__BULLEN_BOOT_TIMER');
  const sharedCssAt = html.indexOf('href="/bullen-ui.css');
  if (bootAt < 0 || bootAt > sharedCssAt) {
    failures.push(`${name} must establish page identity before the shared stylesheet`);
  }
  if (!html.includes('fonts.googleapis.com/css2?family=Poppins') || !html.includes('family=Space+Mono')) {
    failures.push(`${name} must load the shared House fonts directly`);
  }
  if (!html.includes('src="/bullen-ui.js')) {
    failures.push(`${name} is missing the shared shell script`);
  }
}

const css = fs.readFileSync(path.join(site, 'bullen-ui.css'), 'utf8');
if (css.includes('@import')) failures.push('bullen-ui.css must not defer font discovery through @import');
for (const required of [
  'html.bullen-booting body',
  'html.bullen-ready body',
  'html[data-bullen-page]:not([data-bullen-page="index"]) body:not(.transparent)',
  '.bullen-site-aux:empty { display: none; }',
]) {
  if (!css.includes(required)) failures.push(`bullen-ui.css is missing ${required}`);
}

const js = fs.readFileSync(path.join(site, 'bullen-ui.js'), 'utf8');
for (const required of ['document.fonts.ready', "hint.rel = 'prefetch'", "root.classList.add('bullen-ready')"]) {
  if (!js.includes(required)) failures.push(`bullen-ui.js is missing ${required}`);
}

const stats = fs.readFileSync(path.join(site, 'stats.html'), 'utf8');
if (stats.includes('█')) failures.push('stats.html must never paint block-character token placeholders');
const bootStart = stats.indexOf('async function boot()');
const reserveAt = stats.indexOf('paintVolume(0);', bootStart);
const firstAwait = stats.indexOf('await ', bootStart);
if (reserveAt < 0 || firstAwait < 0 || reserveAt > firstAwait) {
  failures.push('stats.html must reserve the static burn schedule before its first network await');
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`first paint: ${htmlFiles.length} page shells stabilize before reveal`);
