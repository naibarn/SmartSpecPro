import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type GoogleMapSessionType = "roadmap" | "satellite" | "terrain";

export function googleMapSessionKeyDigest(serverApiKey: string, signingKey: string): string {
  if (signingKey.length < 32) throw new Error("MAP_SESSION_SIGNING_KEY_NOT_CONFIGURED");
  return createHmac("sha256", signingKey).update(`spec260-google-map-key-reference:v1:${serverApiKey}`).digest("hex");
}

function sign(payload: string, signingKey: string): string {
  if (signingKey.length < 32) throw new Error("MAP_SESSION_SIGNING_KEY_NOT_CONFIGURED");
  return createHmac("sha256", signingKey).update(`spec260-google-map-session:v1:${payload}`).digest("base64url");
}

function sessionEncryptionKey(signingKey: string): Buffer {
  if (signingKey.length < 32) throw new Error("MAP_SESSION_SIGNING_KEY_NOT_CONFIGURED");
  return createHmac("sha256", signingKey).update("spec260-google-map-session-encryption:v1").digest();
}

export function createGoogleMapPublicSessionToken(input: {
  googleSession: string;
  mapType: GoogleMapSessionType;
  expiresAt: number;
  keyDigest: string;
  signingKey: string;
}): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sessionEncryptionKey(input.signingKey), iv);
  cipher.setAAD(Buffer.from("spec260-google-map-session:v2"));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify({ v: 2, s: input.googleSession, t: input.mapType, e: input.expiresAt, k: input.keyDigest })), cipher.final()]);
  const payload = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
  return `m2.${payload}.${sign(payload, input.signingKey)}`;
}

export function verifyGoogleMapPublicSessionToken(input: {
  token: string;
  signingKey: string;
  keyDigest: string;
  enabledMapTypes: Readonly<Record<GoogleMapSessionType, boolean>>;
  now?: number;
}): { googleSession: string; mapType: GoogleMapSessionType; expiresAt: number } | null {
  if (input.token.length > 2048) return null;
  const match = /^m2\.([A-Za-z0-9_-]{40,1536})\.([A-Za-z0-9_-]{43})$/.exec(input.token);
  if (!match) return null;
  const [, payload, signature] = match;
  let expected: Buffer;
  let actual: Buffer;
  try {
    expected = Buffer.from(sign(payload, input.signingKey), "base64url");
    actual = Buffer.from(signature, "base64url");
  } catch { return null; }
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const encrypted = Buffer.from(payload, "base64url");
    if (encrypted.length < 29) return null;
    const decipher = createDecipheriv("aes-256-gcm", sessionEncryptionKey(input.signingKey), encrypted.subarray(0, 12));
    decipher.setAAD(Buffer.from("spec260-google-map-session:v2"));
    decipher.setAuthTag(encrypted.subarray(12, 28));
    const decoded = Buffer.concat([decipher.update(encrypted.subarray(28)), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(decoded) as Record<string, unknown>;
    const mapType = parsed.t;
    if (parsed.v !== 2 || typeof parsed.s !== "string" || !/^[A-Za-z0-9_-]{8,512}$/.test(parsed.s) ||
        (mapType !== "roadmap" && mapType !== "satellite" && mapType !== "terrain") || !input.enabledMapTypes[mapType] ||
        typeof parsed.e !== "number" || parsed.e <= (input.now ?? Date.now()) || parsed.k !== input.keyDigest) return null;
    return { googleSession: parsed.s, mapType, expiresAt: parsed.e };
  } catch { return null; }
}
