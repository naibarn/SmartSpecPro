import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { oauthDeviceAuthorizations } from "../../drizzle/schema";
import { createDeviceAuthorizationStore } from "./deviceAuthorizationStore";
import { hashJti } from "../_core/revocation";

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "true";
const clients: ReturnType<typeof postgres>[] = [];
const codes = new Set<{ device: string; user: string }>();
let actor: { id: number; openId: string };
let actorCreated = false;

describe.skipIf(!enabled)("PostgreSQL device authorization integration", () => {
  const connectionString = process.env.DATABASE_URL ?? "";
  const makeStore = () => {
    const client = postgres(connectionString, { max: 2, connect_timeout: 5 });
    clients.push(client);
    return createDeviceAuthorizationStore(drizzle(client));
  };

  beforeAll(async () => {
    if (!connectionString) throw new Error("DATABASE_URL is required when RUN_DB_INTEGRATION_TESTS=true");
    makeStore();
    const client = clients[0];
    const openId = `migration-test-${crypto.randomUUID()}`;
    const [dbActor] = await client`
      INSERT INTO "users" ("openId", "role", "plan", "credits", "isDisabled")
      VALUES (${openId}, 'user', 'free', 0, false)
      RETURNING "id", "openId"
    `;
    if (!dbActor) throw new Error("Could not create temporary integration actor");
    actor = { id: Number(dbActor.id), openId: String(dbActor.openId) };
    actorCreated = true;
  });

  afterAll(async () => {
    if (enabled && codes.size > 0) {
      const cleanupClient = postgres(connectionString, { max: 1, connect_timeout: 5 });
      const db = drizzle(cleanupClient);
      const rows = [...codes];
      await db.delete(oauthDeviceAuthorizations).where(inArray(
        oauthDeviceAuthorizations.deviceCodeHash,
        rows.map((entry) => hashJti(entry.device)),
      ));
      await db.delete(oauthDeviceAuthorizations).where(inArray(
        oauthDeviceAuthorizations.userCodeHash,
        rows.map((entry) => hashJti(entry.user)),
      ));
      await cleanupClient.end({ timeout: 5 });
    }
    if (enabled && actorCreated) {
      const cleanupClient = postgres(connectionString, { max: 1, connect_timeout: 5 });
      await cleanupClient`DELETE FROM "users" WHERE "id" = ${actor.id}`;
      await cleanupClient.end({ timeout: 5 });
    }
    await Promise.all(clients.map((client) => client.end({ timeout: 5 })));
  });

  it("persists only code digests and atomically authorizes and consumes one time across connections", async () => {
    const deviceCode = `device-${crypto.randomUUID()}`;
    const userCode = `USER-${crypto.randomUUID()}`;
    codes.add({ device: deviceCode, user: userCode });
    const instanceA = makeStore();
    const instanceB = makeStore();
    await instanceA.issue({
      deviceCode,
      userCode,
      scopes: ["mcp:read"],
      intervalSeconds: 5,
      expiresAt: new Date(Date.now() + 60_000),
    });

    expect(await instanceB.findByDeviceCode(deviceCode)).toMatchObject({ status: "pending", scopes: ["mcp:read"] });
    await expect(instanceB.consumeByDeviceCode(deviceCode)).resolves.toMatchObject({ status: "pending" });
    const authorizeResults = await Promise.all([
      instanceA.authorizeByUserCode({ userCode, userId: actor.id, openId: actor.openId }),
      instanceB.authorizeByUserCode({ userCode, userId: actor.id, openId: actor.openId }),
    ]);
    expect(authorizeResults).toEqual(["authorized", "authorized"]);

    const consumeResults = await Promise.all([
      instanceA.consumeByDeviceCode(deviceCode),
      instanceB.consumeByDeviceCode(deviceCode),
    ]);
    expect(consumeResults.filter((result) => result.status === "authorized")).toHaveLength(1);
    expect(consumeResults.filter((result) => result.status === "consumed")).toHaveLength(1);
    await expect(instanceA.consumeByDeviceCode(deviceCode)).resolves.toMatchObject({ status: "consumed" });

    const [stored] = await drizzle(clients[1]).select({ deviceCodeHash: oauthDeviceAuthorizations.deviceCodeHash, userCodeHash: oauthDeviceAuthorizations.userCodeHash })
      .from(oauthDeviceAuthorizations).where(inArray(oauthDeviceAuthorizations.deviceCodeHash, [hashJti(deviceCode)]));
    expect(stored.deviceCodeHash).toBe(hashJti(deviceCode));
    expect(stored.userCodeHash).toBe(hashJti(userCode));
    expect(stored.deviceCodeHash).not.toContain(deviceCode);
    expect(stored.userCodeHash).not.toContain(userCode);
  });

  it("rejects authorization after expiration and returns pending without consuming", async () => {
    const deviceCode = `expired-device-${crypto.randomUUID()}`;
    const userCode = `EXPD-${crypto.randomUUID()}`;
    codes.add({ device: deviceCode, user: userCode });
    const store = makeStore();
    await store.issue({ deviceCode, userCode, scopes: [], intervalSeconds: 5, expiresAt: new Date(Date.now() + 60_000) });
    await expect(store.findByDeviceCode(deviceCode)).resolves.toMatchObject({ status: "pending" });
    await drizzle(clients[clients.length - 1]).update(oauthDeviceAuthorizations)
      .set({ expiresAt: new Date(Date.now() - 1) })
      .where(eq(oauthDeviceAuthorizations.deviceCodeHash, hashJti(deviceCode)));
    await expect(store.authorizeByUserCode({ userCode, userId: actor.id, openId: actor.openId })).resolves.toBe("expired");
    await expect(store.consumeByDeviceCode(deviceCode)).resolves.toMatchObject({ status: "expired" });
  });
});
