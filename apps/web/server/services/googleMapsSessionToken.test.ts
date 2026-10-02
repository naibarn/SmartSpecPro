import { describe, expect, it } from "vitest";
import { createGoogleMapPublicSessionToken, googleMapSessionKeyDigest, verifyGoogleMapPublicSessionToken } from "./googleMapsSessionToken";

const signingKey = "unit-test-session-signing-key-at-least-thirty-two-bytes";
const serverKey = "server-only-google-api-key";
const enabledMapTypes = { roadmap: true, satellite: false, terrain: true };

describe("signed Google map session envelope", () => {
  it("verifies statelessly across runtime instances without exposing the API key", () => {
    const keyDigest = googleMapSessionKeyDigest(serverKey, signingKey);
    const token = createGoogleMapPublicSessionToken({ googleSession: "google-session-token-12345678", mapType: "roadmap",
      expiresAt: 2_000_000_000_000, keyDigest, signingKey });

    expect(verifyGoogleMapPublicSessionToken({ token, signingKey, keyDigest, enabledMapTypes, now: 1_900_000_000_000 }))
      .toEqual({ googleSession: "google-session-token-12345678", mapType: "roadmap", expiresAt: 2_000_000_000_000 });
    expect(token).not.toContain(serverKey);
    expect(token).not.toContain("google-session-token-12345678");
    expect(verifyGoogleMapPublicSessionToken({ token, signingKey, keyDigest: "different", enabledMapTypes })).toBeNull();
    const tamperedToken = token.replace(/\.([A-Za-z0-9_-]{43})$/, (_match, signature: string) => `.${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`);
    expect(verifyGoogleMapPublicSessionToken({ token: tamperedToken, signingKey, keyDigest, enabledMapTypes })).toBeNull();
  });

  it("rejects expired sessions and map types disabled since the session was issued", () => {
    const keyDigest = googleMapSessionKeyDigest(serverKey, signingKey);
    const token = createGoogleMapPublicSessionToken({ googleSession: "google-session-token-12345678", mapType: "satellite",
      expiresAt: 2_000_000_000_000, keyDigest, signingKey });
    expect(verifyGoogleMapPublicSessionToken({ token, signingKey, keyDigest, enabledMapTypes, now: 1_900_000_000_000 })).toBeNull();
    expect(verifyGoogleMapPublicSessionToken({ token, signingKey, keyDigest, enabledMapTypes: { ...enabledMapTypes, satellite: true }, now: 2_000_000_000_001 })).toBeNull();
  });
});
