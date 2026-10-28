import { afterEach, describe, expect, it, vi } from "vitest";
import { canonicalProjects, providerDeploymentCredentials, providerDeploymentTargets, systemSettings } from "../../drizzle/schema";
import { encrypt } from "./crypto";
import { bindPlatformCloudflareCredentialProfile, getPlatformCloudflareCredentialBindingState, withCloudflareDeploymentCredential } from "./cloudflareCredentialCenter";
import { deploymentCredentialRef } from "./providerDeploymentTargetAuthority";

const key = "cloudflare-platform-binding-tests-key";
const accountId = "0123456789abcdef0123456789abcdef";
const zoneId = "abcdef0123456789abcdef0123456789";
const token = "cloudflare-platform-secret-token";
const identity = { tenantId: "tenant-platform", projectId: "platform-project", environment: "staging", provider: "cloudflare" };
const credentialRef = deploymentCredentialRef(identity);
const project = { projectType: "platform-deployment", lifecycle: "ACTIVE" };
const target = { id: "target-row-1", enabled: true, deploymentTargetId: "smartspec-cloudflare-staging", accountRef: accountId,
  workerRef: "smartspec-cloudflare-staging", credentialRef };

function binding() {
  return { version: 1, profileId: "deployment", ...identity, targetRowId: target.id, targetId: target.deploymentTargetId,
    accountId, workerRef: target.workerRef, zoneId, boundAt: "2026-10-29T00:00:00.000Z" };
}

function setting(value: string, isSensitive = false) { return { value, isSensitive, updatedAt: new Date("2026-10-29T00:00:00.000Z") }; }

function dbFor(input: {
  projectRows?: unknown[][];
  targetRows?: unknown[][];
  credentialRows?: unknown[][];
  settingRows?: unknown[][];
  inserted?: Array<Record<string, unknown>>;
} = {}) {
  const counts = new Map<unknown, number>();
  const responses = new Map<unknown, unknown[][]>([
    [canonicalProjects, input.projectRows ?? [[project]]],
    [providerDeploymentTargets, input.targetRows ?? [[target]]],
    [providerDeploymentCredentials, input.credentialRows ?? [[]]],
    [systemSettings, input.settingRows ?? [
      [{ value: JSON.stringify(binding()), updatedAt: new Date("2026-10-29T00:00:00.000Z") }],
      [setting(accountId)],
      [setting(encrypt(JSON.stringify({ deployment: { token, label: "platform", updatedAt: "2026-10-29T00:00:00.000Z" } }), key), true)],
    ]],
  ]);
  const db = {
    select: vi.fn(() => {
      let table: unknown;
      const query = {
        from: (value: unknown) => { table = value; return query; },
        where: () => query,
        take: () => {
          const index = counts.get(table) ?? 0;
          counts.set(table, index + 1);
          const rows = responses.get(table) ?? [];
          return rows[Math.min(index, Math.max(rows.length - 1, 0))] ?? [];
        },
        limit: async () => query.take(),
        then: (resolve: (rows: unknown[]) => unknown, reject?: (error: unknown) => unknown) =>
          Promise.resolve(query.take()).then(resolve, reject),
      };
      return query;
    }),
    insert: vi.fn(() => ({ values: async (value: Record<string, unknown>) => { input.inserted?.push(value); } })),
    update: vi.fn(() => ({ set: () => ({ where: async () => undefined }) })),
    delete: vi.fn(() => ({ where: () => ({ returning: async () => [] }) })),
    transaction: async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => fn({
      execute: async () => undefined,
      select: vi.fn(() => {
        let table: unknown;
        const query = {
          from: (value: unknown) => { table = value; return query; },
          where: () => query,
          take: () => {
            const index = counts.get(table) ?? 0;
            counts.set(table, index + 1);
            const rows = responses.get(table) ?? [];
            return rows[Math.min(index, Math.max(rows.length - 1, 0))] ?? [];
          },
          limit: async () => query.take(),
          then: (resolve: (rows: unknown[]) => unknown, reject?: (error: unknown) => unknown) =>
            Promise.resolve(query.take()).then(resolve, reject),
        };
        return query;
      }),
      insert: vi.fn(() => ({ values: async (value: Record<string, unknown>) => { input.inserted?.push(value); } })),
      update: vi.fn(() => ({ set: () => ({ where: async () => undefined }) })),
    }),
  };
  return db as never;
}

const previousKey = process.env.LLM_ENCRYPTION_KEY;
afterEach(() => {
  if (previousKey === undefined) delete process.env.LLM_ENCRYPTION_KEY;
  else process.env.LLM_ENCRYPTION_KEY = previousKey;
});

