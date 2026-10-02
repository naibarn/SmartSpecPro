import { describe, expect, it } from "vitest";
import { isEmergencyEvidenceUploadExpired, needsEmergencyEvidenceStagingCleanup } from "./spec260EvidenceRetentionJob";

describe("Spec 260 evidence staging expiry", () => {
  const now = new Date("2026-09-30T12:00:00.000Z");

  it("expires pending uploads only after their capability lifetime", () => {
    expect(isEmergencyEvidenceUploadExpired({ phase: "pending", uploadExpiresAt: "2026-09-30T11:59:00.000Z", verificationLeaseUntil: null, createdAt: now }, now)).toBe(true);
    expect(isEmergencyEvidenceUploadExpired({ phase: "pending", uploadExpiresAt: "2026-09-30T12:01:00.000Z", verificationLeaseUntil: null, createdAt: now }, now)).toBe(false);
  });

  it("reconciles expired verification leases and ignores other states", () => {
    expect(isEmergencyEvidenceUploadExpired({ phase: "verifying", uploadExpiresAt: null, verificationLeaseUntil: "2026-09-30T11:59:00.000Z", createdAt: now }, now)).toBe(true);
    expect(isEmergencyEvidenceUploadExpired({ phase: "verifying", uploadExpiresAt: null, verificationLeaseUntil: "2026-09-30T12:01:00.000Z", createdAt: now }, now)).toBe(false);
    expect(isEmergencyEvidenceUploadExpired({ phase: "available", uploadExpiresAt: null, verificationLeaseUntil: null, createdAt: now }, now)).toBe(false);
  });

  it("retries staging cleanup only for terminal evidence with a durable pending marker", () => {
    expect(needsEmergencyEvidenceStagingCleanup({ phase: "available", stagingCleanupPending: true })).toBe(true);
    expect(needsEmergencyEvidenceStagingCleanup({ phase: "expired", stagingCleanupPending: true })).toBe(true);
    expect(needsEmergencyEvidenceStagingCleanup({ phase: "pending", stagingCleanupPending: true })).toBe(false);
    expect(needsEmergencyEvidenceStagingCleanup({ phase: "available", stagingCleanupPending: false })).toBe(false);
  });
});
