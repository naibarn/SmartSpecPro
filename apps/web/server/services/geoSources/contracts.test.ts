import { describe, expect, it } from "vitest";
import { parseGeoSourceContract, parseGeoSourcePolicy } from "./contracts";

const validContract = {
  providerId: "th-water-department",
  contractVersion: "1.0",
  sourceRef: "rid-river-levels",
  sourceRevision: 3,
  acquiredAt: "2026-10-01T00:00:00.000Z",
  observedAt: "2026-10-01T00:00:00.000Z",
  schemaVersion: "2026-10",
  contentHash: "a".repeat(64),
  licenseRef: "https://licenses.example.org/open-data",
  attribution: "Royal Irrigation Department",
  allowedPurposes: ["emergency-response"],
  retentionClass: "operational-30d",
  freshness: { cadenceSeconds: 300, staleAfterSeconds: 900 },
  records: [{ itemRef: "station-001", observedAt: "2026-10-01T00:00:00.000Z", latitude: 13.7563, longitude: 100.5018, crs: "EPSG:4326", value: 1.25, unit: "m" }],
};

describe("geo source contracts", () => {
  it("accepts a bounded versioned source contract without granting audience authority", () => {
    const parsed = parseGeoSourceContract(validContract);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.records).toHaveLength(1);
    expect(parsed.value).not.toHaveProperty("audience");
  });

  it("rejects credentials, invalid content hashes, unknown contract fields, and malformed records", () => {
    expect(parseGeoSourceContract({ ...validContract, providerId: "https://user:secret@example.org" }).ok).toBe(false);
    expect(parseGeoSourceContract({ ...validContract, contentHash: "not-a-hash" }).ok).toBe(false);
    expect(parseGeoSourceContract({ ...validContract, callerAudience: "public" }).ok).toBe(false);
    expect(parseGeoSourceContract({ ...validContract, adapter: { allowAdditionalFields: true } }).ok).toBe(false);
    expect(parseGeoSourceContract({ ...validContract, records: [{ ...validContract.records[0], latitude: "13.7" }] }).ok).toBe(false);
  });

  it("permits declared additive fields only for adapters which explicitly allow them", () => {
    const additive = { ...validContract, upstreamExtension: { level: "warning" } };
    expect(parseGeoSourceContract(additive).ok).toBe(false);
    expect(parseGeoSourceContract(additive, { allowAdditionalFields: true }).ok).toBe(true);
    expect(parseGeoSourceContract({ ...validContract, upstreamExtension: { nested: { more: { stillMore: { tooDeep: { deeper: true } } } } }, }, { allowAdditionalFields: true }).ok).toBe(false);
    expect(parseGeoSourceContract({ ...validContract, upstreamExtension: "x".repeat(16_385) }, { allowAdditionalFields: true }).ok).toBe(false);
    expect(parseGeoSourceContract({ ...validContract, apiKey: "provider-secret" }, { allowAdditionalFields: true }).ok).toBe(false);
  });

  it("requires real calendar instants instead of Date.parse-normalized dates", () => {
    expect(parseGeoSourceContract({ ...validContract, acquiredAt: "2026-02-31T00:00:00.000Z" }).ok).toBe(false);
    expect(parseGeoSourceContract({ ...validContract, observedAt: "2026-02-29T00:00:00.000Z" }).ok).toBe(false);
  });

  it("requires explicit active rights and bounded provenance policy before a source can be acquired", () => {
    const policy = parseGeoSourcePolicy({
      sourceStatus: "active", ownerRef: "tenant-01", rightsStatus: "granted", licenseRef: "https://licenses.example.org/open-data",
      attribution: "Royal Irrigation Department", allowedPurposes: ["emergency-response"], retentionClass: "operational-30d",
      configurationRevision: 7,
    });
    expect(policy.ok).toBe(true);
    expect(parseGeoSourcePolicy({ ...policy, sourceStatus: "active" }).ok).toBe(false);
    expect(parseGeoSourcePolicy({ sourceStatus: "pending_review", ownerRef: "tenant-01", rightsStatus: "granted", licenseRef: "https://licenses.example.org/open-data", attribution: "RID", allowedPurposes: ["emergency-response"], retentionClass: "operational-30d", configurationRevision: 1 }).ok).toBe(false);
  });
});
