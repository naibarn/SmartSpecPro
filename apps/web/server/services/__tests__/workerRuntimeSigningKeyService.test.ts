import crypto from "crypto";
import { describe, expect, it } from "vitest";

import {
  normalizeWorkerRuntimePublicKey,
  WorkerRuntimeSigningKeyError,
} from "../workerRuntimeSigningKeyService";

function generatePublicKey(type: "ed25519" | "rsa") {
  const pair =
    type === "ed25519"
      ? crypto.generateKeyPairSync("ed25519")
      : crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    publicKey: pair.publicKey
      .export({ type: "spki", format: "pem" })
      .toString(),
    privateKey: pair.privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString(),
  };
}

describe("worker runtime signing key normalization", () => {
  it("accepts Ed25519 public keys and derives a stable fingerprint", () => {
    const { publicKey } = generatePublicKey("ed25519");
    const result = normalizeWorkerRuntimePublicKey(`\n${publicKey}\n`);

    expect(result.algorithm).toBe("ed25519");
    expect(result.publicKey).toContain("BEGIN PUBLIC KEY");
    expect(result.fingerprintSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.keyId).toBe(
      `ed25519-${result.fingerprintSha256.slice(0, 16)}`
    );
  });

  it("rejects private keys before they can be persisted", () => {
    const { privateKey } = generatePublicKey("ed25519");

    expect(() => normalizeWorkerRuntimePublicKey(privateKey)).toThrow(
      WorkerRuntimeSigningKeyError
    );
    expect(() => normalizeWorkerRuntimePublicKey(privateKey)).toThrow(
      "ห้ามใส่ private key"
    );
  });

  it("rejects public keys using an unsupported algorithm", () => {
    const { publicKey } = generatePublicKey("rsa");

    expect(() => normalizeWorkerRuntimePublicKey(publicKey)).toThrow(
      "รองรับเฉพาะ Ed25519 public key เท่านั้น"
    );
  });
});
