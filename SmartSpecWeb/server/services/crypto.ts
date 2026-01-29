/**
 * Shared encryption utilities for API key storage
 * Uses AES-256-GCM (authenticated encryption) for integrity + confidentiality
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM recommended IV length
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(envVar?: string): Buffer {
  const key = envVar || process.env.LLM_ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      "CRITICAL: LLM_ENCRYPTION_KEY environment variable is not set. " +
      "Set a 32+ character random string in your .env file."
    );
  }
  // Derive a consistent 32-byte key using SHA-256
  return crypto.createHash("sha256").update(key).digest();
}

/**
 * Encrypt a string using AES-256-GCM (authenticated encryption)
 * Format: iv:authTag:ciphertext (all hex-encoded)
 */
export function encrypt(text: string, envKeyOverride?: string): string {
  const key = getEncryptionKey(envKeyOverride);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypt a string encrypted with encrypt()
 * Supports both new GCM format (iv:authTag:ciphertext) and legacy CBC format (iv:ciphertext)
 */
export function decrypt(text: string, envKeyOverride?: string): string {
  try {
    const parts = text.split(":");

    if (parts.length === 3) {
      // New GCM format: iv:authTag:ciphertext
      const iv = Buffer.from(parts[0], "hex");
      const authTag = Buffer.from(parts[1], "hex");
      const encryptedText = Buffer.from(parts[2], "hex");

      const key = getEncryptionKey(envKeyOverride);
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encryptedText);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      return decrypted.toString("utf8");
    }

    if (parts.length === 2) {
      // DEPRECATED: Legacy CBC format — vulnerable to padding oracle attacks.
      // All legacy keys were migrated. Log and reject.
      console.warn("[Crypto] Rejecting legacy CBC-encrypted value. Re-save the key to upgrade to GCM.");
      return "";
    }

    return "";
  } catch (err) {
    console.warn("[Crypto] Decryption failed:", (err as Error).message);
    return "";
  }
}
