import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const requiredMint = 'BULLENxRbvuwjo4DLBKBbh23cNQ4ZbpDeQKuoVXL7exN';
const forbidden = [/\bbalenciaga\b/i, /\bbulenciaga\b/i];
const textExtensions = new Set(['.html', '.md', '.json', '.js', '.mjs', '.cjs', '.txt', '.yml', '.yaml', '.jsonc', '.toml']);
const ignored = new Set(['.git', 'node_modules']);
const failures = [];
let mintSeen = false;

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (textExtensions.has(path.extname(entry.name))) {
      const text = fs.readFileSync(file, 'utf8');
      if (text.includes(requiredMint)) mintSeen = true;
      for (const pattern of forbidden) {
        if (pattern.test(text)) failures.push(`${path.relative(root, file)} contains ${pattern}`);
      }
    }
  }
}

walk(root);
if (!mintSeen) failures.push('canonical $BULLEN mint was not found');
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('identity: ok');
