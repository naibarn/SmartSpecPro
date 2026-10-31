import assert from "node:assert/strict";
import test from "node:test";
import { buildDeploymentPayload, parseDeploymentList, parseUploadedVersion, sameVersionWeights, smokeTest, verifyCloudflareToken } from "./cloudflare-deploy-control.mjs";

const first = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";

test("deployment readback requires a valid provider deployment and exact 100 percent traffic weights", () => {
  const result = parseDeploymentList({ success: true, result: { deployments: [{ id: first, versions: [
    { version_id: second, percentage: 97.5 }, { version_id: first, percentage: 2.5 },
  ] }] } });
  assert.equal(result.deploymentId, first);
  assert.equal(result.versions.length, 2);
  assert.throws(() => parseDeploymentList({ success: false, result: { deployments: [] } }), /INVENTORY_INVALID/);
  assert.throws(() => parseDeploymentList({ success: true, result: { deployments: [] } }), /BASELINE_MISSING/);
  assert.throws(() => parseDeploymentList({ success: true, result: { deployments: [{ id: first, versions: [{ version_id: second, percentage: 99 }] }] } }), /WEIGHTS_INVALID/);
  assert.throws(() => parseDeploymentList({ success: true, result: { deployments: [{ id: first, versions: [
    { version_id: second, percentage: 50 }, { version_id: second, percentage: 50 },
  ] }] } }), /WEIGHTS_INVALID/);
});

test("traffic comparison is order-independent and upload parsing accepts one immutable version ID", () => {
  assert.equal(sameVersionWeights([{ version_id: first, percentage: 40 }, { version_id: second, percentage: 60 }],
    [{ version_id: second, percentage: 60 }, { version_id: first, percentage: 40 }]), true);
  assert.equal(parseUploadedVersion(`Uploaded smartspec-cloudflare-runtime\nVersion ID: ${second}\n`), second);
  assert.throws(() => parseUploadedVersion("Upload succeeded without a version receipt"), /VERSION_ID_UNAVAILABLE/);
  assert.throws(() => parseUploadedVersion(`Version ID: ${first}\nVersion ID: ${second}`), /VERSION_ID_UNAVAILABLE/);
});

test("Cloudflare deployment API payload uses percentage strategy and carries exact version weights", () => {
  assert.deepEqual(buildDeploymentPayload([{ version_id: first, percentage: 100 }], "test deploy"), {
    strategy: "percentage",
    versions: [{ version_id: first, percentage: 100 }],
    annotations: { "workers/message": "test deploy", "workers/triggered_by": "github-actions" },
  });
});

test("Cloudflare token verification supports account-owned API tokens after user-token verification rejects them", async () => {
  const accountId = "a".repeat(32);
  const requestedPaths = [];
  const fetchImpl = async (input, init) => {
    const path = new URL(input).pathname;
    requestedPaths.push(path);
    assert.equal(init.headers.authorization, "Bearer account-owned-token");
    if (path === "/client/v4/user/tokens/verify") {
      return Response.json({ success: false, errors: [{ code: 1000, message: "Unable to extract bearer token" }] }, { status: 401 });
    }
    if (path === `/client/v4/accounts/${accountId}/tokens/verify`) {
      return Response.json({ success: true, result: { status: "active" } });
    }
    throw new Error(`Unexpected verification path: ${path}`);
  };

  const result = await verifyCloudflareToken("account-owned-token", accountId, fetchImpl);

  assert.equal(result.result.status, "active");
  assert.deepEqual(requestedPaths, [
    "/client/v4/user/tokens/verify",
    `/client/v4/accounts/${accountId}/tokens/verify`,
  ]);
});

test("staging smoke requires Worker readiness and confirms the API session route is served by a Container", async () => {
  const fetchOk = async input => {
    const path = new URL(input).pathname;
    if (path === "/healthz" || path === "/readyz") return Response.json({ ok: true });
    if (path === "/.well-known/smartaihub-evidence-keys.json") return Response.json({ format: "sah-evidence-keys-v1", keys: [] });
    return new Response("{}", { status: 200, headers: {
      "x-smartaihub-ingress": "cloudflare-worker", "x-smartaihub-application-runtime": "cloudflare-container",
    } });
  };
  assert.deepEqual(await smokeTest("https://staging.example.workers.dev", fetchOk), {
    health: "PASS", readiness: "PASS", publicMetadata: "PASS", anonymousSessionRoute: "PASS", applicationRuntime: "cloudflare-container",
  });
  await assert.rejects(smokeTest("https://staging.example.workers.dev", async input => {
    return new URL(input).pathname === "/readyz" ? Response.json({ ok: false }, { status: 503 }) : fetchOk(input);
  }), /RUNTIME_NOT_READY/);
  await assert.rejects(smokeTest("https://staging.example.workers.dev", async input => {
    return new URL(input).pathname === "/api/auth/session"
      ? new Response("{}", { status: 200, headers: { "x-smartaihub-application-runtime": "linux-origin" } })
      : fetchOk(input);
  }), /CONTAINER_SESSION_FAILED/);
});

test("smoke target must be HTTPS and cannot include embedded credentials", async () => {
  await assert.rejects(smokeTest("http://staging.example.workers.dev"), /SMOKE_URL_INVALID/);
  await assert.rejects(smokeTest("https://user:password@staging.example.workers.dev"), /SMOKE_URL_INVALID/);
});
