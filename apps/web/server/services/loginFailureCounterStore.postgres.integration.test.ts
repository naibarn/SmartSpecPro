import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { authLoginFailureCounters } from "../../drizzle/schema";
import { createLoginFailureCounterStore } from "./loginFailureCounterStore";
import { normalizeAuthEmail } from "./emailNormalization";
import { createHash } from "node:crypto";

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "true";
const clients: ReturnType<typeof postgres>[] = [];
let email = "";
let emailHash = "";

describe.skipIf(!enabled)("PostgreSQL login failure counter integration", () => {
  const connectionString = process.env.DATABASE_URL ?? "";
  const makeStore = () => {
    const client = postgres(connectionString, { max: 4, connect_timeout: 5 });
    clients.push(client);
    return createLoginFailureCounterStore(drizzle(client));
  };

  beforeAll(() => {
    if (!connectionString) throw new Error("DATABASE_URL is required when RUN_DB_INTEGRATION_TESTS=true");
    email = `migration-test-${crypto.randomUUID()}@example.invalid`;
    emailHash = createHash("sha256").update(normalizeAuthEmail(email), "utf8").digest("hex");
  });

  afterAll(async () => {
    if (enabled && clients.length > 0 && emailHash) {
      await drizzle(clients[0]).delete(authLoginFailureCounters)
        .where(eq(authLoginFailureCounters.emailHash, emailHash));
    }
    await Promise.all(clients.map((client) => client.end({ timeout: 5 })));
  });

  it("does not lose concurrent failed-login increments across connections and applies expiry/reset/import", async () => {
    const instanceA = makeStore();
    const instanceB = makeStore();
    const counts = await Promise.all(Array.from({ length: 12 }, (_, i) =>
      (i % 2 ? instanceA : instanceB).recordFailure(email),
    ));
    expect([...counts].sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    await expect(instanceA.isLocked(email)).resolves.toBe(true);

    await drizzle(clients[0]).update(authLoginFailureCounters)
      .set({ expiresAt: new Date(Date.now() - 1) })
      .where(eq(authLoginFailureCounters.emailHash, emailHash));
    await expect(instanceB.recordFailure(email)).resolves.toBe(1);
    await expect(instanceA.isLocked(email)).resolves.toBe(false);

    const [stored] = await drizzle(clients[1]).select({ emailHash: authLoginFailureCounters.emailHash })
      .from(authLoginFailureCounters).where(eq(authLoginFailureCounters.emailHash, emailHash));
    expect(stored.emailHash).not.toContain(email);
    await instanceA.clear(email);
    await expect(instanceB.isLocked(email)).resolves.toBe(false);

    await instanceA.importActive([{ email, failureCount: 5, expiresAt: null }]);
    await expect(instanceB.isLocked(email)).resolves.toBe(true);
    const [persistent] = await drizzle(clients[0]).select({ expiresAt: authLoginFailureCounters.expiresAt })
      .from(authLoginFailureCounters).where(eq(authLoginFailureCounters.emailHash, emailHash));
    expect(persistent.expiresAt).toBeNull();
    await instanceB.clear(email);
  });
});
