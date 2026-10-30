import { describe, expect, it } from "vitest";
import { isStagingPrivateDatabaseRenewalDue } from "./cloudflarePrivateDatabaseRenewal";

describe("Staging private database lease renewal window", () => {
  const now = Date.parse("2026-10-30T00:00:00.000Z");

  it("allows a renewal before expiry when either bound configuration expires within seven days", () => {
    expect(isStagingPrivateDatabaseRenewalDue({ configurationStatus: "STORED",
      configurationExpiresAt: new Date(now + 30 * 86_400_000).toISOString(),
      databaseLeaseExpiresAt: new Date(now + 5 * 86_400_000).toISOString(), now })).toBe(true);
    expect(isStagingPrivateDatabaseRenewalDue({ configurationStatus: "STORED",
      configurationExpiresAt: new Date(now + 5 * 86_400_000).toISOString(),
      databaseLeaseExpiresAt: new Date(now + 30 * 86_400_000).toISOString(), now })).toBe(true);
  });

  it("continues to allow expired configurations and rejects early or revoked renewals", () => {
    expect(isStagingPrivateDatabaseRenewalDue({ configurationStatus: "EXPIRED",
      configurationExpiresAt: new Date(now - 1).toISOString(),
      databaseLeaseExpiresAt: new Date(now + 30 * 86_400_000).toISOString(), now })).toBe(true);
    expect(isStagingPrivateDatabaseRenewalDue({ configurationStatus: "STORED",
      configurationExpiresAt: new Date(now + 10 * 86_400_000).toISOString(),
      databaseLeaseExpiresAt: new Date(now + 10 * 86_400_000).toISOString(), now })).toBe(false);
    expect(isStagingPrivateDatabaseRenewalDue({ configurationStatus: "REVOKED",
      configurationExpiresAt: new Date(now + 1).toISOString(),
      databaseLeaseExpiresAt: new Date(now + 1).toISOString(), now })).toBe(false);
  });
});
