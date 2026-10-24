import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { creditTransactions, tenants, users } from "../../drizzle/schema";
import { ENV } from "../_core/env";
import { sdk } from "../_core/sdk";
import { revokeJti } from "../_core/revocation";
// Explicit source extension avoids Node's ESM resolver preferring the stale
// generated CommonJS sibling (`db.js`) when Playwright loads this fixture.
import { getDb } from "../db.ts";

export const UAT_SESSION_TTL_MS = 10 * 60 * 1000;
const UAT_RUN_ID = process.env.SMARTSPEC_UAT_RUN_ID ?? randomUUID();
const UAT_RUN_SUFFIX = createHash("sha256").update(UAT_RUN_ID).digest("hex").slice(0, 12);
export const UAT_PRIMARY_TENANT_ID = `tenant-codex-${UAT_RUN_SUFFIX}`;
export const UAT_RESTRICTED_TENANT_ID = `tenant-codex-r-${UAT_RUN_SUFFIX}`;

export const UAT_IDENTITIES = {
  owner: {
    openId: `codex-uat-owner-${UAT_RUN_SUFFIX}`,
    email: `codex-uat-owner-${UAT_RUN_SUFFIX}@uat.invalid`,
    name: `Codex UAT Owner ${UAT_RUN_SUFFIX}`,
    role: "user" as const,
    tenantId: UAT_PRIMARY_TENANT_ID,
  },
  admin: {
    openId: `codex-uat-admin-${UAT_RUN_SUFFIX}`,
    email: `codex-uat-admin-${UAT_RUN_SUFFIX}@uat.invalid`,
    name: `Codex UAT Admin ${UAT_RUN_SUFFIX}`,
    role: "admin" as const,
    tenantId: UAT_PRIMARY_TENANT_ID,
  },
  member: {
    openId: `codex-uat-member-${UAT_RUN_SUFFIX}`,
    email: `codex-uat-member-${UAT_RUN_SUFFIX}@uat.invalid`,
    name: `Codex UAT Member ${UAT_RUN_SUFFIX}`,
    role: "user" as const,
    tenantId: UAT_PRIMARY_TENANT_ID,
  },
  restricted: {
    openId: `codex-uat-restricted-${UAT_RUN_SUFFIX}`,
    email: `codex-uat-restricted-${UAT_RUN_SUFFIX}@uat.invalid`,
    name: `Codex UAT Restricted ${UAT_RUN_SUFFIX}`,
    role: "user" as const,
    tenantId: UAT_RESTRICTED_TENANT_ID,
  },
} as const;

export type UatRole = keyof typeof UAT_IDENTITIES;

export type UatSession = {
  token: string;
  jti: string;
  expiresAt: number;
  userId: number;
  role: UatRole;
  tenantId: string;
};

type BrokerEnvironment = {
  nodeEnv?: string;
  enabled?: string;
  databaseUrl?: string;
};

