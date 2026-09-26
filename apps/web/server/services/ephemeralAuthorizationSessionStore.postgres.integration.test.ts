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

describe.skipIf(!enabled)("PostgreSQL ephemeral authorization sessions", () => {
  const connectionString = process.env.DATABASE_URL ?? "";
  const makeStore = () => {
    const client = postgres(connectionString, { max: 4, connect_timeout: 5 });
    clients.push(client);
    return createEphemeralAuthorizationSessionStore(drizzle(client));
  };
  beforeAll(() => {
    if (!connectionString) throw new Error("DATABASE_URL is required when RUN_DB_INTEGRATION_TESTS=true");
  });
  afterAll(async () => {
    if (clients.length) await drizzle(clients[0]).delete(ephemeralAuthorizationSessions)
      .where(eq(ephemeralAuthorizationSessions.deviceCodeHash, (await import("../_core/revocation")).hashJti(deviceCode)));
    await Promise.all(clients.map((client) => client.end({ timeout: 5 })));
  });

  it("stores one paired record, supports both lookup paths across instances, and expires it", async () => {
    const first = makeStore();
    const second = makeStore();
    const session = { deviceCode, userCode, status: "pending" };
    await first.save(session, 60);
    await expect(second.getByDeviceCode(deviceCode)).resolves.toEqual(session);
    await expect(second.getByUserCode(userCode)).resolves.toEqual(session);
    const { hashJti } = await import("../_core/revocation");
    const [stored] = await drizzle(clients[0]).select().from(ephemeralAuthorizationSessions)
      .where(and(eq(ephemeralAuthorizationSessions.deviceCodeHash, hashJti(deviceCode)), eq(ephemeralAuthorizationSessions.userCodeHash, hashJti(userCode))));
    expect(stored).toBeDefined();
    expect(JSON.stringify(stored.sessionJson)).not.toContain(deviceCode);
    expect(JSON.stringify(stored.sessionJson)).not.toContain(userCode);
    await drizzle(clients[0]).update(ephemeralAuthorizationSessions)
      .set({ expiresAt: new Date(Date.now() - 1) })
      .where(eq(ephemeralAuthorizationSessions.deviceCodeHash, hashJti(deviceCode)));
    await expect(first.getByDeviceCode(deviceCode)).resolves.toBeNull();
    await first.cleanupExpired();
    await expect(second.getByUserCode(userCode)).resolves.toBeNull();
  });
});
