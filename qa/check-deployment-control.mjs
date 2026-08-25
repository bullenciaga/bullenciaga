import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const parseJsonc = (text) => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));

const [ci, staging, production, stagingConfigText, productionConfigText] = await Promise.all([
  read('.github/workflows/ci.yml'),
  read('.github/workflows/deploy-staging.yml'),
  read('.github/workflows/deploy-production.yml'),
  read('wrangler.staging.jsonc'),
  read('wrangler.production.jsonc'),
]);

const workflowText = `${ci}\n${staging}\n${production}`;
const actionUses = [...workflowText.matchAll(/^\s*uses:\s*([^\s#]+)/gm)].map((match) => match[1]);
assert(actionUses.length > 0, 'workflows must use pinned actions');
for (const action of actionUses) {
  assert.match(action, /@[0-9a-f]{40}$/, `action must be pinned to a commit SHA: ${action}`);
}
assert(!/@v\d+(?:\s|$)/m.test(workflowText), 'movable major-version action tags are forbidden');
assert.match(workflowText, /wranglerVersion:\s*["']4\.125\.0["']/, 'Wrangler must be pinned');

const stagingConfig = parseJsonc(stagingConfigText);
assert.equal(stagingConfig.name, 'bullenciaga-staging');
assert.equal(stagingConfig.workers_dev, true, 'staging must use workers.dev');
assert.equal(stagingConfig.preview_urls, true, 'staging preview URLs must be enabled');
for (const forbidden of ['route', 'routes', 'kv_namespaces', 'd1_databases', 'r2_buckets', 'services', 'triggers']) {
  assert(!(forbidden in stagingConfig), `staging config must not define ${forbidden}`);
}

const productionConfig = parseJsonc(productionConfigText);
assert.equal(productionConfig.name, 'bullenciaga');
assert.deepEqual(productionConfig.routes, [
  { pattern: 'bullenciaga.com', custom_domain: true },
  { pattern: 'www.bullenciaga.com', custom_domain: true },
  { pattern: '*.bullenciaga.com/*', zone_name: 'bullenciaga.com' },
], 'production routes must remain byte-for-byte equivalent in meaning');

assert.match(staging, /workflow_dispatch:/, 'staging must be manual');
assert.match(staging, /wrangler\.staging\.jsonc/, 'staging must use the route-free config');
assert.match(staging, /SMOKE_INCLUDE_API:\s*["']0["']/, 'staging must not probe production APIs');

assert.match(production, /workflow_dispatch:/, 'production must be manual');
for (const input of ['approved_commit_sha', 'approved_release_fingerprint', 'rollback_version_id', 'confirmation']) {
  assert.match(production, new RegExp(`^\\s+${input}:`, 'm'), `production input missing: ${input}`);
}
assert.match(production, /release-fingerprint\.mjs --verify/, 'production must verify the approved release');
assert.match(production, /versions upload/, 'production must upload before promotion');
assert.match(production, /versions deploy/, 'production must promote an exact version');
assert.match(production, /rollback \$\{\{ inputs\.rollback_version_id \}\}/, 'production must define rollback');
assert(!production.includes('.release/WEBSITE_DEPLOY_AUTHORIZED'), 'marker-file authorization is forbidden');
assert(!production.match(/^\s+push:/m), 'production deploy must not run on push');

console.log('deployment controls: ok');
