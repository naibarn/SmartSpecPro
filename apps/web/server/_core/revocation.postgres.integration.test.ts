import { afterAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { revokedTokenJtis } from "../../drizzle/schema";
import { createJtiRevocationService, createPostgresJtiRevocationStore, hashJti } from "./revocation";

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "true";
const clients: ReturnType<typeof postgres>[] = [];
const usedJtis = new Set<string>();

describe.skipIf(!enabled)("PostgreSQL JTI revocation integration", () => {
  const connectionString = process.env.DATABASE_URL ?? "";

  const makeService = () => {
    const client = postgres(connectionString, { max: 1, connect_timeout: 5 });
    clients.push(client);
    return createJtiRevocationService(createPostgresJtiRevocationStore(drizzle(client)));
  };

  afterAll(async () => {
    if (enabled && usedJtis.size > 0) {
      const cleanupClient = postgres(connectionString, { max: 1, connect_timeout: 5 });
      await drizzle(cleanupClient)
        .delete(revokedTokenJtis)
        .where(inArray(revokedTokenJtis.jtiHash, [...usedJtis].map(hashJti)));
      await cleanupClient.end({ timeout: 5 });
    }
    await Promise.all(clients.map((client) => client.end({ timeout: 5 })));
  });

  it("makes concurrent revokes visible across separate database connections", async () => {
    const tokenId = `migration-test-${crypto.randomUUID()}`;
    usedJtis.add(tokenId);
    const instanceA = makeService();
    const instanceB = makeService();
    await Promise.all([
      instanceA.revokeJti(tokenId, Date.now() + 30_000),
      instanceB.revokeJti(tokenId, Date.now() + 120_000),
    ]);
    await expect(instanceA.isJtiRevoked(tokenId)).resolves.toBe(true);
    await expect(instanceB.isJtiRevoked(tokenId)).resolves.toBe(true);
    const client = clients[0];
    const [row] = await client`
      SELECT "expires_at" FROM "revoked_token_jtis" WHERE "jti_hash" = ${hashJti(tokenId)}
    `;
    expect(new Date(row.expires_at).getTime()).toBeGreaterThan(Date.now() + 60_000);
  });

  it("expires a stored revocation without deleting it before its deadline", async () => {
    const tokenId = `migration-expiry-${crypto.randomUUID()}`;
    usedJtis.add(tokenId);
    const service = makeService();
    const store = createPostgresJtiRevocationStore(drizzle(clients[clients.length - 1]));
    await store.upsert([{ jtiHash: hashJti(tokenId), expiresAt: new Date(Date.now() + 250) }]);
    await expect(service.isJtiRevoked(tokenId)).resolves.toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 300));
    await expect(service.isJtiRevoked(tokenId)).resolves.toBe(false);
  });
});
