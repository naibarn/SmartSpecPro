import { describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import { deviceFingerprints } from "../../../drizzle/schema";
import { getInviteCodeStatsCutoff } from "../inviteCode";

describe("invite code stats cutoff", () => {
  it("returns an ISO string safe for postgres-js SQL parameters", () => {
    const cutoff = getInviteCodeStatsCutoff(new Date("2026-08-20T13:47:22.140Z"));

    expect(cutoff).toBe("2026-07-21T13:47:22.140Z");
    expect(typeof cutoff).toBe("string");
  });
});

const dbIntegration = process.env.RUN_DB_INTEGRATION_TESTS === "true" && Boolean(process.env.DATABASE_URL)
  ? describe
  : describe.skip;

dbIntegration("invite code fraud stats query", () => {
  it("keeps the count alias available to the outer aggregate", async () => {
    const client = postgres(process.env.DATABASE_URL!);
    const db = drizzle(client);

    try {
      const cutoff = getInviteCodeStatsCutoff(new Date("2026-08-20T14:22:04.119Z"));
      const [fraudStats] = await db
        .select({
          devicesWithMultipleAccounts: sql<number>`count(*) filter (where cnt >= 2)::int`,
          devicesAtLimit: sql<number>`count(*) filter (where cnt >= 3)::int`,
        })
        .from(
          db
            .select({
              fp: deviceFingerprints.fingerprintHash,
              cnt: sql<number>`count(distinct ${deviceFingerprints.userId})::int`.as("cnt"),
            })
            .from(deviceFingerprints)
            .where(sql`${deviceFingerprints.firstSeenAt} >= ${cutoff}`)
            .groupBy(deviceFingerprints.fingerprintHash)
            .as("fp_counts"),
        );

      expect(fraudStats).toBeDefined();
    } finally {
      await client.end();
    }
  });
});
