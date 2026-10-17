import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import express from "express";
import request from "supertest";
import { getPublicEvidenceVerificationKeys } from "@smartspec/shared/src/contentProtection";

vi.mock("../../db", () => ({ getDb: vi.fn() }));
vi.mock("../../routers/contentProtection", () => ({ getContentProtectionOverview: vi.fn(), safeAssetView: vi.fn() }));
vi.mock("../../storage", () => ({ storageStreamFile: vi.fn() }));

import { registerContentProtectionRoutes } from "../contentProtection";

const testKeys = JSON.stringify([{
  keyId: "linux-contract-key",
  algorithm: "Ed25519",
  publicKey: "public-key-material",
  validFrom: "2026-01-01T00:00:00.000Z",
}]);

function expectedEtag(raw: string): string {
  const body = JSON.stringify(getPublicEvidenceVerificationKeys(raw));
  const digest = createHash("sha1").update(body).digest("base64").slice(0, 27);
  return `W/"${Buffer.byteLength(body).toString(16)}-${digest}"`;
}

function createApp() {
  const app = express();
  registerContentProtectionRoutes(app);
  return app;
}

afterEach(() => vi.unstubAllEnvs());

describe("Express public evidence-key route contract", () => {
  it("keeps the response body and cache policy shared with the Worker handler", async () => {
    vi.stubEnv("CONTENT_PROTECTION_PUBLIC_KEYS_JSON", testKeys);
    const response = await request(createApp()).get("/.well-known/smartaihub-evidence-keys.json");
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("public, max-age=300");
    expect(response.headers["content-type"]).toBe("application/json; charset=utf-8");
    expect(response.body).toEqual(getPublicEvidenceVerificationKeys(testKeys));
    expect(response.headers.etag).toBe(expectedEtag(testKeys));

    const conditional = await request(createApp())
      .get("/.well-known/smartaihub-evidence-keys.json")
      .set("If-None-Match", response.headers.etag);
    expect(conditional.status).toBe(304);
    expect(conditional.headers.etag).toBe(response.headers.etag);
  });

  it("preserves the established empty-key response for invalid configuration", async () => {
    vi.stubEnv("CONTENT_PROTECTION_PUBLIC_KEYS_JSON", "malformed-json");
    const response = await request(createApp()).get("/.well-known/smartaihub-evidence-keys.json");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ format: "sah-evidence-keys-v1", keys: [] });
  });
});
