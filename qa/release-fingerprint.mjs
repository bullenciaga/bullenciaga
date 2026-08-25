import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const read = (path) => readFile(new URL(path, root));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

const commitSha = git('rev-parse', 'HEAD');
const siteTreeSha = git('rev-parse', 'HEAD:site');
const [manifest, productionConfig] = await Promise.all([
  read('site/SHA256SUMS.txt'),
  read('wrangler.production.jsonc'),
]);
const siteManifestSha256 = sha256(manifest);
const productionConfigSha256 = sha256(productionConfig);
const releaseFingerprint = sha256([
  `site-tree=${siteTreeSha}`,
  `site-manifest=${siteManifestSha256}`,
  `production-config=${productionConfigSha256}`,
  '',
].join('\n'));

if (process.argv.includes('--verify')) {
  const approvedCommit = process.env.APPROVED_COMMIT_SHA ?? '';
  const approvedFingerprint = process.env.APPROVED_RELEASE_FINGERPRINT ?? '';
  const rollbackVersion = process.env.ROLLBACK_VERSION_ID ?? '';
  const confirmation = process.env.DEPLOY_CONFIRMATION ?? '';
  const workflowCommit = process.env.GITHUB_SHA ?? commitSha;

  assert.match(approvedCommit, /^[0-9a-f]{40}$/, 'approved commit must be a full lowercase Git SHA');
  assert.equal(commitSha, approvedCommit, 'checkout does not match approved commit');
  assert.equal(workflowCommit, approvedCommit, 'workflow ref does not match approved commit');
  assert.match(approvedFingerprint, /^[0-9a-f]{64}$/, 'approved release fingerprint must be SHA-256');
  assert.equal(releaseFingerprint, approvedFingerprint, 'release fingerprint does not match staging evidence');
  assert.match(rollbackVersion, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'rollback version must be a UUID');
  assert.equal(confirmation, 'DEPLOY BULLENCIAGA WEBSITE', 'production confirmation phrase is incorrect');

  const baseline = JSON.parse(await read('.release/PRODUCTION_BASELINE.json'));
  assert.equal(rollbackVersion, baseline.cloudflareVersionId, 'rollback version does not match the recorded production baseline');
}

const outputs = {
  commit_sha: commitSha,
  site_tree_sha: siteTreeSha,
  site_manifest_sha256: siteManifestSha256,
  production_config_sha256: productionConfigSha256,
  release_fingerprint: releaseFingerprint,
};

if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, Object.entries(outputs).map(([key, value]) => `${key}=${value}\n`).join(''));
}

console.log(JSON.stringify(outputs, null, 2));
