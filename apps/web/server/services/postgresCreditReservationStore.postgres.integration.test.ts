import { afterAll, beforeAll, describe, expect, it } from "vitest";

const suite = process.env.RUN_CLOUDFLARE_PRODUCTION_DB_INTEGRATION === "true" ? describe : describe.skip;
suite("isolated PostgreSQL reservation settlement invariants", () => {
  let disposable: any, client: any, closeDb: any, store: typeof import("./postgresCreditReservationStore");
  const old = { url: process.env.DATABASE_URL, env: process.env.NODE_ENV };
  beforeAll(async () => {
    disposable = await (await import("./__tests__/support/spec277DisposablePostgres")).createSpec277DisposablePostgres();
    process.env.DATABASE_URL = disposable.databaseUrl; process.env.NODE_ENV = "test";
    client = (await import("postgres")).default(disposable.databaseUrl, { max: 5 });
    await client.unsafe(`CREATE TABLE credit_reservation_snapshots (
      reservation_id text PRIMARY KEY, payload jsonb NOT NULL, status text NOT NULL DEFAULT 'active',
      expires_at timestamptz NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
    const db = await import("../db"); closeDb = db.closeDb;
    store = await import("./postgresCreditReservationStore");
  }, 30_000);
  afterAll(async () => {
    if (closeDb) await closeDb(); if (client) await client.end({ timeout: 2 }); if (disposable) await disposable.close();
    if (old.url === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = old.url;
    if (old.env === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old.env;
  }, 20_000);
  it("settles a concurrent duplicate once and rejects changed amounts without changing the balance", async () => {
    await client`INSERT INTO credit_reservation_snapshots(reservation_id,payload,expires_at)
      VALUES ('synthetic-one', ${client.json({ reservedAmount: 5, drawnAmount: 0 })}::jsonb, now() + interval '10 minutes')`;
    const results = await Promise.all([store.drawCreditReservation("synthetic-one", 2, "same-key"), store.drawCreditReservation("synthetic-one", 2, "same-key")]);
    expect(results.filter(result => result.duplicate === false)).toHaveLength(1);
    expect(results.filter(result => result.duplicate === true)).toHaveLength(1);
    const [afterDuplicate] = await client`SELECT payload FROM credit_reservation_snapshots WHERE reservation_id='synthetic-one'`;
    expect(afterDuplicate.payload).toMatchObject({ reservedAmount: 5, drawnAmount: 2 });
    await expect(store.drawCreditReservation("synthetic-one", 3, "same-key")).rejects.toThrow("conflicts with prior amount");
    await expect(store.drawCreditReservation("synthetic-one", 4, "other-key")).rejects.toThrow("budget exceeded");
    const [row] = await client`SELECT payload FROM credit_reservation_snapshots WHERE reservation_id='synthetic-one'`;
    expect(row.payload).toMatchObject({ reservedAmount: 5, drawnAmount: 2, settledCallAmounts: { "same-key": 2 } });
  });
});
