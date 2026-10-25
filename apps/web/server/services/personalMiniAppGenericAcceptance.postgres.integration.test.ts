import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  appDeploymentVersions,
  appIdentities,
  tenants,
  users,
} from "../../drizzle/schema";

const storageMock = vi.hoisted(() => ({ objects: new Map<string, Buffer>() }));
const identityMock = vi.hoisted(() => ({ resolveMiniAppForViewer: vi.fn() }));
vi.mock("../storage", () => ({
  storageReadBuffer: async (key: string) =>
    storageMock.objects.get(key) ?? null,
  storagePutContentAddressedIfAbsent: vi.fn(),
}));
vi.mock("./appIdentityRepository", () => ({ resolveMiniAppForViewer: (...args: unknown[]) => identityMock.resolveMiniAppForViewer(...args) }));

describe("generic Mini-App promotion on disposable PostgreSQL", () => {
  let disposable: Awaited<
    ReturnType<
      typeof import("./__tests__/support/spec277DisposablePostgres").createSpec277DisposablePostgres
    >
  >;
  let sql: import("postgres").Sql;
  let closeDb: typeof import("../db").closeDb;
  let tenantId: string;
  let ownerUserId: number;
  const appId = "app_synthetic_second";
  const sourceAndArtifactRefs: string[] = [];
  const originalEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    originalEnv.DATABASE_URL = process.env.DATABASE_URL;
    originalEnv.NODE_ENV = process.env.NODE_ENV;
    disposable = await (
      await import("./__tests__/support/spec277DisposablePostgres")
    ).createSpec277DisposablePostgres();
    process.env.DATABASE_URL = disposable.databaseUrl;
    process.env.NODE_ENV = "test";
    vi.resetModules();
    const postgres = (await import("postgres")).default;
    sql = postgres(disposable.databaseUrl, { max: 2 });
    const { installSpec277AutoTeamRuntimeSchema } =
      await import("./__tests__/support/spec277AutoTeamRuntimeSchema");
    await installSpec277AutoTeamRuntimeSchema(sql, [
      tenants,
      users,
      appIdentities,
      appDeploymentVersions,
    ]);
    ({ closeDb } = await import("../db"));

    tenantId = `tenant-${randomUUID().replaceAll("-", "").slice(0, 24)}`;
    const [user] = await sql`
      INSERT INTO users ("openId", role, plan, credits, "isDisabled")
      VALUES (${`miniapp-generic-${tenantId}`}, 'user', 'free', 0, false)
      RETURNING id
    `;
    ownerUserId = Number(user.id);
    await sql`
      INSERT INTO tenants (id, slug, name, "ownerId", status, plan)
      VALUES (${tenantId}, ${`${tenantId}-slug`}, 'Synthetic Mini-App tenant', ${ownerUserId}, 'ACTIVE', 'FREE')
    `;

    const v1Source = Buffer.from(
      JSON.stringify({ title: "Synthetic app V1", html: "<main>V1</main>" })
    );
    const v1Html = Buffer.from(
      "<!doctype html><html><head><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'unsafe-inline'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'\"></head><body><main>V1</main></body></html>"
    );
    const v1SourceDigest = (await import("node:crypto"))
      .createHash("sha256")
      .update(v1Source)
      .digest("hex");
    const v1ArtifactDigest = (await import("node:crypto"))
      .createHash("sha256")
      .update(v1Html)
      .digest("hex");
    const v1SourceRef = `r2://mini-app-sources/${tenantId}/${appId}/sha256/${v1SourceDigest}`;
    const v1ArtifactRef = `r2://mini-app-previews/${tenantId}/${appId}/sha256/${v1ArtifactDigest}`;
    sourceAndArtifactRefs.push(v1SourceRef, v1ArtifactRef);
    storageMock.objects.set(v1SourceRef.slice("r2://".length), v1Source);
    storageMock.objects.set(v1ArtifactRef.slice("r2://".length), v1Html);
    await sql`
      INSERT INTO app_identities (app_id, public_app_id, tenant_id, owner_user_id, visibility, deployment_version, last_known_good_artifact_ref, publisher_ref, canonical_product_id, lifecycle, policy_refs)
      VALUES (${appId}, ${`mini_${randomUUID().replaceAll("-", "")}`}, ${tenantId}, ${ownerUserId}, 'private', 1, ${v1ArtifactRef}, 'personal-miniapp', 'personal-miniapp', 'active', '[]'::jsonb)
    `;
  }, 30_000);

  afterAll(async () => {
    if (closeDb) await closeDb();
    if (sql) {
      if (tenantId)
        await sql`DELETE FROM app_deployment_versions WHERE app_id = ${appId} AND tenant_id = ${tenantId}`;
      if (tenantId)
        await sql`DELETE FROM app_identities WHERE app_id = ${appId} AND tenant_id = ${tenantId}`;
      if (tenantId) await sql`DELETE FROM tenants WHERE id = ${tenantId}`;
      if (ownerUserId) await sql`DELETE FROM users WHERE id = ${ownerUserId}`;
      await sql.end({ timeout: 5 });
    }
    if (disposable) await disposable.close();
    storageMock.objects.clear();
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }, 20_000);

  it("preserves the current version on a failed check, promotes a second app, rolls back and retains immutable history", async () => {
    const crypto = await import("node:crypto");
    const {
      ensureCurrentMiniAppDeploymentVersion,
      bindPersonalMiniAppArtifact,
      promoteMiniAppArtifactAfterVerification,
      verifyPersonalMiniAppArtifactForPromotion,
      resolveMiniAppDeploymentVersion,
      restoreMiniAppDeploymentVersion,
      resolvePersonalMiniAppPreview,
    } = await import("./personalMiniAppPreview");
    const v1 = storageMock.objects.get(
      sourceAndArtifactRefs[0]!.slice("r2://".length)
    )!;
    const v1Html = storageMock.objects.get(
      sourceAndArtifactRefs[1]!.slice("r2://".length)
    )!;
    const v1SourceDigest = crypto.createHash("sha256").update(v1).digest("hex");
    const v1ArtifactDigest = crypto
      .createHash("sha256")
      .update(v1Html)
      .digest("hex");
    const base = { appId, tenantId, ownerUserId };
    await ensureCurrentMiniAppDeploymentVersion({
      ...base,
      deploymentVersion: 1,
      developmentRunId: `run-${"1".repeat(40)}`,
      sourceRef: sourceAndArtifactRefs[0]!,
      sourceDigest: v1SourceDigest,
      artifactRef: sourceAndArtifactRefs[1]!,
      artifactDigest: v1ArtifactDigest,
    });

    const v2Source = Buffer.from(
      JSON.stringify({ title: "Synthetic app V2", html: "<main>V2</main>" })
    );
    const v2Html = Buffer.from(
      "<!doctype html><html><head><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'unsafe-inline'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'\"></head><body><main>V2</main></body></html>"
    );
    const v2SourceDigest = crypto
      .createHash("sha256")
      .update(v2Source)
      .digest("hex");
    const v2ArtifactDigest = crypto
      .createHash("sha256")
      .update(v2Html)
      .digest("hex");
    const v2SourceRef = `r2://mini-app-sources/${tenantId}/${appId}/sha256/${v2SourceDigest}`;
    const v2ArtifactRef = `r2://mini-app-previews/${tenantId}/${appId}/sha256/${v2ArtifactDigest}`;
    storageMock.objects.set(v2SourceRef.slice("r2://".length), v2Source);
    storageMock.objects.set(v2ArtifactRef.slice("r2://".length), v2Html);

    const binding = {
      ...base,
      developmentRunId: `run-${"2".repeat(40)}`,
      sourceRef: v2SourceRef,
      sourceDigest: v2SourceDigest,
      artifactRef: v2ArtifactRef,
      artifactDigest: v2ArtifactDigest,
    };
    await expect(
      promoteMiniAppArtifactAfterVerification({
        verify: async () => {
          throw new Error("INJECTED_SYNTHETIC_SMOKE_FAILURE");
        },
        promote: () => bindPersonalMiniAppArtifact(binding),
      })
    ).rejects.toThrow("INJECTED_SYNTHETIC_SMOKE_FAILURE");
    await expect(
      sql`SELECT deployment_version, last_known_good_artifact_ref FROM app_identities WHERE app_id = ${appId}`
    ).resolves.toMatchObject([
      {
        deployment_version: 1,
        last_known_good_artifact_ref: sourceAndArtifactRefs[1],
      },
    ]);

    await promoteMiniAppArtifactAfterVerification({
      verify: async () => {
        await verifyPersonalMiniAppArtifactForPromotion(binding);
      },
      promote: () => bindPersonalMiniAppArtifact(binding),
    });
    await expect(
      sql`SELECT deployment_version, last_known_good_artifact_ref FROM app_identities WHERE app_id = ${appId}`
    ).resolves.toMatchObject([
      { deployment_version: 2, last_known_good_artifact_ref: v2ArtifactRef },
    ]);
    await expect(
      sql`SELECT deployment_version FROM app_deployment_versions WHERE app_id = ${appId} ORDER BY deployment_version`
    ).resolves.toMatchObject([
      { deployment_version: 1 },
      { deployment_version: 2 },
    ]);

    await restoreMiniAppDeploymentVersion({ ...base, deploymentVersion: 1 });
    await expect(
      sql`SELECT deployment_version, last_known_good_artifact_ref FROM app_identities WHERE app_id = ${appId}`
    ).resolves.toMatchObject([
      {
        deployment_version: 2,
        last_known_good_artifact_ref: sourceAndArtifactRefs[1],
      },
    ]);
    await expect(
      sql`SELECT deployment_version FROM app_deployment_versions WHERE app_id = ${appId} ORDER BY deployment_version`
    ).resolves.toMatchObject([
      { deployment_version: 1 },
      { deployment_version: 2 },
    ]);
    const db = await import("../db");
    const [rolledBackIdentity] = await db.getDb().select().from(appIdentities).where((await import("drizzle-orm")).eq(appIdentities.appId, appId));
    identityMock.resolveMiniAppForViewer.mockResolvedValue(rolledBackIdentity);
    await expect(resolvePersonalMiniAppPreview({ appId, tenantId, userId: ownerUserId })).resolves.toMatchObject({
      app: { lastKnownGoodArtifactRef: sourceAndArtifactRefs[1] },
      html: expect.stringContaining("V1"),
      artifactDigest: v1ArtifactDigest,
      deploymentVersions: [{ deploymentVersion: 1 }, { deploymentVersion: 2 }],
    });
    await expect(
      resolveMiniAppDeploymentVersion({
        appId,
        tenantId,
        userId: ownerUserId,
        deploymentVersion: 1,
      })
    ).resolves.toMatchObject({ html: expect.stringContaining("V1") });
    await expect(
      resolveMiniAppDeploymentVersion({
        appId,
        tenantId,
        userId: ownerUserId,
        deploymentVersion: 2,
      })
    ).resolves.toMatchObject({ html: expect.stringContaining("V2") });
    await expect(
      resolveMiniAppDeploymentVersion({
        appId,
        tenantId,
        userId: ownerUserId + 1,
        deploymentVersion: 1,
      })
    ).resolves.toBeNull();
  });
});
