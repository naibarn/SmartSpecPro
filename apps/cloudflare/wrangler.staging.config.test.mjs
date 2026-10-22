import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const config = JSON.parse(readFileSync(new URL("./wrangler.staging.jsonc", import.meta.url), "utf8"));

test("staging Worker remains isolated from production routing and background consumers", () => {
  assert.equal(config.name, "smartspec-cloudflare-staging");
  assert.equal(config.workers_dev, true);
  assert.equal(config.preview_urls, false);
  assert.deepEqual(config.vars, {
    CLOUDFLARE_ACTIVATION: "disabled",
    CLOUDFLARE_ENVIRONMENT: "staging",
    CLOUDFLARE_JOB_TRANSPORT: "queues",
  });
  for (const forbidden of ["routes", "triggers", "queues", "kv_namespaces", "hyperdrive"]) {
    assert.equal(Object.hasOwn(config, forbidden), false, `${forbidden} must be provisioned separately after acceptance`);
  }
});

test("staging serves Vite SPA assets while sending all API authority paths through the Worker", () => {
  assert.deepEqual(config.assets, {
    directory: "../web/dist/public",
    binding: "ASSETS",
    not_found_handling: "single-page-application",
    run_worker_first: config.assets.run_worker_first,
  });
  for (const path of [
    "/api", "/api/*", "/v1", "/v1/*", "/trpc", "/trpc/*", "/auth", "/auth/*",
    "/oauth", "/oauth/*", "/uploads", "/uploads/*", "/internal", "/internal/*",
    "/.well-known/*", "/healthz", "/readyz", "/metrics", "/socket.io*", "/ws*", "/widget/v1/ws",
  ]) {
    assert.ok(config.assets.run_worker_first.includes(path), `${path} must bypass SPA fallback`);
  }
});
