import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(new URL("../../../.github/workflows/cloudflare-deploy.yml", import.meta.url), "utf8");
const localReadinessWorkflow = readFileSync(new URL("../../../.github/workflows/cloudflare-local-readiness.yml", import.meta.url), "utf8");
const productionConfig = JSON.parse(readFileSync(new URL("../wrangler.production.jsonc", import.meta.url), "utf8"));
const stagingConfig = JSON.parse(readFileSync(new URL("../wrangler.staging.jsonc", import.meta.url), "utf8"));

test("staging and production use separate GitHub environments and secrets", () => {
  assert.match(workflow, /environment:\s*cloudflare-staging/);
  assert.match(workflow, /environment:\s*cloudflare-production/);
  assert.match(workflow, /CLOUDFLARE_API_TOKEN:\s*\$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.match(workflow, /CLOUDFLARE_ACCOUNT_ID:\s*\$\{\{ vars\.CLOUDFLARE_ACCOUNT_ID \}\}/);
  assert.equal(stagingConfig.workers_dev, true);
  assert.equal(Object.hasOwn(stagingConfig, "routes"), false);
  assert.equal(stagingConfig.vars.CLOUDFLARE_ACTIVATION, "disabled");
  assert.equal(productionConfig.routes.some(route => route.pattern === "smartaihub.app/*"), false);
});

test("Cloudflare build copies only validated website assets and excludes downloadable runtime archives", () => {
  assert.match(workflow, /SSP_SKIP_PUBLIC_COPY:\s*"1"/);
  assert.match(workflow, /prepare-worker-assets\.mjs apps\/web\/client\/public apps\/web\/dist\/public "\$RUNNER_TEMP\/cloudflare-private-source-maps"/);
  assert.match(workflow, /cloudflare-private-sourcemaps-\$\{\{ github\.sha \}\}/);
  assert.match(workflow, /prepare-worker-assets\.mjs[\s\S]*?wrangler@[\s\S]*?--dry-run/);
  assert.match(localReadinessWorkflow, /SSP_SKIP_PUBLIC_COPY:\s*"1"/);
  assert.match(localReadinessWorkflow, /prepare-worker-assets\.mjs apps\/web\/client\/public apps\/web\/dist\/public[\s\S]*?wrangler@[\s\S]*?--dry-run/);
});

test("production promotion requires staging and a typed confirmation; the uploaded version is promoted without route editing", () => {
  assert.match(workflow, /needs:\s*\[guard,\s*build,\s*staging\]/);
  assert.match(workflow, /DEPLOY_SMARTAIHUB_PRODUCTION/);
  assert.match(workflow, /versions upload --config apps\/cloudflare\/wrangler\.production\.jsonc/);
  assert.match(workflow, /Promote only the uploaded Worker version; do not edit routes/);
  assert.match(workflow, /cloudflare-deploy-control\.mjs deploy/);
  assert.doesNotMatch(workflow, /wrangler@[^\s]+\s+deploy\s+--config\s+apps\/cloudflare\/wrangler\.production\.jsonc/);
  assert.doesNotMatch(workflow, /--route(?:s)?\s/);
});

test("staging and production automatically restore captured traffic weights after failed verification", () => {
  assert.match(workflow, /Restore exact previous staging traffic/);
  assert.match(workflow, /Restore exact previous Production traffic weights/);
  assert.match(workflow, /rollback \"\$RUNNER_TEMP\/staging-baseline\.json\"/);
  assert.match(workflow, /rollback \"\$RUNNER_TEMP\/production-baseline\.json\"/);
  assert.match(workflow, /rollback-deployment/);
});
