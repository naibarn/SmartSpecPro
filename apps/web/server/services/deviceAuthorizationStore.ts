import { and, eq, gt, lte } from "drizzle-orm";
import { oauthDeviceAuthorizations } from "../../drizzle/schema";
import { getDb, type DrizzleDB } from "../db";
import { hashJti } from "../_core/revocation";

export type DeviceAuthorizationStatus = "pending" | "authorized" | "consumed" | "expired" | "not_found";

export type DeviceAuthorizationRecord = {
  status: "pending" | "authorized" | "consumed";
  scopes: string[];
  intervalSeconds: number;
  expiresAt: Date;
  authorizedUserId: number | null;
  authorizedOpenId: string | null;
};

export type NewDeviceAuthorization = {
  deviceCode: string;
  userCode: string;
  scopes: string[];
  intervalSeconds: number;
  expiresAt: Date;
};

function publicRecord(row: typeof oauthDeviceAuthorizations.$inferSelect): DeviceAuthorizationRecord {
  return {
    status: row.status as DeviceAuthorizationRecord["status"],
    scopes: row.scopesJson,
    intervalSeconds: row.intervalSeconds,
    expiresAt: row.expiresAt,
    authorizedUserId: row.authorizedUserId,
    authorizedOpenId: row.authorizedOpenId,
  };
}

export function createDeviceAuthorizationStore(db: DrizzleDB) {
  async function findByHash(field: "deviceCodeHash" | "userCodeHash", code: string) {
    const digest = hashJti(code);
    const [row] = await db.select().from(oauthDeviceAuthorizations)
      .where(eq(oauthDeviceAuthorizations[field], digest)).limit(1);
    return row ?? null;
  }

  return {
    async issue(input: NewDeviceAuthorization): Promise<void> {
      const now = new Date();
      await db.delete(oauthDeviceAuthorizations).where(lte(oauthDeviceAuthorizations.expiresAt, now));
      await db.insert(oauthDeviceAuthorizations).values({
        deviceCodeHash: hashJti(input.deviceCode),
        userCodeHash: hashJti(input.userCode),
        status: "pending",
        scopesJson: input.scopes,
        intervalSeconds: input.intervalSeconds,
        expiresAt: input.expiresAt,
      });
    },

    async findByDeviceCode(deviceCode: string): Promise<DeviceAuthorizationRecord | null> {
      const row = await findByHash("deviceCodeHash", deviceCode);
      return row ? publicRecord(row) : null;
    },

    async findByUserCode(userCode: string): Promise<DeviceAuthorizationRecord | null> {
      const row = await findByHash("userCodeHash", userCode);
      return row ? publicRecord(row) : null;
    },

    async authorizeByUserCode(input: { userCode: string; userId: number; openId: string }): Promise<DeviceAuthorizationStatus> {
      const now = new Date();
      const [updated] = await db.update(oauthDeviceAuthorizations).set({
        status: "authorized",
        authorizedUserId: input.userId,
        authorizedOpenId: input.openId,
        authorizedAt: now,
      }).where(and(
        eq(oauthDeviceAuthorizations.userCodeHash, hashJti(input.userCode)),
        eq(oauthDeviceAuthorizations.status, "pending"),
        gt(oauthDeviceAuthorizations.expiresAt, now),
      )).returning({ deviceCodeHash: oauthDeviceAuthorizations.deviceCodeHash });
      if (updated) return "authorized";

      const current = await findByHash("userCodeHash", input.userCode);
      if (!current) return "not_found";
      if (current.expiresAt <= now) return "expired";
      return current.status as DeviceAuthorizationStatus;
    },

    async consumeByDeviceCode(deviceCode: string): Promise<{
      status: DeviceAuthorizationStatus;
      authorization?: DeviceAuthorizationRecord;
    }> {
      const now = new Date();
      const [consumed] = await db.update(oauthDeviceAuthorizations).set({
        status: "consumed",
        consumedAt: now,
      }).where(and(
        eq(oauthDeviceAuthorizations.deviceCodeHash, hashJti(deviceCode)),
        eq(oauthDeviceAuthorizations.status, "authorized"),
        gt(oauthDeviceAuthorizations.expiresAt, now),
      )).returning();
      if (consumed) return { status: "authorized", authorization: publicRecord(consumed) };

      const current = await findByHash("deviceCodeHash", deviceCode);
      if (!current) return { status: "not_found" };
      if (current.expiresAt <= now) return { status: "expired" };
      return { status: current.status as DeviceAuthorizationStatus };
    },
  };
}

export async function issueDeviceAuthorization(input: NewDeviceAuthorization): Promise<void> {
  await createDeviceAuthorizationStore(getDb()).issue(input);
}

export async function findDeviceAuthorizationByDeviceCode(deviceCode: string): Promise<DeviceAuthorizationRecord | null> {
  return createDeviceAuthorizationStore(getDb()).findByDeviceCode(deviceCode);
}

export async function findDeviceAuthorizationByUserCode(userCode: string): Promise<DeviceAuthorizationRecord | null> {
  return createDeviceAuthorizationStore(getDb()).findByUserCode(userCode);
}

export async function authorizeDeviceByUserCode(input: { userCode: string; userId: number; openId: string }): Promise<DeviceAuthorizationStatus> {
  return createDeviceAuthorizationStore(getDb()).authorizeByUserCode(input);
}

export async function consumeDeviceAuthorization(deviceCode: string): Promise<{
  status: DeviceAuthorizationStatus;
  authorization?: DeviceAuthorizationRecord;
}> {
  return createDeviceAuthorizationStore(getDb()).consumeByDeviceCode(deviceCode);
}
