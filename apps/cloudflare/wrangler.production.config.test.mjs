import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const config = JSON.parse(readFileSync(new URL("./wrangler.production.jsonc", import.meta.url), "utf8"));

test("production uses the configured Queue transport without enabling activation", () => {
  assert.equal(config.name, "smartspec-cloudflare-runtime");
  assert.deepEqual(config.vars, {
    CLOUDFLARE_ACTIVATION: "disabled",
    CLOUDFLARE_ENVIRONMENT: "production",
    CLOUDFLARE_JOB_TRANSPORT: "queues",
  });
  assert.deepEqual(config.queues.producers, [
    { binding: "JOB_QUEUE", queue: "smartspec-canonical-job-queue-production" },
  ]);
  assert.equal(config.queues.consumers.length, 1);
  assert.equal(config.queues.consumers[0].queue, "smartspec-canonical-job-queue-production");
  assert.equal(Object.hasOwn(config, "triggers"), false);
  assert.equal(Object.hasOwn(config, "workflows"), false);
  assert.equal(Object.hasOwn(config, "containers"), false);
});

test("production API and emergency routes remain scoped to the approved public zones", () => {
  assert.ok(config.routes.some(route => route.pattern === "runtime.smartaihub.app" && route.custom_domain === true));
  assert.ok(config.routes.some(route => route.pattern === "smartaihub.app/api/public/emergency/*"));
  assert.equal(config.routes.some(route => route.pattern === "smartaihub.app/*"), false);
});

test("production packages the SPA and sends API/auth/realtime paths through the Worker", () => {
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
  assert.equal(config.routes.some(route => route.pattern === "smartaihub.app/*"), false);
});
