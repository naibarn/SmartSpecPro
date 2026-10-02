import { describe, expect, it } from "vitest";
import { validateOfflineGeoPackage } from "../../packages/shared/src/emergency/offlineGeoPackage";

const manifest = {
  schemaVersion: 1,
  packageRef: "pkg-th-central-1",
  regionRef: "TH-10",
  revision: 4,
  issuedAt: "2026-10-01T00:00:00Z",
  expiresAt: "2026-10-02T00:00:00Z",
  signature: "signed-envelope-valid",
  items: [{ itemRef: "alerts-1", kind: "public-alerts", providerRef: "smartaihub", licenseRef: "https://example.test/license", attribution: "SmartAIHub", offlineAllowed: true, bytes: 1200, sha256: "a".repeat(64), dataThrough: "2026-10-01T00:00:00Z" }],
} as const;

describe("offline geospatial packages", () => {
  it("requires a verified signature, valid time envelope and explicit per-layer rights", async () => {
    const verifySignature = async (signature: string) => signature === "signed-envelope-valid";
    expect(await validateOfflineGeoPackage(manifest, { now: "2026-10-01T01:00:00Z", verifySignature })).toMatchObject({ ok: true, itemCount: 1 });
    expect(await validateOfflineGeoPackage(manifest, { now: "2026-10-03T00:00:00Z", verifySignature })).toMatchObject({ ok: false, code: "PACKAGE_EXPIRED" });
    expect(await validateOfflineGeoPackage({ ...manifest, signature: "tampered-signature" }, { now: "2026-10-01T01:00:00Z", verifySignature })).toMatchObject({ ok: false, code: "PACKAGE_SIGNATURE_INVALID" });
    expect(await validateOfflineGeoPackage({ ...manifest, items: [{ ...manifest.items[0], offlineAllowed: false }] }, { now: "2026-10-01T01:00:00Z", verifySignature })).toMatchObject({ ok: false, code: "PACKAGE_RIGHTS_DENIED" });
  });

  it("always refuses Google map tiles and enforces byte/item ceilings", async () => {
    const options = { now: "2026-10-01T01:00:00Z", verifySignature: async () => true };
    expect(await validateOfflineGeoPackage({ ...manifest, items: [{ ...manifest.items[0], kind: "google-map-tiles" }] }, options)).toMatchObject({ ok: false, code: "GOOGLE_TILES_OFFLINE_FORBIDDEN" });
    expect(await validateOfflineGeoPackage(manifest, { ...options, maxBytes: 100 })).toMatchObject({ ok: false, code: "PACKAGE_SIZE_LIMIT" });
    expect(await validateOfflineGeoPackage({ ...manifest, items: Array(101).fill(manifest.items[0]) }, options)).toMatchObject({ ok: false, code: "PACKAGE_ITEM_LIMIT" });
  });
});
