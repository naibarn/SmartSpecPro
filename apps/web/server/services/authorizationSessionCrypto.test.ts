import { afterEach, describe, expect, it } from "vitest";
import {
  decryptAuthorizationSession,
  encryptAuthorizationSession,
  EphemeralAuthorizationStoreError,
} from "./authorizationSessionCrypto";

const previousKeyring = process.env.AUTH_SESSION_ENCRYPTION_KEYS_JSON;
const previousActiveKeyId = process.env.AUTH_SESSION_ENCRYPTION_ACTIVE_KEY_ID;
const oldKey = Buffer.alloc(32, 11).toString("base64");
const activeKey = Buffer.alloc(32, 22).toString("base64");

function configureKeyring(activeKeyId: string, keys: Record<string, string> = { historical: oldKey, active: activeKey }) {
  process.env.AUTH_SESSION_ENCRYPTION_KEYS_JSON = JSON.stringify(keys);
  process.env.AUTH_SESSION_ENCRYPTION_ACTIVE_KEY_ID = activeKeyId;
}

afterEach(() => {
  if (previousKeyring === undefined) delete process.env.AUTH_SESSION_ENCRYPTION_KEYS_JSON;
  else process.env.AUTH_SESSION_ENCRYPTION_KEYS_JSON = previousKeyring;
  if (previousActiveKeyId === undefined) delete process.env.AUTH_SESSION_ENCRYPTION_ACTIVE_KEY_ID;
  else process.env.AUTH_SESSION_ENCRYPTION_ACTIVE_KEY_ID = previousActiveKeyId;
});

describe("authorization session encryption", () => {
  it("writes with the configured active key", () => {
    configureKeyring("active");

    const envelope = encryptAuthorizationSession({ status: "pending" });

    expect(envelope.keyId).toBe("active");
    expect(decryptAuthorizationSession(envelope)).toEqual({ status: "pending" });
  });

  it("decrypts a session written with a retained historical key", () => {
    configureKeyring("historical");
    const historicalEnvelope = encryptAuthorizationSession({ deviceCode: "synthetic-code" });
    configureKeyring("active");

    expect(decryptAuthorizationSession(historicalEnvelope)).toEqual({ deviceCode: "synthetic-code" });
  });

  it("rejects unknown key IDs and tampered ciphertext", () => {
    configureKeyring("active");
    const envelope = encryptAuthorizationSession({ status: "approved" });

    expect(() => decryptAuthorizationSession({ ...envelope, keyId: "unknown" }))
      .toThrow(EphemeralAuthorizationStoreError);
    const changedCiphertext = `${envelope.ciphertext[0] === "A" ? "B" : "A"}${envelope.ciphertext.slice(1)}`;
    expect(() => decryptAuthorizationSession({ ...envelope, ciphertext: changedCiphertext }))
      .toThrow(EphemeralAuthorizationStoreError);
  });

  it("fails closed when the active key is absent from the configured keyring", () => {
    configureKeyring("missing", { historical: oldKey });

    expect(() => encryptAuthorizationSession({ status: "pending" }))
      .toThrow(EphemeralAuthorizationStoreError);
  });
});
