import { describe, expect, it, vi } from "vitest";
import { createLoginFailureCounterStore, type LoginFailureCounterImport } from "./loginFailureCounterStore";
import {
  assertLoginFailureCounterScanIsSafeToApply,
  assertLoginFailureCounterScansMatchForApply,
  collectActiveLoginFailureCounters,
  type LegacyLoginCounterRedisReader,
} from "./loginFailureCounterImporter";
import type { DrizzleDB } from "../db";

function fakeRedis(values: Map<string, { value: string; ttlMs: number }>): LegacyLoginCounterRedisReader {
  return {
    async *scanIterator({ MATCH }) {
      const prefix = MATCH.slice(0, -1);
      for (const key of [...values.keys()]) if (key.startsWith(prefix)) yield key;
    },
    async get(key) { return values.get(key)?.value ?? null; },
    async pTTL(key) { return values.get(key)?.ttlMs ?? -2; },
  };
}

describe("login failure counter migration snapshot", () => {
  it("accepts only canonical positive decimal counters and keeps malformed entries visible", async () => {
    const prefix = "auth:login:fail:";
    const redis = fakeRedis(new Map([
      [`${prefix}valid@example.invalid`, { value: "5", ttlMs: 60_000 }],
      [`${prefix}zero`, { value: "0", ttlMs: 60_000 }],
      [`${prefix}hex`, { value: "0x5", ttlMs: 60_000 }],
      [`${prefix}decimal`, { value: "5.0", ttlMs: 60_000 }],
      [`${prefix}spaced`, { value: " 5 ", ttlMs: 60_000 }],
      [`${prefix}leading-zero`, { value: "05", ttlMs: 60_000 }],
      [`${prefix}unsafe-integer`, { value: "9007199254740992", ttlMs: 60_000 }],
      [`${prefix}not-an-email`, { value: "5", ttlMs: 60_000 }],
      [`${prefix} padded@example.invalid `, { value: "5", ttlMs: 60_000 }],
    ]));

    const snapshot = await collectActiveLoginFailureCounters(redis, prefix, () => 1_000);

    expect(snapshot.records).toHaveLength(1);
    expect(snapshot.records[0].failureCount).toBe(5);
    expect(snapshot.activeLockouts).toBe(1);
    expect(snapshot.invalidEntries).toBe(8);
    expect(() => assertLoginFailureCounterScanIsSafeToApply(snapshot)).toThrow(/apply is blocked/);
  });

  it("blocks apply when counters materially change and tolerates normal PTTL drift", async () => {
    const prefix = "auth:login:fail:";
    const before = await collectActiveLoginFailureCounters(fakeRedis(new Map([
      [`${prefix}user@example.invalid`, { value: "5", ttlMs: 60_000 }],
    ])), prefix, () => 1_000);
    const normalTtlDrift = await collectActiveLoginFailureCounters(fakeRedis(new Map([
      [`${prefix}user@example.invalid`, { value: "5", ttlMs: 59_500 }],
    ])), prefix, () => 2_000);
    expect(() => assertLoginFailureCounterScansMatchForApply(before, normalTtlDrift)).not.toThrow();

    const changedCount = await collectActiveLoginFailureCounters(fakeRedis(new Map([
      [`${prefix}user@example.invalid`, { value: "6", ttlMs: 59_500 }],
    ])), prefix, () => 2_000);
    expect(() => assertLoginFailureCounterScansMatchForApply(before, changedCount)).toThrow(/snapshot changed/);

    const changedExpiry = await collectActiveLoginFailureCounters(fakeRedis(new Map([
      [`${prefix}user@example.invalid`, { value: "5", ttlMs: 57_000 }],
    ])), prefix, () => 2_000);
    expect(() => assertLoginFailureCounterScansMatchForApply(before, changedExpiry)).toThrow(/snapshot changed/);
  });

  it("rejects invalid counter and identity batches before writing any valid subset", async () => {
    const insert = vi.fn(() => { throw new Error("unexpected database write"); });
    const db = { insert } as unknown as DrizzleDB;
    const store = createLoginFailureCounterStore(db);
    const valid: LoginFailureCounterImport = { email: "valid@example.invalid", failureCount: 5, expiresAt: null };
    const invalidBatches: LoginFailureCounterImport[][] = [
      [valid, { email: "invalid@example.invalid", failureCount: 0, expiresAt: null }],
      [valid, { email: "not-an-email", failureCount: 5, expiresAt: null }],
    ];

    for (const records of invalidBatches) {
      await expect(store.importActive(records)).rejects.toThrow("Invalid login failure counter import record");
    }
    expect(insert).not.toHaveBeenCalled();
  });
});
