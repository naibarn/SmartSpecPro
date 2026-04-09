import crypto from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  buildDesktopDeviceOffboarding,
  buildDesktopEnrollmentProofDigest,
  buildDesktopEnrollmentSignaturePayload,
  buildDesktopRekeyBinding,
  buildDesktopRuntimeTokenBinding,
  createDesktopEnrollmentChallenge,
  detectDesktopCloneSuspicion,
  verifyDesktopAsymmetricEnrollmentProof,
  verifyDesktopEnrollmentProof,
} from "../deviceEnrollmentService";
import { buildDesktopLocalRootPolicy } from "../desktopPolicyService";

describe("desktop offboarding and enrollment", () => {
  it("creates and verifies desktop enrollment proof flow", () => {
    const challenge = createDesktopEnrollmentChallenge({
      tenantId: "tenant-1",
      deviceId: "device-1",
      devicePublicKey: "ssh-ed25519 AAAA",
      purpose: "bootstrap",
      deviceKeyVersion: 1,
      issuedAtEpochMs: Date.UTC(2026, 3, 9, 10, 0, 0),
      ttlSeconds: 300,
    });
    const proofSha256 = buildDesktopEnrollmentProofDigest({
      challenge,
      devicePublicKey: "ssh-ed25519 AAAA",
      deviceSharedSecret: "device-secret-v1",
    });

    const valid = verifyDesktopEnrollmentProof({
      challenge,
      proofSha256,
      devicePublicKey: "ssh-ed25519 AAAA",
      deviceSharedSecret: "device-secret-v1",
      nowEpochMs: Date.UTC(2026, 3, 9, 10, 4, 0),
    });
    const binding = buildDesktopRuntimeTokenBinding({
      tenantId: "tenant-1",
      deviceId: "device-1",
      runtimeScope: "desktop_runtime",
      challengeId: challenge.challengeId,
      deviceKeyVersion: challenge.deviceKeyVersion,
      proofSha256,
    });

    expect(valid).toBe(true);
    expect(challenge.challengeId).toMatch(/^[a-f0-9]{24}$/);
    expect(challenge.devicePublicKeyDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(binding.bindingSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("verifies asymmetric enrollment signatures with real ed25519 keys", () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
    const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const challenge = createDesktopEnrollmentChallenge({
      tenantId: "tenant-1",
      deviceId: "device-ed25519",
      devicePublicKey: publicKeyPem,
      purpose: "refresh",
      deviceKeyVersion: 3,
      issuedAtEpochMs: Date.UTC(2026, 3, 9, 10, 0, 0),
      ttlSeconds: 120,
    });
    const signatureBase64 = crypto
      .sign(
        null,
        Buffer.from(buildDesktopEnrollmentSignaturePayload(challenge)),
        privateKey,
      )
      .toString("base64");
    const wrongPublicKeyPem = crypto
      .generateKeyPairSync("ed25519")
      .publicKey.export({ type: "spki", format: "pem" })
      .toString();

    const valid = verifyDesktopAsymmetricEnrollmentProof({
      challenge,
      signatureBase64,
      devicePublicKeyPem: publicKeyPem,
      nowEpochMs: Date.UTC(2026, 3, 9, 10, 1, 0),
    });
    const invalidKey = verifyDesktopAsymmetricEnrollmentProof({
      challenge,
      signatureBase64,
      devicePublicKeyPem: wrongPublicKeyPem,
      nowEpochMs: Date.UTC(2026, 3, 9, 10, 1, 0),
    });

    expect(valid).toBe(true);
    expect(invalidKey).toBe(false);
  });

  it("rejects expired or wrongly bound proofs and supports rekey binding", () => {
    const challenge = createDesktopEnrollmentChallenge({
      tenantId: "tenant-1",
      deviceId: "device-1",
      devicePublicKey: "ssh-ed25519 AAAA",
      purpose: "rekey",
      deviceKeyVersion: 2,
      issuedAtEpochMs: Date.UTC(2026, 3, 9, 10, 0, 0),
      ttlSeconds: 60,
    });
    const proofSha256 = buildDesktopEnrollmentProofDigest({
      challenge,
      devicePublicKey: "ssh-ed25519 AAAA",
      deviceSharedSecret: "device-secret-v2",
    });

    const invalidSecret = verifyDesktopEnrollmentProof({
      challenge,
      proofSha256,
      devicePublicKey: "ssh-ed25519 AAAA",
      deviceSharedSecret: "wrong-secret",
      nowEpochMs: Date.UTC(2026, 3, 9, 10, 0, 30),
    });
    const expired = verifyDesktopEnrollmentProof({
      challenge,
      proofSha256,
      devicePublicKey: "ssh-ed25519 AAAA",
      deviceSharedSecret: "device-secret-v2",
      nowEpochMs: Date.UTC(2026, 3, 9, 10, 2, 0),
    });
    const tamperedChallenge = verifyDesktopEnrollmentProof({
      challenge: {
        ...challenge,
        challengeSha256: "f".repeat(64),
      },
      proofSha256,
      devicePublicKey: "ssh-ed25519 AAAA",
      deviceSharedSecret: "device-secret-v2",
      nowEpochMs: Date.UTC(2026, 3, 9, 10, 0, 30),
    });
    const rekey = buildDesktopRekeyBinding({
      tenantId: "tenant-1",
      deviceId: "device-1",
      previousBindingSha256: "a".repeat(64),
      nextDevicePublicKey: "ssh-ed25519 BBBB",
      nextDeviceKeyVersion: 2,
    });

    expect(invalidSecret).toBe(false);
    expect(expired).toBe(false);
    expect(tamperedChallenge).toBe(false);
    expect(rekey.nextDevicePublicKeyDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(rekey.bindingSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("detects clone suspicion and builds offboarding cleanup plans", () => {
    const root = buildDesktopLocalRootPolicy({
      rootId: "quotes",
      name: "Quotes",
      absolutePath: "/Users/demo/Documents/Quotes",
    });

    const suspicious = detectDesktopCloneSuspicion({
      registeredPublicKeyDigest: "a".repeat(64),
      presentedPublicKeyDigest: "a".repeat(64),
      registeredDeviceKeyVersion: 1,
      presentedDeviceKeyVersion: 2,
    });
    const plan = buildDesktopDeviceOffboarding({
      deviceId: "device-1",
      packageCachePaths: ["/cache/packages"],
      localRoots: [root],
    });

    expect(suspicious).toBe(true);
    expect(plan.cleanupOnNextContact).toBe(true);
    expect(plan.localRootIds).toEqual(["quotes"]);
  });
});
