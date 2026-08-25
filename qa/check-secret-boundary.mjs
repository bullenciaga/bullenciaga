import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const ignored = new Set(['.git', 'node_modules']);
const suspiciousNames = [/(^|\.)env($|\.)/i, /keypair.*\.json$/i, /private.*key/i, /seed.*phrase/i, /secrets?\.json$/i];
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
  /\b\d{8,12}:[A-Za-z0-9_-]{35}\b/,
  /Authorization\s*:\s*["']Bearer\s+[A-Za-z0-9_-]{24,}["']/i,
  /(?:CLOUDFLARE_API_TOKEN|TELEGRAM_BOT_TOKEN|HELIUS_API_KEY|ME_API_KEY)\s*=\s*["'][^$][^"']{20,}["']/
];
const textExtensions = new Set(['.html', '.md', '.json', '.js', '.mjs', '.cjs', '.txt', '.yml', '.yaml', '.jsonc', '.toml', '.sh']);
const failures = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const file = path.join(directory, entry.name);
    const relative = path.relative(root, file);
    if (entry.isDirectory()) walk(file);
    else {
      for (const pattern of suspiciousNames) if (pattern.test(entry.name)) failures.push(`suspicious secret filename: ${relative}`);
      if (textExtensions.has(path.extname(entry.name))) {
        const value = fs.readFileSync(file, 'utf8');
        for (const pattern of patterns) if (pattern.test(value)) failures.push(`possible secret in ${relative}: ${pattern}`);
      }
    }
  }
}

walk(root);

// The referral admin page may accept the secret for a single HTTPS request,
// but it must never persist that credential in browser storage. Reading a
// previously persisted value would re-expose it, while removeItem is required
// once to clean up the legacy key shipped by the initial canonical import.
const referralsPath = path.join(root, 'site', 'referrals.html');
const referrals = fs.readFileSync(referralsPath, 'utf8');
if (/(?:localStorage|sessionStorage)\s*\.\s*(?:getItem|setItem)\s*\(/.test(referrals)) {
  failures.push('site/referrals.html must not read or write browser storage');
}
if (!/localStorage\s*\.\s*removeItem\s*\(\s*["']bullen-referral-secret["']\s*\)/.test(referrals)) {
  failures.push('site/referrals.html must remove the legacy persisted admin secret');
}
if (!/window\s*\.\s*addEventListener\s*\(\s*["']pagehide["']\s*,\s*forgetAdminSecret\s*\)/.test(referrals)) {
  failures.push('site/referrals.html must clear the admin secret when leaving the page');
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('secret boundary: ok');
