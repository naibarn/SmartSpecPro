import { TRPCError } from "@trpc/server";

import type { TrpcContext } from "../_core/context";

export async function verifyLiveBrowserTakeoverMfa(
  ctx: TrpcContext,
  rawCode: string,
): Promise<string> {
  const code = rawCode.trim();
  if (!code) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "A TOTP or recovery code is required for sensitive Live Browser takeover.",
    });
  }

  const { getDb } = await import("../db");
  const { users } = await import("../../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  const { decryptSecret, verifyTotp } = await import("./totpService");
  const bcrypt = await import("bcrypt");

  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database not available for Live Browser MFA verification.",
    });
  }

  const [user] = await db.select({
    id: users.id,
    twoFactorEnabled: users.twoFactorEnabled,
    twoFactorSecret: users.twoFactorSecret,
    recoveryCodes: users.recoveryCodes,
  }).from(users).where(eq(users.id, ctx.user!.id));

  if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Sensitive Live Browser takeover requires 2FA to be enabled for this account.",
    });
  }

  const secret = decryptSecret(user.twoFactorSecret);
  let valid = verifyTotp(secret, code);

  if (!valid && code.includes("-")) {
    const recoveryCodes = Array.isArray(user.recoveryCodes) ? [...user.recoveryCodes] : [];
    for (let index = 0; index < recoveryCodes.length; index += 1) {
      if (await bcrypt.compare(code, recoveryCodes[index])) {
        valid = true;
        recoveryCodes.splice(index, 1);
        await db.update(users)
          .set({ recoveryCodes })
          .where(eq(users.id, ctx.user!.id));
        break;
      }
    }
  }

  if (!valid) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Invalid MFA or recovery code for Live Browser takeover.",
    });
  }

  return new Date().toISOString();
}
