import { describe, expect, it } from "vitest";
import {
  buildLegacyQuotaImportPlan,
  reconcileLegacyQuotaSnapshot,
} from "../apiKeyQuotaMigration";

describe("legacy API-key quota import plan", () => {
  const now = new Date("2026-09-27T12:34:00.000Z");
  const hour = String(Math.floor(now.getTime() / 3_600_000));

  it("preserves active counters and warning deduplication without lowering counts", () => {
    const plan = buildLegacyQuotaImportPlan({
      counterKeys: [
        {
          key: `quota:apikey:key-1:h:${hour}`,
          value: "19",
          ttlSeconds: 4200,
        },
        {
          key: "quota:apikey:key-1:d:2026-09-26",
          value: "7",
          ttlSeconds: 100,
        },
      ],
      warningKeys: [{ key: `quota:warn:key-1:h:${hour}`, value: "1" }],
      tenantByApiKeyId: new Map([["key-1", "tenant-1"]]),
      now,
    });

    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0]).toMatchObject({
      apiKeyId: "key-1",
      tenantId: "tenant-1",
      window: "hourly",
      periodKey: hour,
      requestCount: 19,
      warned: true,
      ttlSeconds: 4200,
    });
    expect(plan.staleCounters).toBe(1);
    expect(plan.malformedKeys + plan.orphanWarnings + plan.unknownApiKeys).toBe(
      0
    );
  });

  it("blocks malformed, orphaned-warning, and unknown-key active state", () => {
    const plan = buildLegacyQuotaImportPlan({
      counterKeys: [
        { key: `quota:apikey:missing:h:${hour}`, value: "2", ttlSeconds: 10 },
        { key: `quota:apikey:key-1:x:${hour}`, value: "1", ttlSeconds: 10 },
      ],
      warningKeys: [{ key: `quota:warn:key-2:d:2026-09-27`, value: "1" }],
      tenantByApiKeyId: new Map(),
      now,
    });

    expect(plan.rows).toHaveLength(0);
    expect(plan.unknownApiKeys).toBe(1);
    expect(plan.malformedKeys).toBe(1);
    expect(plan.orphanWarnings).toBe(1);
  });

  it("requires Redis snapshot parity while preserving higher and PG-only counters", () => {
    const plan = buildLegacyQuotaImportPlan({
      counterKeys: [
        { key: `quota:apikey:key-1:h:${hour}`, value: "19", ttlSeconds: 4200 },
      ],
      warningKeys: [{ key: `quota:warn:key-1:h:${hour}`, value: "1" }],
      tenantByApiKeyId: new Map([["key-1", "tenant-1"]]),
      now,
    });
    const result = reconcileLegacyQuotaSnapshot({
      expectedRows: plan.rows,
      postgresRows: [
        {
          apiKeyId: "key-1",
          tenantId: "tenant-1",
          window: "hourly",
          periodKey: hour,
          requestCount: 24,
          warned: true,
        },
        {
          apiKeyId: "pg-only-key",
          tenantId: "tenant-2",
          window: "daily",
          periodKey: "2026-09-27",
          requestCount: 4,
          warned: false,
        },
      ],
    });

    expect(result).toEqual({
      missingRows: 0,
      lowerCounters: 0,
      missingWarnings: 0,
      tenantMismatches: 0,
    });
  });

  it("reports missing, lower, warning, and tenant mismatch states", () => {
    const plan = buildLegacyQuotaImportPlan({
      counterKeys: [
        { key: `quota:apikey:key-1:h:${hour}`, value: "19", ttlSeconds: 4200 },
      ],
      warningKeys: [{ key: `quota:warn:key-1:h:${hour}`, value: "1" }],
      tenantByApiKeyId: new Map([["key-1", "tenant-1"]]),
      now,
    });

    expect(
      reconcileLegacyQuotaSnapshot({
        expectedRows: plan.rows,
        postgresRows: [
          {
            apiKeyId: "key-1",
            tenantId: "wrong-tenant",
            window: "hourly",
            periodKey: hour,
            requestCount: 3,
            warned: false,
          },
        ],
      })
    ).toEqual({
      missingRows: 0,
      lowerCounters: 1,
      missingWarnings: 1,
      tenantMismatches: 1,
    });
  });
});
