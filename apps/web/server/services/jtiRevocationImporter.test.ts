import { describe, expect, it } from "vitest";
import { hashJti } from "../_core/revocation";
import { collectActiveJtiRevocations, type LegacyJtiRedisReader } from "./jtiRevocationImporter";

function fakeRedis(values: Map<string, { value: string; ttlMs: number }>): LegacyJtiRedisReader {
  return {
    async *scanIterator({ MATCH }) {
      const prefix = MATCH.slice(0, -1);
      for (const key of [...values.keys()]) if (key.startsWith(prefix)) yield key;
    },
    async get(key) { return values.get(key)?.value ?? null; },
    async pTTL(key) { return values.has(key) ? values.get(key)!.ttlMs : -2; },
  };
}

describe("JTI revocation migration snapshot", () => {
  it("requires a fresh dry-run to include revocations added after the preparation snapshot", async () => {
    const prefix = "revoked:";
    const redisState = new Map([[`${prefix}first-jti`, { value: "1", ttlMs: 60_000 }]]);
    const redis = fakeRedis(redisState);
    const prepared = await collectActiveJtiRevocations(redis, prefix, () => 1_000);
    expect(prepared.records.map((record) => record.jtiHash)).toEqual([hashJti("first-jti")]);

    redisState.set(`${prefix}late-jti`, { value: "1", ttlMs: 120_000 });
    const finalDryRun = await collectActiveJtiRevocations(redis, prefix, () => 2_000);

    expect(finalDryRun.records.map((record) => record.jtiHash).sort()).toEqual(
      [hashJti("first-jti"), hashJti("late-jti")].sort(),
    );
    expect(finalDryRun.records.some((record) => JSON.stringify(record).includes("late-jti"))).toBe(false);
    expect(finalDryRun.scannedKeys).toBe(2);
  });

  it("excludes expired/missing or non-revocation values and preserves persistent revocations", async () => {
    const prefix = "revoked:";
    const redis = fakeRedis(new Map([
      [`${prefix}active`, { value: "1", ttlMs: 5_000 }],
      [`${prefix}persistent`, { value: "1", ttlMs: -1 }],
      [`${prefix}not-revoked`, { value: "0", ttlMs: 5_000 }],
      [`${prefix}expired`, { value: "1", ttlMs: -2 }],
    ]));
    const snapshot = await collectActiveJtiRevocations(redis, prefix, () => 1_000);
    expect(snapshot.records.map((record) => record.jtiHash).sort()).toEqual(
      [hashJti("active"), hashJti("persistent")].sort(),
    );
    expect(snapshot.records.find((record) => record.jtiHash === hashJti("persistent"))?.expiresAt).toBeNull();
    expect(snapshot.expiredOrMissing).toBe(1);
    expect(snapshot.ignoredNonRevocationValues).toBe(1);
  });
});
