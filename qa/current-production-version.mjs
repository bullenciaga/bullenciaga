import assert from 'node:assert/strict';
import { appendFile, readFile } from 'node:fs/promises';

const responseFile = process.env.CLOUDFLARE_DEPLOYMENTS_FILE ?? '';
assert(responseFile, 'CLOUDFLARE_DEPLOYMENTS_FILE is required');

const response = JSON.parse(await readFile(responseFile, 'utf8'));
assert.equal(response.success, true, 'Cloudflare deployments request was not successful');
assert(Array.isArray(response.result) && response.result.length > 0, 'Cloudflare returned no production deployments');

const latestDeployment = response.result[0];
assert(Array.isArray(latestDeployment.versions), 'latest deployment has no versions');
assert.equal(latestDeployment.versions.length, 1, 'production must have exactly one active version before an automatic release');

const activeVersion = latestDeployment.versions[0];
const versionId = activeVersion.version_id ?? '';
assert.match(versionId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'active production version is not a UUID');
assert.equal(Number(activeVersion.percentage), 100, 'production must be serving one version at 100% before an automatic release');

if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `version_id=${versionId}\n`);
}

console.log(JSON.stringify({
  deployment_id: latestDeployment.id,
  version_id: versionId,
  percentage: Number(activeVersion.percentage),
}, null, 2));
