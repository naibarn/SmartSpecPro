import { createHash } from "node:crypto";

import { sql } from "drizzle-orm";

import { getDb } from "../db";
import type {
  Spec224VerificationLease,
  Spec224VerificationLeaseStore,
} from "./spec224VerificationResourceControl";
import { createSampledSpec224VerificationResourceControl } from "./spec224VerificationResourceControl";

type LeaseRow = {
  fencingVersion: number;
  heartbeatAt: Date | string;
  leaseExpiresAt: Date | string;
};

function ownerTokenHash(ownerToken: string): string {
  if (!ownerToken.trim() || ownerToken.length > 128) {
    throw new Error("SPEC224_VERIFICATION_OWNER_INVALID");
  }
  return createHash("sha256").update(ownerToken, "utf8").digest("hex");
}

function date(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function rowsFrom(result: unknown): LeaseRow[] {
  if (Array.isArray(result)) return result as LeaseRow[];
  if (result && typeof result === "object" && Symbol.iterator in result) {
    return Array.from(result as Iterable<LeaseRow>);
  }
  return [];
}

function fromRow(
  row: LeaseRow,
  input: { repositoryKey: string; ownerToken: string }
): Spec224VerificationLease {
  return {
    repositoryKey: input.repositoryKey,
    ownerToken: input.ownerToken,
    fencingVersion: Number(row.fencingVersion),
    heartbeatAt: date(row.heartbeatAt),
    expiresAt: date(row.leaseExpiresAt),
  };
}

/** PostgreSQL-backed TTL lease; owner tokens are hashed at rest and never returned by SQL. */
export function createDrizzleSpec224VerificationLeaseStore(): Spec224VerificationLeaseStore {
  return {
    async acquire(input) {
      const hash = ownerTokenHash(input.ownerToken);
      const result = await getDb().execute(sql`
        INSERT INTO "spec224_verification_leases"
          ("repositoryKey", "ownerTokenHash", "fencingVersion", "heartbeatAt", "leaseExpiresAt", "createdAt", "updatedAt")
        VALUES (${input.repositoryKey}, ${hash}, 1, ${input.now}, ${input.expiresAt}, ${input.now}, ${input.now})
        ON CONFLICT ("repositoryKey") DO UPDATE SET
          "ownerTokenHash" = EXCLUDED."ownerTokenHash",
          "fencingVersion" = CASE
            WHEN "spec224_verification_leases"."leaseExpiresAt" <= ${input.now}
              THEN "spec224_verification_leases"."fencingVersion" + 1
            ELSE "spec224_verification_leases"."fencingVersion"
          END,
          "heartbeatAt" = EXCLUDED."heartbeatAt",
          "leaseExpiresAt" = EXCLUDED."leaseExpiresAt",
          "updatedAt" = EXCLUDED."updatedAt"
        WHERE "spec224_verification_leases"."leaseExpiresAt" <= ${input.now}
           OR "spec224_verification_leases"."ownerTokenHash" = ${hash}
        RETURNING "fencingVersion", "heartbeatAt", "leaseExpiresAt"
      `);
      const [row] = rowsFrom(result);
      return row ? fromRow(row, input) : null;
    },

    async heartbeat(input) {
      const hash = ownerTokenHash(input.ownerToken);
      const result = await getDb().execute(sql`
        UPDATE "spec224_verification_leases"
        SET "heartbeatAt" = ${input.now}, "leaseExpiresAt" = ${input.expiresAt}, "updatedAt" = ${input.now}
        WHERE "repositoryKey" = ${input.repositoryKey}
          AND "ownerTokenHash" = ${hash}
          AND "fencingVersion" = ${input.fencingVersion}
          AND "leaseExpiresAt" > ${input.now}
        RETURNING "fencingVersion", "heartbeatAt", "leaseExpiresAt"
      `);
      const [row] = rowsFrom(result);
      return row ? fromRow(row, input) : null;
    },

    async release(input) {
      const hash = ownerTokenHash(input.ownerToken);
      const result = await getDb().execute(sql`
        UPDATE "spec224_verification_leases"
        SET "leaseExpiresAt" = ${input.now}, "updatedAt" = ${input.now}
        WHERE "repositoryKey" = ${input.repositoryKey}
          AND "ownerTokenHash" = ${hash}
          AND "fencingVersion" = ${input.fencingVersion}
        RETURNING "repositoryKey"
      `);
      return rowsFrom(result).length === 1;
    },
  };
}

/** Convenience entrypoint for server workers: durable lease plus live host/cgroup sampling. */
export function createPersistentSpec224VerificationResourceControl() {
  return createSampledSpec224VerificationResourceControl(
    createDrizzleSpec224VerificationLeaseStore()
  );
}
