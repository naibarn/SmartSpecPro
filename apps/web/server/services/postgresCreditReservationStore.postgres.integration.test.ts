import { afterAll, beforeAll, describe, expect, it } from "vitest";

const suite = process.env.RUN_CLOUDFLARE_PRODUCTION_DB_INTEGRATION === "true" ? describe : describe.skip;
suite("isolated PostgreSQL reservation settlement invariants", () => {
  let disposable: any, client: any, closeDb: any, store: typeof import("./postgresCreditReservationStore");
  const old = { url: process.env.DATABASE_URL, env: process.env.NODE_ENV };
  beforeAll(async () => {
    disposable = await (await import("./__tests__/support/spec277DisposablePostgres")).createSpec277DisposablePostgres();
    process.env.DATABASE_URL = disposable.databaseUrl; process.env.NODE_ENV = "test";
    client = (await import("postgres")).default(disposable.databaseUrl, { max: 5 });
    const schema = await import("../../drizzle/schema");
    await (await import("./__tests__/support/spec277AutoTeamRuntimeSchema")).installSpec277AutoTeamRuntimeSchema(client, [schema.users, schema.creditTransactions]);
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
  it("rejects malformed stored amounts before any settlement write", async () => {
    await client`INSERT INTO credit_reservation_snapshots(reservation_id,payload,expires_at)
      VALUES ('synthetic-invalid', ${client.json({ reservedAmount: 5, drawnAmount: null })}::jsonb, now() + interval '10 minutes')`;
    await expect(store.drawCreditReservation("synthetic-invalid", 1, "key")).rejects.toThrow("snapshot is malformed");
    const [row] = await client`SELECT payload FROM credit_reservation_snapshots WHERE reservation_id='synthetic-invalid'`;
    expect(row.payload).toEqual({ reservedAmount: 5, drawnAmount: null });
  });
  it("uses the existing credit ledger to reserve, settle, refund and cancel synthetic credits", async () => {
    await client`INSERT INTO users(id,"openId",credits,"isDisabled") VALUES (701,'synthetic-credit-701',20,false)`;
    const credit = await import("./creditService");
    const reservation = await credit.createCreditReservation(701, 8, "chat", undefined, "synthetic-ledger-reservation");
    expect((await credit.createCreditReservation(701, 8, "chat", undefined, "synthetic-ledger-reservation")).transactionId).toBe(reservation.transactionId);
    const settled = await Promise.all([credit.drawFromReservation(reservation.reservationId, 3, undefined, "synthetic-call"),
      credit.drawFromReservation(reservation.reservationId, 3, undefined, "synthetic-call")]);
    expect(settled.filter(result => result.duplicate === false)).toHaveLength(1);
    expect(settled.filter(result => result.duplicate === true)).toHaveLength(1);
    await expect(credit.drawFromReservation(reservation.reservationId, 4, undefined, "synthetic-call")).rejects.toThrow("conflicts with prior amount");
    expect((await credit.refundReservation(reservation.reservationId)).refundedAmount).toBe(5);
    const cancelled = await credit.createCreditReservation(701, 4, "chat", undefined, "synthetic-ledger-cancel");
    expect((await credit.refundReservation(cancelled.reservationId)).refundedAmount).toBe(4);
    const [user] = await client`SELECT credits FROM users WHERE id=701`;
    const [ledger] = await client`SELECT sum(amount)::int total FROM credit_transactions WHERE "userId"=701`;
    expect(user.credits).toBe(17); expect(ledger.total).toBe(-3);
  });
  it("recovers an interrupted refund without crediting the synthetic account twice", async () => {
    await client`INSERT INTO users(id,"openId",credits,"isDisabled") VALUES (702,'synthetic-credit-702',20,false)`;
    const credit = await import("./creditService");
    const reservation = await credit.createCreditReservation(702, 8, "chat", undefined, "synthetic-interrupted-refund");
    await credit.drawFromReservation(reservation.reservationId, 3, undefined, "synthetic-interrupted-call");
    // Simulate a process interruption after the close intent was recorded.
    expect(await store.beginCreditReservationClose(reservation.reservationId, "refunding")).not.toBeNull();
    expect((await credit.refundReservation(reservation.reservationId)).refundedAmount).toBe(5);
    expect((await credit.refundReservation(reservation.reservationId)).refundedAmount).toBe(0);
    const [user] = await client`SELECT credits FROM users WHERE id=702`;
    const [ledger] = await client`SELECT sum(amount)::int total FROM credit_transactions WHERE "userId"=702`;
    expect(user.credits).toBe(17); expect(ledger.total).toBe(-3);
  });
  it("prevents concurrent reservations from spending more than the synthetic balance", async () => {
    await client`INSERT INTO users(id,"openId",credits,"isDisabled") VALUES (703,'synthetic-credit-703',10,false)`;
    const credit = await import("./creditService");
    const outcomes = await Promise.allSettled([
      credit.createCreditReservation(703, 7, "chat", undefined, "synthetic-concurrent-one"),
      credit.createCreditReservation(703, 7, "chat", undefined, "synthetic-concurrent-two"),
    ]);
    expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(result => result.status === "rejected")).toHaveLength(1);
    const [user] = await client`SELECT credits FROM users WHERE id=703`;
    const [ledger] = await client`SELECT sum(amount)::int total FROM credit_transactions WHERE "userId"=703`;
    expect(user.credits).toBe(3); expect(ledger.total).toBe(-7);
  });
  it("rejects a debit retry with the same key for a different synthetic account or amount", async () => {
    await client`INSERT INTO users(id,"openId",credits,"isDisabled") VALUES
      (704,'synthetic-credit-704',20,false),(705,'synthetic-credit-705',20,false)`;
    const credit = await import("./creditService");
    const key = "synthetic-foreign-debit";
    const first = await credit.deductCredits({ userId: 704, amount: 5, description: "synthetic", idempotencyKey: key });
    const retry = await credit.deductCredits({ userId: 704, amount: 5, description: "synthetic", idempotencyKey: key });
    expect(retry.transactionId).toBe(first.transactionId);
    await expect(credit.deductCredits({ userId: 705, amount: 5, description: "synthetic", idempotencyKey: key }))
      .rejects.toThrow("Credit idempotency key conflicts with prior transaction");
    await expect(credit.deductCredits({ userId: 704, amount: 6, description: "synthetic", idempotencyKey: key }))
      .rejects.toThrow("Credit idempotency key conflicts with prior transaction");
    const rows = await client`SELECT id,credits FROM users WHERE id IN (704,705) ORDER BY id`;
    expect(rows.map((row: any) => row.credits)).toEqual([15,20]);
  });
  it("binds a tenant-scoped debit to the user's current tenant", async () => {
    await client`INSERT INTO users(id,"openId",credits,"isDisabled","currentTenantId") VALUES
      (706,'synthetic-credit-706',20,false,'tenant-synthetic-a')`;
    const credit = await import("./creditService");
    await expect(credit.deductCredits({ userId: 706, amount: 4, description: "synthetic", tenantId: "tenant-synthetic-b", skipBudgetCheck: true }))
      .rejects.toThrow("Credit tenant scope mismatch");
    const result = await credit.deductCredits({ userId: 706, amount: 4, description: "synthetic", tenantId: "tenant-synthetic-a", skipBudgetCheck: true });
    expect(result.creditsUsed).toBe(4);
    const [row] = await client`SELECT credits FROM users WHERE id=706`;
    expect(row.credits).toBe(16);
  });
});
