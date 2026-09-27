import { describe, expect, it } from "vitest";
import { collectActiveJtiRevocations } from "./jtiRevocationImporter";
import { collectActiveLoginFailureCounters } from "./loginFailureCounterImporter";
import { LOGIN_FAILURE_THRESHOLD } from "./loginFailureCounterStore";
import { assertLiteralRedisPrefix } from "./redisKeyPrefix";
import {
  assertRedisG2AuthStateSafeToApply,
  auditRedisG2AuthState,
  type RedisG2StateReader,
} from "./redisG2AuthStateAudit";

function fakeRedis(values: Map<string, { value: string; ttlMs: number }>): RedisG2StateReader & {
  scanIterator(options: { MATCH: string; COUNT: number }): AsyncIterable<string>;
  get(key: string): Promise<string | null>;
  pTTL(key: string): Promise<number>;
} {
  return {
    async *scanIterator({ MATCH }) {
      const prefix = MATCH.replace(/\*.*$/, "");
      for (const key of [...values.keys()]) if (key.startsWith(prefix)) yield key;
    },
    async get(key) { return values.get(key)?.value ?? null; },
    async pTTL(key) { return values.get(key)?.ttlMs ?? -2; },
  };
}

describe("G2 fresh auth-state snapshot", () => {
  it("rejects Redis glob syntax in configured key prefixes before scanning", async () => {
    expect(() => assertLiteralRedisPrefix("revoked:*", "JTI revocation prefix")).toThrow(/literal prefix/);
    expect(() => assertLiteralRedisPrefix("auth?login:", "Login failure counter prefix")).toThrow(/literal prefix/);
    expect(() => assertLiteralRedisPrefix("", "JTI revocation prefix")).toThrow(/literal prefix/);

    const neverScan = {
      async *scanIterator() { throw new Error("scan must not run for an invalid prefix"); },
      async get() { return null; },
      async pTTL() { return -2; },
    } satisfies RedisG2StateReader;
    await expect(collectActiveJtiRevocations(neverScan, "revoked:*" )).rejects.toThrow(/literal prefix/);
    await expect(collectActiveLoginFailureCounters(neverScan, "auth:login:?" )).rejects.toThrow(/literal prefix/);
  });

  it("detects JTIs, lockouts, pending device grants, and pairing state added after preparation", async () => {
    const redisState = new Map<string, { value: string; ttlMs: number }>();
    const redis = fakeRedis(redisState);
    const jtiPrepared = await collectActiveJtiRevocations(redis, "revoked:", () => 1_000);
    const loginPrepared = await collectActiveLoginFailureCounters(redis, "auth:login:fail:", () => 1_000);
    const statePrepared = await auditRedisG2AuthState(redis);
    expect(jtiPrepared.records).toHaveLength(0);
    expect(loginPrepared.activeLockouts).toBe(0);
    expect(statePrepared.stateCounts.devicePending).toBe(0);
    expect(statePrepared.stateCounts.pairingPending).toBe(0);

    // Simulate new Redis state appearing while cutover is being prepared.
    redisState.set("revoked:late-token", { value: "1", ttlMs: 60_000 });
    redisState.set("auth:login:fail:beta@example.invalid", { value: "5", ttlMs: 60_000 });
    redisState.set("devicecode:late-device", { value: JSON.stringify({ authorized: false }), ttlMs: 60_000 });
    redisState.set("runner:connect:device:late-runner", { value: JSON.stringify({ status: "pending" }), ttlMs: 60_000 });
    redisState.set("worker-connect:device:late-worker", { value: JSON.stringify({ status: "pending" }), ttlMs: 60_000 });

    const jtiFinal = await collectActiveJtiRevocations(redis, "revoked:", () => 2_000);
    const loginFinal = await collectActiveLoginFailureCounters(redis, "auth:login:fail:", () => 2_000);
    const stateFinal = await auditRedisG2AuthState(redis);
    expect(jtiFinal.records).toHaveLength(1);
    expect(loginFinal.activeLockouts).toBe(1);
    expect(stateFinal.stateCounts.devicePending).toBe(1);
    expect(stateFinal.stateCounts.pairingPending).toBe(2);
  });

  it("classifies malformed and unknown G2 values without returning keys or payloads", async () => {
    const redisState = new Map<string, { value: string; ttlMs: number }>([
      ["auth:login:fail:private@example.invalid", { value: "not-a-counter", ttlMs: 60_000 }],
      ["auth:login:fail:zero-counter", { value: "0", ttlMs: 60_000 }],
      ["auth:login:fail:hex-counter", { value: "0x5", ttlMs: 60_000 }],
      ["auth:login:fail:decimal-counter", { value: "5.0", ttlMs: 60_000 }],
      ["auth:login:fail:spaced-counter", { value: " 5 ", ttlMs: 60_000 }],
      ["auth:login:fail:below-threshold", { value: String(LOGIN_FAILURE_THRESHOLD - 1), ttlMs: 60_000 }],
      ["auth:login:fail:locked", { value: String(LOGIN_FAILURE_THRESHOLD), ttlMs: 60_000 }],
      ["devicecode:bad-state", { value: JSON.stringify({ authorized: "unknown" }), ttlMs: 60_000 }],
      ["devicecode:malformed-json", { value: "{broken", ttlMs: 60_000 }],
      ["runner:connect:device:unknown-state", { value: JSON.stringify({ status: "mystery" }), ttlMs: 60_000 }],
      ["runner:connect:user:private-user-code", { value: "private-user-code", ttlMs: 60_000 }],
    ]);

    const result = await auditRedisG2AuthState(fakeRedis(redisState));
    expect(result.stateCounts).toMatchObject({
      invalidLoginCounters: 5,
      activeLoginLockouts: 1,
      deviceUnclassified: 2,
      malformedValues: 1,
      pairingUnclassified: 2,
      pairingUserRecords: 1,
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("private@example.invalid");
    expect(serialized).not.toContain("private-user-code");
    expect(() => assertRedisG2AuthStateSafeToApply(result)).toThrow(/apply is blocked/);
  });

  it("counts paired device and user keys separately instead of implying deduplicated pairs", async () => {
    const redisState = new Map<string, { value: string; ttlMs: number }>([
      ["worker-connect:device:worker-secret", { value: JSON.stringify({ status: "approved" }), ttlMs: 60_000 }],
      ["worker-connect:user:user-secret", { value: "worker-secret", ttlMs: 60_000 }],
    ]);
    const result = await auditRedisG2AuthState(fakeRedis(redisState));
    expect(result.counts.workerDevice).toBe(1);
    expect(result.counts.workerUser).toBe(1);
    expect(result.stateCounts.pairingApproved).toBe(1);
    expect(result.stateCounts.pairingUserRecords).toBe(1);
    expect(result.stateCounts.pairingUnclassified).toBe(1);
    expect(() => assertRedisG2AuthStateSafeToApply(result)).toThrow(/apply is blocked/);
    expect(JSON.stringify(result)).not.toContain("worker-secret");
    expect(JSON.stringify(result)).not.toContain("user-secret");
  });
});
