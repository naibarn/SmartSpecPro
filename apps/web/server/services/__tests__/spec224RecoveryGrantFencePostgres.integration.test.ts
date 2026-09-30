import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, getDb } from "../../db";
import { acquireSpec224RecoveryGrantFence } from "../spec224RecoveryGrantFence";

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "true";
const describeDb = enabled ? describe : describe.skip;
const tenantId = "00000000-0000-4000-8000-000000000224";
const grantId = "00000000-0000-4000-8000-000000000376";
const sleep = (milliseconds: number) =>
  new Promise(resolve => setTimeout(resolve, milliseconds));

describeDb("Spec 224 cross-service grant fence PostgreSQL", () => {
  beforeAll(() => {
    getDb();
  });

  afterAll(async () => {
    await db.instance.$client.end({ timeout: 5 });
  });

  it("serializes the same tenant/grant identity until the owning transaction commits", async () => {
    let releaseHolder!: () => void;
    let signalHolder!: () => void;
    const held = new Promise<void>(resolve => {
      signalHolder = resolve;
    });
    const release = new Promise<void>(resolve => {
      releaseHolder = resolve;
    });

    const holder = db.transaction(async tx => {
      await acquireSpec224RecoveryGrantFence(tx, { tenantId, grantId });
      signalHolder();
      await release;
    });
    await held;

    let contenderAcquired = false;
    const contender = db.transaction(async tx => {
      await acquireSpec224RecoveryGrantFence(tx, { tenantId, grantId });
      contenderAcquired = true;
    });
    await sleep(150);
    const blockedUntilCommit = !contenderAcquired;
    releaseHolder();
    await Promise.all([holder, contender]);

    expect(blockedUntilCommit).toBe(true);
    expect(contenderAcquired).toBe(true);
  });
});
