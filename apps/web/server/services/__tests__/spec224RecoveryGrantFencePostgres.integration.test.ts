import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";

import { db, getDb } from "../../db";
import {
  acquireSpec224RecoveryGrantFence,
  spec224RecoveryGrantFenceIdentity,
} from "../spec224RecoveryGrantFence";

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "true";
const describeDb = enabled ? describe : describe.skip;
const tenantId = "00000000-0000-4000-8000-000000000224";
const grantId = "00000000-0000-4000-8000-000000000376";
const sleep = (milliseconds: number) =>
  new Promise(resolve => setTimeout(resolve, milliseconds));
const vectorsPath = resolve(
  import.meta.dirname,
  "fixtures/spec224RecoveryGrantFenceVectors.json"
);

type FenceVector = {
  tenantId: string;
  grantId: string;
  identity: string;
  key: string;
};

describeDb("Spec 224 cross-service grant fence PostgreSQL", () => {
  beforeAll(() => {
    getDb();
  });

  it("matches the shared cross-language PostgreSQL advisory-key golden vectors", async () => {
    const vectors = JSON.parse(await readFile(vectorsPath, "utf8")) as {
      schemaVersion: string;
      seed: number;
      vectors: FenceVector[];
    };
    expect(vectors.schemaVersion).toBe("spec224.recovery-grant-fence.v1");
    expect(vectors.seed).toBe(224);
    for (const vector of vectors.vectors) {
      expect(spec224RecoveryGrantFenceIdentity(vector)).toBe(vector.identity);
      const result = await db.instance.execute<{ key: string }>(sql`
        SELECT hashtextextended(${vector.identity}, ${vectors.seed})::text AS key
      `);
      expect(String(result[0]?.key)).toBe(vector.key);
    }
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

  it("releases the transaction-scoped fence after rollback", async () => {
    await expect(
      db.transaction(async tx => {
        await acquireSpec224RecoveryGrantFence(tx, { tenantId, grantId });
        throw new Error("intentional rollback after acquiring test fence");
      })
    ).rejects.toThrow("intentional rollback");

    let acquiredAfterRollback = false;
    await db.transaction(async tx => {
      await acquireSpec224RecoveryGrantFence(tx, { tenantId, grantId });
      acquiredAfterRollback = true;
    });
    expect(acquiredAfterRollback).toBe(true);
  });
});
