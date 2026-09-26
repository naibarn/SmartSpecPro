import { describe, expect, it } from "vitest";
import {
  createJtiRevocationService,
  hashJti,
  type JtiRevocationRecord,
  type JtiRevocationStore,
} from "./revocation";

function createSharedTestStore(): JtiRevocationStore {
  const rows = new Map<string, Date | null>();
  return {
    async upsert(records) {
      for (const record of records) {
        const previous = rows.get(record.jtiHash);
        if (!rows.has(record.jtiHash) || previous !== null && record.expiresAt === null ||
            previous && record.expiresAt && record.expiresAt > previous) {
          rows.set(record.jtiHash, record.expiresAt);
        }
      }
    },
    async hasActive(jtiHash, now) {
      if (!rows.has(jtiHash)) return false;
      const expiry = rows.get(jtiHash);
      return expiry === null || expiry!.getTime() > now.getTime();
    },
  };
}

describe("PostgreSQL JTI revocation contract", () => {
  it("shares revocations across independent service instances", async () => {
    const store = createSharedTestStore();
    const instanceA = createJtiRevocationService(store);
    const instanceB = createJtiRevocationService(store);
    await instanceA.revokeJti("cross-instance-jti", Date.now() + 60_000);
    await expect(instanceB.isJtiRevoked("cross-instance-jti")).resolves.toBe(true);
  });

  it("retains the longest expiry during concurrent revoke requests", async () => {
    const store = createSharedTestStore();
    const serviceA = createJtiRevocationService(store);
    const serviceB = createJtiRevocationService(store);
    const shortExpiry = Date.now() + 30_000;
    const longExpiry = Date.now() + 120_000;
    await Promise.all([
      serviceA.revokeJti("concurrent-jti", shortExpiry),
      serviceB.revokeJti("concurrent-jti", longExpiry),
    ]);
    await expect(store.hasActive(hashJti("concurrent-jti"), new Date(Date.now() + 60_000))).resolves.toBe(true);
  });

  it("stops considering an expired revocation active", async () => {
    const store = createSharedTestStore();
    const service = createJtiRevocationService(store, () => 10_000);
    await service.revokeJti("expiring-jti", 10_100);
    await expect(service.isJtiRevoked("expiring-jti")).resolves.toBe(true);
    const later = createJtiRevocationService(store, () => 12_000);
    await expect(later.isJtiRevoked("expiring-jti")).resolves.toBe(false);
  });

  it("fails closed on storage errors or malformed token identifiers", async () => {
    const broken: JtiRevocationStore = {
      upsert: async () => { throw new Error("database unavailable"); },
      hasActive: async () => { throw new Error("database unavailable"); },
    };
    const service = createJtiRevocationService(broken);
    await expect(service.revokeJti("write-failure", Date.now() + 60_000)).rejects.toThrow("database unavailable");
    await expect(service.isJtiRevoked("x".repeat(513))).resolves.toBe(true);
    await expect(service.isJtiRevoked("read-failure")).resolves.toBe(true);
  });

  it("stores only a stable digest, never the original JTI", async () => {
    const records: JtiRevocationRecord[][] = [];
    const store: JtiRevocationStore = {
      async upsert(batch) { records.push(batch); },
      async hasActive() { return false; },
    };
    const jti = "do-not-persist-this-jti";
    await createJtiRevocationService(store).revokeJti(jti, Date.now() + 60_000);
    expect(records[0][0].jtiHash).toBe(hashJti(jti));
    expect(records[0][0].jtiHash).not.toContain(jti);
    expect(records[0][0].expiresAt).toBeInstanceOf(Date);
  });

  it("writes the rollback mirror before PostgreSQL and keeps mirror failure fail-closed", async () => {
    const events: string[] = [];
    const store: JtiRevocationStore = {
      async upsert() { events.push("postgres"); },
      async hasActive() { return false; },
    };
    const mirror = {
      async put() { events.push("redis"); },
      async has() { return false; },
    };
    const service = createJtiRevocationService(store, Date.now, mirror);
    await service.revokeJti("mirrored-jti", Date.now() + 60_000);
    expect(events).toEqual(["redis", "postgres"]);

    const failingStore: JtiRevocationStore = { ...store, async upsert() { events.push("should-not-write"); } };
    const failedMirror = { ...mirror, async put() { throw new Error("redis unavailable"); } };
    await expect(createJtiRevocationService(failingStore, Date.now, failedMirror)
      .revokeJti("mirror-failure", Date.now() + 60_000)).rejects.toThrow("redis unavailable");
    expect(events).not.toContain("should-not-write");
  });

  it("recognizes mirror-only revocations during recovery and fails closed if the mirror is unavailable", async () => {
    const store: JtiRevocationStore = { async upsert() {}, async hasActive() { return false; } };
    const bridge = createJtiRevocationService(store, Date.now, {
      async put() {},
      async has(jti) { return jti === "mirror-only"; },
    });
    await expect(bridge.isJtiRevoked("mirror-only")).resolves.toBe(true);
    const failedBridge = createJtiRevocationService(store, Date.now, {
      async put() {}, async has() { throw new Error("redis unavailable"); },
    });
    await expect(failedBridge.isJtiRevoked("unknown")).resolves.toBe(true);
  });
});
