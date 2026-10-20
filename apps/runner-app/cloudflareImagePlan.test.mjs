import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { cloudflareRunnerImagePlan } from "./cloudflareImagePlan.mjs";
test("only approved immutable base inputs can produce a Runner build plan", () => {
  const image = `registry.example.com/runner/base@sha256:${"a".repeat(64)}`;
  const plan = cloudflareRunnerImagePlan({ buildImage: image, runtimeImage: image });
  assert.equal(plan.publish, false);assert.equal(plan.healthPort, 8787);
  for (const invalid of [undefined,"rust:latest","debian:bookworm",`registry.example.com/runner/base@sha256:${"g".repeat(64)}`]) {
    assert.throws(() => cloudflareRunnerImagePlan({ buildImage: invalid, runtimeImage: image }), /DIGEST_REQUIRED/);
    assert.throws(() => cloudflareRunnerImagePlan({ buildImage: image, runtimeImage: invalid }), /DIGEST_REQUIRED/);
  }
  const recipe = readFileSync(new URL("./Containerfile",import.meta.url),"utf8");
  assert.ok(recipe.includes("cargo build --locked --release --bin smartaihub-runner"));
  assert.ok(recipe.includes("USER 65532:65532"));
  assert.ok(!recipe.includes("COPY ."));
});
