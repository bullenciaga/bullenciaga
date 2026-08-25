import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const parseJsonc = (text) => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));

const [ci, staging, production, stagingConfigText, productionConfigText, rollbackParser] = await Promise.all([
  read('.github/workflows/ci.yml'),
  read('.github/workflows/deploy-staging.yml'),
  read('.github/workflows/deploy-production.yml'),
  read('wrangler.staging.jsonc'),
  read('wrangler.production.jsonc'),
  read('qa/current-production-version.mjs'),
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

assert.match(staging, /^\s+push:/m, 'staging must run automatically after main changes');
assert.match(staging, /paths:[\s\S]*site\/\*\*/, 'staging must run when website files change');
assert.match(staging, /paths:[\s\S]*qa\/\*\*/, 'staging must run when release checks change');
assert.match(staging, /paths:[\s\S]*wrangler\.production\.jsonc/, 'staging must run when production config changes');
assert.match(staging, /^\s+workflow_dispatch:/m, 'staging must retain an emergency manual trigger');
assert.match(staging, /^\s+- main$/m, 'automatic staging must target main only');
assert.match(staging, /wrangler\.staging\.jsonc/, 'staging must use the route-free config');
assert.match(staging, /SMOKE_INCLUDE_API:\s*["']0["']/, 'staging must not probe production APIs');

assert.match(production, /^\s+workflow_run:/m, 'production must follow a completed staging workflow');
assert.match(production, /workflow_run\.conclusion == 'success'/, 'production must require successful staging');
assert.match(production, /workflow_run\.event == 'push'/, 'production must only follow automatic staging');
assert.match(production, /workflow_run\.head_branch == 'main'/, 'production must only promote main');
assert.match(production, /ref: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/, 'production must check out the exact staged commit');
assert.match(production, /git rev-parse origin\/main/, 'production must reject stale staged commits');
assert.match(production, /Preflight current production pages and APIs/, 'production must prove live dependencies before promotion');
assert.match(production, /workers\/scripts\/bullenciaga\/deployments/, 'production must capture the live rollback target automatically');
assert.match(production, /current-production-version\.mjs/, 'production must validate the rollback response');
assert.match(production, /versions upload/, 'production must upload before promotion');
assert.match(production, /versions deploy/, 'production must promote an exact version');
assert.match(production, /rollback \$\{\{ steps\.rollback\.outputs\.version_id \}\}/, 'production must roll back to the captured live version');
assert(!production.includes('approved_commit_sha'), 'manual commit input is forbidden');
assert(!production.includes('approved_release_fingerprint'), 'manual fingerprint input is forbidden');
assert(!production.includes('rollback_version_id'), 'manual rollback input is forbidden');
assert(!production.includes('DEPLOY BULLENCIAGA WEBSITE'), 'manual confirmation phrase is forbidden');
assert(!production.includes('environment: production'), 'mobile-only production approval gate is forbidden');
assert(!production.includes('.release/WEBSITE_DEPLOY_AUTHORIZED'), 'marker-file authorization is forbidden');
assert(!production.match(/^\s+push:/m), 'production deploy must not run directly on push');

assert.match(rollbackParser, /response\.result\[0\]/, 'rollback parser must use the latest active deployment');
assert.match(rollbackParser, /versions\.length, 1/, 'rollback parser must reject split production traffic');
assert.match(rollbackParser, /percentage\), 100/, 'rollback parser must require one version at 100%');

console.log('deployment controls: ok');
