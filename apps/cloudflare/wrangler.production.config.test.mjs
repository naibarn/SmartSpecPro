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
  assert.equal(Object.hasOwn(config, "workflows"), false);
  assert.equal(Object.hasOwn(config, "containers"), false);
});

test("production API and emergency routes remain scoped to the approved public zones", () => {
  assert.ok(config.routes.some(route => route.pattern === "runtime.smartaihub.app" && route.custom_domain === true));
  assert.ok(config.routes.some(route => route.pattern === "smartaihub.app/api/public/emergency/*"));
  assert.equal(config.routes.some(route => route.pattern === "smartaihub.app/*"), false);
});