describe("platform-owned Cloudflare credential reference binding", () => {
  it("resolves the saved profile at execution time only for the exact verified platform target", async () => {
    process.env.LLM_ENCRYPTION_KEY = key;
    const operation = vi.fn(async value => ({ accepted: value === token }));
    const result = await withCloudflareDeploymentCredential(dbFor(), { identity, credentialRef }, operation);
    expect(result).toEqual({ status: "CONFIGURED", value: { accepted: true } });
    expect(operation).toHaveBeenCalledExactlyOnceWith(token);
    expect(JSON.stringify(result)).not.toContain(token);
  });

  it.each([
    ["tenant", { ...identity, tenantId: "other-tenant" }],
    ["project", { ...identity, projectId: "other-project" }],
    ["environment", { ...identity, environment: "production" }],
  ])("rejects a reference replayed across %s scope", async (_label, requestedIdentity) => {
    const operation = vi.fn(async () => "must-not-run");
    await expect(withCloudflareDeploymentCredential(dbFor(), { identity: requestedIdentity, credentialRef }, operation))
      .resolves.toEqual({ status: "PERMISSION_DENIED" });
    expect(operation).not.toHaveBeenCalled();
  });

  it("rejects non-platform projects, wrong Worker/account identity, and missing profile material", async () => {
    process.env.LLM_ENCRYPTION_KEY = key;
    const wrongProject = await withCloudflareDeploymentCredential(dbFor({ projectRows: [[{ projectType: "customer", lifecycle: "ACTIVE" }]] }),
      { identity, credentialRef }, async () => "must-not-run");
    expect(wrongProject.status).toBe("PERMISSION_DENIED");
    const wrongTarget = await withCloudflareDeploymentCredential(dbFor({ targetRows: [[{ ...target, workerRef: "foreign-worker" }]] }),
      { identity, credentialRef }, async () => "must-not-run");
    expect(wrongTarget.status).toBe("PERMISSION_DENIED");
    const wrongAccount = await withCloudflareDeploymentCredential(dbFor({ settingRows: [
      [{ value: JSON.stringify({ ...binding(), accountId: "f".repeat(32) }) }], [setting(accountId)],
      [setting(encrypt(JSON.stringify({ deployment: { token } }), key), true)],
    ] }), { identity, credentialRef }, async () => "must-not-run");
    expect(wrongAccount.status).toBe("PERMISSION_DENIED");
    const missingProfile = await withCloudflareDeploymentCredential(dbFor({ settingRows: [
      [{ value: JSON.stringify(binding()) }], [setting(accountId)], [],
    ] }), { identity, credentialRef }, async () => "must-not-run");
    expect(missingProfile.status).toBe("NOT_CONFIGURED");
  });

  it("binds only after read-only Cloudflare account, zone, and Worker identity checks without duplicating the secret", async () => {
    process.env.LLM_ENCRYPTION_KEY = key;
    const inserted: Array<Record<string, unknown>> = [];
    const encryptedProfile = setting(encrypt(JSON.stringify({ deployment: { token, label: "platform" } }), key), true);
    const database = dbFor({ settingRows: [[], [setting(accountId)], [encryptedProfile], [setting(accountId)], [encryptedProfile], []], inserted });
    expect(await getPlatformCloudflareCredentialBindingState(dbFor({ settingRows: [[], [setting(accountId)], [encryptedProfile]] }), identity))
      .toMatchObject({ eligible: true, bound: false });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(init?.method).toBe("GET");
      if (url.endsWith("/user/tokens/verify")) return Response.json({ success: true, result: { status: "active" } });
      if (url.includes("/zones?name=smartaihub.app")) return Response.json({ success: true, result: [{ id: zoneId, name: "smartaihub.app", account: { id: accountId } }] });
      if (url.includes("/workers/scripts?page=1")) return Response.json({ success: true, result: [{ id: target.workerRef }] });
      return Response.json({ success: false }, { status: 404 });
    });
    const result = await bindPlatformCloudflareCredentialProfile(database, { identity, actorUserId: 1, fetchImpl: fetchMock });
    expect(result).toMatchObject({ status: "BOUND", accountId, zoneId, workerRef: target.workerRef, environment: "staging" });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ category: "infrastructure", isSensitive: false });
    expect(JSON.stringify(inserted)).toContain("platform-project");
    expect(JSON.stringify(inserted)).not.toContain(token);
    expect(JSON.stringify(result)).not.toContain(token);
    expect(fetchMock.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
  });

  it("rejects a zone from another Cloudflare account before persisting the reference", async () => {
    process.env.LLM_ENCRYPTION_KEY = key;
    const encryptedProfile = setting(encrypt(JSON.stringify({ deployment: { token, label: "platform" } }), key), true);
    const database = dbFor({ settingRows: [[], [setting(accountId)], [encryptedProfile], [setting(accountId)], [encryptedProfile], []] });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/user/tokens/verify")) return Response.json({ success: true, result: { status: "active" } });
      if (url.includes("/zones?name=smartaihub.app")) return Response.json({ success: true,
        result: [{ id: zoneId, name: "smartaihub.app", account: { id: "f".repeat(32) } }] });
      if (url.includes("/workers/scripts?page=1")) return Response.json({ success: true, result: [{ id: target.workerRef }] });
      return Response.json({ success: false }, { status: 404 });
    });
    await expect(bindPlatformCloudflareCredentialProfile(database, { identity, actorUserId: 1, fetchImpl: fetchMock }))
      .rejects.toThrow("PLATFORM_CREDENTIAL_ZONE_IDENTITY_MISMATCH");
    expect(fetchMock.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
  });
});
