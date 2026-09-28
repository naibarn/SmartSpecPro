import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export class EphemeralAuthorizationStoreError extends Error {
  readonly code = "ephemeral_authorization_store_unavailable";
}

type EncryptedSession = { version: 1; keyId: string; iv: string; tag: string; ciphertext: string };

function encryptionKeyring(): { activeKeyId: string; keys: Map<string, Buffer> } {
  const activeKeyId = process.env.AUTH_SESSION_ENCRYPTION_ACTIVE_KEY_ID?.trim();
  const raw = process.env.AUTH_SESSION_ENCRYPTION_KEYS_JSON;
  if (!activeKeyId || !raw) throw new EphemeralAuthorizationStoreError("Authorization session encryption keyring is not configured");
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    const keys = new Map<string, Buffer>();
    for (const [keyId, encoded] of Object.entries(parsed)) {
      const key = Buffer.from(encoded, "base64");
      if (!/^[A-Za-z0-9_-]{1,32}$/.test(keyId) || key.length !== 32 || key.toString("base64") !== encoded) {
        throw new Error("invalid keyring entry");
      }
      keys.set(keyId, key);
    }
    if (!keys.has(activeKeyId)) throw new Error("active key missing");
    return { activeKeyId, keys };
  } catch {
    throw new EphemeralAuthorizationStoreError("Authorization session encryption keyring is invalid");
  }
}

export function getActiveAuthorizationSessionKeyId(): string {
  return encryptionKeyring().activeKeyId;
}

export function encryptAuthorizationSession(value: unknown): EncryptedSession {
  const { activeKeyId, keys } = encryptionKeyring();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keys.get(activeKeyId)!, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return { version: 1, keyId: activeKeyId, iv: iv.toString("base64url"), tag: cipher.getAuthTag().toString("base64url"), ciphertext: ciphertext.toString("base64url") };
}

export function decryptAuthorizationSession<T>(value: unknown): T {
  const envelope = value as EncryptedSession;
  if (!envelope || envelope.version !== 1 || !envelope.keyId || !envelope.iv || !envelope.tag || !envelope.ciphertext) {
    throw new EphemeralAuthorizationStoreError("Stored authorization session has an invalid envelope");
  }
  try {
    const key = encryptionKeyring().keys.get(envelope.keyId);
    if (!key) throw new Error("key unavailable");
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64url"));
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64url")), decipher.final()]);
    return JSON.parse(plaintext.toString("utf8")) as T;
  } catch {
    throw new EphemeralAuthorizationStoreError("Stored authorization session could not be decrypted");
  }
}