/** The broker runs only in the local Codex/Playwright process, never as an API route. */
export function assertUatBrokerEnvironment(environment: BrokerEnvironment): void {
  if (environment.nodeEnv === "production") {
    throw new Error("UAT_BROKER_DISABLED_IN_PRODUCTION");
  }
  if (environment.enabled !== "true") {
    throw new Error("UAT_BROKER_NOT_ENABLED");
  }
  if (!environment.databaseUrl) {
    throw new Error("UAT_BROKER_DATABASE_REQUIRED");
  }

  let databaseUrl: URL;
  try {
    databaseUrl = new URL(environment.databaseUrl);
  } catch {
    throw new Error("UAT_BROKER_DATABASE_INVALID");
  }

  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  const databaseName = databaseUrl.pathname.replace(/^\//, "");
  if (!localHosts.has(databaseUrl.hostname) || databaseName !== "smartspec") {
    throw new Error("UAT_BROKER_LOCAL_DEVELOPMENT_DATABASE_REQUIRED");
  }
}

function assertConfiguredEnvironment(): void {
  assertUatBrokerEnvironment({
    nodeEnv: process.env.NODE_ENV,
    enabled: process.env.SMARTSPEC_UAT_SESSION_BROKER,
    databaseUrl: process.env.DATABASE_URL,
  });
  if (!ENV.jwtSecret || !ENV.appId) {
    throw new Error("UAT_BROKER_AUTH_CONFIGURATION_REQUIRED");
  }
}

async function ensureTenant(
  id: string,
  slug: string,
  name: string,
): Promise<void> {
  const db = getDb();
  const existing = await db.select({ id: tenants.id, slug: tenants.slug, name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, id))
    .limit(1);

  if (existing.length > 0) {
    if (existing[0]!.slug !== slug || existing[0]!.name !== name) {
      throw new Error("UAT_BROKER_TENANT_COLLISION");
    }
    return;
  }

  await db.insert(tenants).values({
    id,
    slug,
    name,
    status: "ACTIVE",
    plan: "FREE",
    isActive: true,
    featureFlags: {},
    created_at: new Date(),
  });
}

/** Idempotently creates only synthetic .invalid identities in the local dev database. */
export async function seedUatIdentities(): Promise<void> {
  assertConfiguredEnvironment();
  const db = getDb();
  await ensureTenant(
    UAT_PRIMARY_TENANT_ID,
    `codex-uat-${UAT_RUN_SUFFIX}`,
    `Codex UAT Tenant ${UAT_RUN_SUFFIX}`,
  );
  await ensureTenant(
    UAT_RESTRICTED_TENANT_ID,
    `codex-uat-r-${UAT_RUN_SUFFIX}`,
    `Codex UAT Isolated Tenant ${UAT_RUN_SUFFIX}`,
  );

  const rows: Array<[UatRole, (typeof UAT_IDENTITIES)[UatRole]]> = Object.entries(
    UAT_IDENTITIES,
  ) as Array<[UatRole, (typeof UAT_IDENTITIES)[UatRole]]>;

  for (const [role, identity] of rows) {
    const existing = await db.select({
      id: users.id,
      openId: users.openId,
      email: users.email,
      name: users.name,
    }).from(users).where(eq(users.openId, identity.openId)).limit(1);

    if (existing.length > 0 &&
        (existing[0]!.email !== identity.email || existing[0]!.name !== identity.name)) {
      throw new Error("UAT_BROKER_IDENTITY_COLLISION");
    }

    if (existing.length === 0) {
      await db.insert(users).values({
        openId: identity.openId,
        email: identity.email,
        normalizedEmail: identity.email,
        name: identity.name,
        loginMethod: "codex_uat",
        role: identity.role,
        currentTenantId: identity.tenantId,
        credits: 5_000,
        plan: "free",
        isDisabled: false,
      });
    } else {
      // A fixed test-only balance keeps real provider calls bounded and repeatable.
      await db.update(users).set({
        role: identity.role,
        currentTenantId: identity.tenantId,
        credits: 5_000,
        plan: "free",
        isDisabled: false,
        disabledReason: null,
      }).where(eq(users.openId, identity.openId));
    }

    if (role === "owner") {
      const [owner] = await db.select({ id: users.id })
        .from(users)
        .where(eq(users.openId, identity.openId))
        .limit(1);
      if (!owner) throw new Error("UAT_BROKER_OWNER_SEED_FAILED");
      await db.update(tenants)
        .set({ ownerId: owner.id })
        .where(eq(tenants.id, UAT_PRIMARY_TENANT_ID));
    }
  }
}

export async function issueUatSession(role: UatRole): Promise<UatSession> {
  assertConfiguredEnvironment();
  const identity = UAT_IDENTITIES[role];
  if (!identity) throw new Error("UAT_BROKER_ROLE_INVALID");

  const [user] = await getDb().select({
    id: users.id,
    openId: users.openId,
    email: users.email,
    name: users.name,
    role: users.role,
    currentTenantId: users.currentTenantId,
    isDisabled: users.isDisabled,
  }).from(users).where(eq(users.openId, identity.openId)).limit(1);

  if (!user || user.email !== identity.email || user.name !== identity.name ||
      user.currentTenantId !== identity.tenantId || user.isDisabled) {
    throw new Error("UAT_BROKER_IDENTITY_AUTHORIZATION_FAILED");
  }

  if (role === "admin" && user.role !== "admin") {
    throw new Error("UAT_BROKER_ROLE_AUTHORIZATION_FAILED");
  }
  if (role === "owner") {
    const [tenant] = await getDb().select({ ownerId: tenants.ownerId })
      .from(tenants).where(eq(tenants.id, UAT_PRIMARY_TENANT_ID)).limit(1);
    if (tenant?.ownerId !== user.id) {
      throw new Error("UAT_BROKER_OWNER_AUTHORIZATION_FAILED");
    }
  }

  const now = Date.now();
  const jti = randomUUID();
  const expiresAt = now + UAT_SESSION_TTL_MS;
  const token = await sdk.signSession({
    openId: identity.openId,
    appId: ENV.appId,
    name: user.name ?? identity.name,
    jti,
  }, { expiresInMs: UAT_SESSION_TTL_MS });

  const verified = await sdk.verifySession(token);
  if (!verified || verified.openId !== identity.openId || verified.jti !== jti) {
    throw new Error("UAT_BROKER_SESSION_VALIDATION_FAILED");
  }

  return { token, jti, expiresAt, userId: user.id, role, tenantId: identity.tenantId };
}

export async function getUatCreditSnapshot(role: UatRole): Promise<{
  userId: number;
  balance: number;
  usage: Array<{ amount: number; tenantId: string | null; createdAt: Date; metadata: unknown }>;
}> {
  assertConfiguredEnvironment();
  const identity = UAT_IDENTITIES[role];
  const [user] = await getDb().select({ id: users.id, credits: users.credits })
    .from(users).where(eq(users.openId, identity.openId)).limit(1);
  if (!user) throw new Error("UAT_BROKER_IDENTITY_NOT_FOUND");
  const usage = await getDb().select({
    amount: creditTransactions.amount,
    tenantId: creditTransactions.tenantId,
    createdAt: creditTransactions.createdAt,
    metadata: creditTransactions.metadata,
  }).from(creditTransactions)
    .where(eq(creditTransactions.userId, user.id))
    .orderBy(creditTransactions.createdAt);
  return { userId: user.id, balance: user.credits, usage };
}

export async function revokeUatSession(session: Pick<UatSession, "jti" | "expiresAt">): Promise<void> {
  assertConfiguredEnvironment();
  await revokeJti(session.jti, session.expiresAt);
}
