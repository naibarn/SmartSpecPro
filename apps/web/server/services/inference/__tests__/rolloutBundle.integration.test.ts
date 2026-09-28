import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { llmInferenceRolloutBundles } from "../../../../drizzle/schema";
import { getDb } from "../../../db";
import {
  activateInferenceRolloutBundle,
  getInferenceRolloutBundleStatus,
  loadVerifiedInferenceRolloutBundle,
  publishInferenceRolloutBundle,
} from "../rolloutBundle";

const enabled = process.env.RUN_INFERENCE_DB_TESTS === "true";

describe.skipIf(!enabled)("Spec 231 signed rollout bundle persistence", () => {
  it("persists, reloads and verifies an immutable signed artifact", async () => {
    process.env.INFERENCE_ROLLOUT_KEYS_JSON = JSON.stringify({
      "test-2026-01": Buffer.alloc(32, 7).toString("base64"),
    });
    process.env.INFERENCE_ROLLOUT_ACTIVE_KEY_ID = "test-2026-01";
    const bundleId = `integration:${randomUUID()}`;
    const signed = await publishInferenceRolloutBundle({
      actorUserId: 1,
      bundle: {
        bundleId,
        sequence: Math.floor(Math.random() * 2_000_000_000) + 1,
        routerPolicyRevision: "policy:integration",
        logicalModelRegistryRevision: "registry:integration",
        deploymentCredentialBindingRevision: "bindings:integration",
        surfaceCertificationRevision: "surface:integration",
        gatewayRouteManifestHashes: [`sha256:${"a".repeat(64)}`],
        billingPricingSnapshotRefs: ["pricing:integration"],
        fxPolicyRevision: "fx:usd-micros-v1",
        guardrailPolicyRevision: "guardrail:integration",
        rollbackBundleHash: `sha256:${"f".repeat(64)}`,
        providerCapabilityRecheckRef: "probe:integration",
        environmentReadinessRef: "readiness:integration",
      },
    });

    const status = await getInferenceRolloutBundleStatus();
    expect(status.keyringStatus).toBe("ready");
    const ownBundle = status.recentBundles.find(row => row.bundleHash === signed.bundleHash);
    expect(ownBundle).toMatchObject({
      bundleHash: signed.bundleHash,
      bundleId,
      signatureStatus: "valid",
      active: false,
    });
    expect(ownBundle).not.toHaveProperty("signature");

    await expect(
      activateInferenceRolloutBundle({ bundleHash: signed.bundleHash, actorUserId: 1 }),
    ).resolves.toEqual({
      ok: false,
      reason: "PROVIDER_CAPABILITY_RECHECK_UNAVAILABLE",
    });
    await expect(loadVerifiedInferenceRolloutBundle(signed.bundleHash)).resolves.toBeNull();
    await expect(
      getDb()
        .update(llmInferenceRolloutBundles)
        .set({ signature: "0".repeat(64) })
        .where(eq(llmInferenceRolloutBundles.bundleHash, signed.bundleHash)),
    ).rejects.toThrow();
    await expect(
      getDb()
        .delete(llmInferenceRolloutBundles)
        .where(eq(llmInferenceRolloutBundles.bundleHash, signed.bundleHash)),
    ).rejects.toThrow();
    await expect(loadVerifiedInferenceRolloutBundle(signed.bundleHash)).resolves.toBeNull();
  });
});
