import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { ephemeralAuthorizationSessions } from "../../drizzle/schema";
import { createEphemeralAuthorizationSessionStore } from "./ephemeralAuthorizationSessionStore";

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "true";
const clients: ReturnType<typeof postgres>[] = [];
const deviceCode = crypto.randomUUID();
const userCode = crypto.randomUUID().slice(0, 8);
const previousKeyring = process.env.AUTH_SESSION_ENCRYPTION_KEYS_JSON;
const previousActiveKeyId = process.env.AUTH_SESSION_ENCRYPTION_ACTIVE_KEY_ID;
const oldKey = Buffer.alloc(32, 1).toString("base64");
const nextKey = Buffer.alloc(32, 2).toString("base64");

describe.skipIf(!enabled)("PostgreSQL ephemeral authorization sessions", () => {
  const connectionString = process.env.DATABASE_URL ?? "";
  const makeStore = () => {
    const client = postgres(connectionString, { max: 4, connect_timeout: 5 });
    clients.push(client);
    return createEphemeralAuthorizationSessionStore(drizzle(client));
  };
  beforeAll(() => {
    if (!connectionString) throw new Error("DATABASE_URL is required when RUN_DB_INTEGRATION_TESTS=true");
    process.env.AUTH_SESSION_ENCRYPTION_KEYS_JSON = JSON.stringify({ old: oldKey, next: nextKey });
    process.env.AUTH_SESSION_ENCRYPTION_ACTIVE_KEY_ID = "old";
  });
  afterAll(async () => {
    if (clients.length) await drizzle(clients[0]).delete(ephemeralAuthorizationSessions)
      .where(eq(ephemeralAuthorizationSessions.deviceCodeHash, (await import("../_core/revocation")).hashJti(deviceCode)));
    await Promise.all(clients.map((client) => client.end({ timeout: 5 })));
    if (previousKeyring === undefined) delete process.env.AUTH_SESSION_ENCRYPTION_KEYS_JSON;
    else process.env.AUTH_SESSION_ENCRYPTION_KEYS_JSON = previousKeyring;
    if (previousActiveKeyId === undefined) delete process.env.AUTH_SESSION_ENCRYPTION_ACTIVE_KEY_ID;
    else process.env.AUTH_SESSION_ENCRYPTION_ACTIVE_KEY_ID = previousActiveKeyId;
  });

  it("stores one paired record, supports both lookup paths across instances, and expires it", async () => {
    const first = makeStore();
    const second = makeStore();
    const session = { deviceCode, userCode, status: "pending" };
    await first.save(session, 60);
    process.env.AUTH_SESSION_ENCRYPTION_ACTIVE_KEY_ID = "next";
    await expect(second.getByDeviceCode(deviceCode)).resolves.toEqual(session);
    await expect(first.rotateEncryptionKeyBatch(100)).resolves.toEqual({ scanned: 1, rotated: 1 });
    await expect(second.getByUserCode(userCode)).resolves.toEqual(session);
    const { hashJti } = await import("../_core/revocation");
    const [stored] = await drizzle(clients[0]).select().from(ephemeralAuthorizationSessions)
      .where(and(eq(ephemeralAuthorizationSessions.deviceCodeHash, hashJti(deviceCode)), eq(ephemeralAuthorizationSessions.userCodeHash, hashJti(userCode))));
    expect(stored).toBeDefined();
    expect(JSON.stringify(stored.sessionJson)).not.toContain(deviceCode);
    expect(JSON.stringify(stored.sessionJson)).not.toContain(userCode);
    expect((stored.sessionJson as { keyId: string }).keyId).toBe("next");
    await drizzle(clients[0]).update(ephemeralAuthorizationSessions)
      .set({ expiresAt: new Date(Date.now() - 1) })
      .where(eq(ephemeralAuthorizationSessions.deviceCodeHash, hashJti(deviceCode)));
    await expect(first.getByDeviceCode(deviceCode)).resolves.toBeNull();
    await first.cleanupExpired();
    await expect(second.getByUserCode(userCode)).resolves.toBeNull();
  });
});
