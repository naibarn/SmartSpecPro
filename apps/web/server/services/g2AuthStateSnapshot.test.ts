import { describe, expect, it } from "vitest";
import { collectActiveJtiRevocations } from "./jtiRevocationImporter";
import { collectActiveLoginFailureCounters } from "./loginFailureCounterImporter";
import { auditRedisG2AuthState, type RedisG2StateReader } from "./redisG2AuthStateAudit";

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
});
