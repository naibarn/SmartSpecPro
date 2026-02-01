/**
 * TOTP Service — Time-based One-Time Password (RFC 6238)
 * Zero external dependencies — uses only Node.js built-in crypto
 */

import crypto from "crypto";
import { encrypt, decrypt } from "./crypto";

// Base32 alphabet per RFC 4648
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += B32[(value >>> bits) & 0x1f];
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 0x1f];
  return out;
}

function base32Decode(encoded: string): Buffer {
  const s = encoded.replace(/=+$/, "").toUpperCase();
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of s) {
    const idx = B32.indexOf(ch);
    if (idx === -1) throw new Error(`Invalid base32 char: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
    }
  }
  return Buffer.from(out);
}

/** Generate a random 20-byte TOTP secret (base32 encoded) */
export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

/** Build otpauth:// URI for QR code scanning */
export function generateTotpUri(secret: string, email: string, issuer = "SmartSpec Pro"): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(email)}`;
  const params = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: "6", period: "30" });
  return `otpauth://totp/${label}?${params}`;
}

/** Generate a TOTP code for a given time step offset */
function generateCode(secret: string, stepOffset = 0): string {
  const key = base32Decode(secret);
  const time = Math.floor(Date.now() / 1000 / 30) + stepOffset;
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(time / 0x100000000), 0);
  buf.writeUInt32BE(time >>> 0, 4);

  const hash = crypto.createHmac("sha1", key).update(buf).digest();
  const offset = hash[hash.length - 1] & 0x0f;
  const code =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);

  return (code % 1_000_000).toString().padStart(6, "0");
}

/** Verify a 6-digit TOTP code (allows +/- 1 time window = 90s tolerance) */
export function verifyTotp(secret: string, code: string, window = 1): boolean {
  if (code.length !== 6) return false;
  for (let step = -window; step <= window; step++) {
    const expected = generateCode(secret, step);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(code))) {
      return true;
    }
  }
  return false;
}

/** Generate N one-time recovery codes (format: xxxx-xxxx) */
export function generateRecoveryCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = crypto.randomBytes(4).toString("hex");
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
  }
  return codes;
}

/** Encrypt a TOTP secret for storage */
export function encryptSecret(secret: string): string {
  return encrypt(secret);
}

/** Decrypt a stored TOTP secret */
export function decryptSecret(encrypted: string): string {
  return decrypt(encrypted);
}
