import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const site = path.join(root, 'site');
const files = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.name !== 'SHA256SUMS.txt') files.push(file);
  }
}

walk(site);
const lines = files.map(file => {
  const digest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  return `${digest}  ${path.relative(site, file)}`;
});
fs.writeFileSync(path.join(site, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`);
console.log(`wrote ${lines.length} hashes`);
