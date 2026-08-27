import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const site = path.join(root, 'site');
const prefixes = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'API_ROUTE_PREFIXES.json'), 'utf8'));
const allowedData = new Set([
  'giveaways.json',
  'giveaway-result-0.json',
  'giveaway-result-1.json',
  'giveaway-result-2.json',
  'giveaway-snapshot-0.json',
  'giveaway-snapshot-1.json',
  'giveaway-snapshot-2.json',
]);
const failures = [];

for (const name of fs.readdirSync(site)) {
  if (allowedData.has(name)) continue;
  const stem = name.toLowerCase().replace(/\..*$/, '');
  for (const prefix of prefixes) {
    if (stem === prefix || stem.startsWith(`${prefix}-`) || stem.startsWith(`${prefix}_`)) {
      failures.push(`site/${name} collides with Worker route prefix ${prefix}`);
    }
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('static/API route boundary: ok');
