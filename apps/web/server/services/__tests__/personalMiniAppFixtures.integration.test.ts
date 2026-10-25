/**
 * Repeatable identity/project fixture for Personal Mini-App integration tests.
 * This suite creates rows only in an explicitly named local test database.
 * The Gateway fixture is an injected test adapter and never authenticates as a
 * production user or sends traffic to the production Gateway.
 */
import postgres from "postgres";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "true";
const dbUrl = enabled
  ? process.env.DATABASE_URL
  : "postgresql://localhost/smartspec_test";
if (enabled) {
  if (!dbUrl) throw new Error("DATABASE_URL_REQUIRED_FOR_MINIAPP_FIXTURE_TEST");
  const parsed = new URL(dbUrl);
  if (
    !/(^|[_-])(test|ci)([_-]|$)/i.test(parsed.pathname.replace(/^\/+/, "")) ||
    !["localhost", "127.0.0.1", "postgres", "smartspec-postgres"].includes(
      parsed.hostname
    )
  ) {
    throw new Error("MINIAPP_FIXTURE_REFUSES_NONLOCAL_OR_NONTEST_DATABASE");
  }
  process.env.DATABASE_URL = dbUrl;
}
const sql = postgres(dbUrl!, { max: 2 });
const created: Array<{
  tenantId: string;
  userId: number;
  appId: string;
  projectId: string;
}> = [];
const describeDb = enabled ? describe : describe.skip;

function fixtureId(prefix: string) {
  return `${prefix}-${randomUUID().replaceAll("-", "").slice(0, 20)}`;
}

async function provisionPersonalMiniAppFixture() {
  const tenantId = fixtureId("miniapp-test");
  const projectId = fixtureId("project");
  const appId = `app_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
  const [user] = await sql`
    INSERT INTO users ("openId", "role", "plan", "credits", "isDisabled")
    VALUES (${`fixture-${tenantId}`}, 'user', 'free', 1000, false)
    RETURNING id
  `;
  const userId = Number(user.id);
  const fixture = { tenantId, userId, appId, projectId };
  created.push(fixture);
  await sql`
    INSERT INTO tenants ("id", "slug", "name", "ownerId", "isActive", "status", "plan", "created_at", "createdAt", "updatedAt")
    VALUES (${tenantId}, ${tenantId}, 'Disposable Personal Mini-App Test', ${userId}, true, 'ACTIVE', 'FREE', NOW(), NOW(), NOW())
  `;
  await sql`UPDATE users SET "currentTenantId" = ${tenantId} WHERE id = ${userId}`;
  await sql`
    INSERT INTO canonical_projects (project_id, tenant_id, project_type, title, owner_principal_id)
    VALUES (${projectId}, ${tenantId}, 'personal-miniapp-test', 'Disposable Mini-App Project', ${`user:${userId}`})
  `;
  await sql`
    INSERT INTO canonical_project_memberships (tenant_id, project_id, principal_id, role, lifecycle)
    VALUES (${tenantId}, ${projectId}, ${`user:${userId}`}, 'owner', 'ACTIVE')
  `;
  const { createPrivateMiniAppIdentity } =
    await import("../appIdentityRepository");
  const app = await createPrivateMiniAppIdentity({
    tenantId,
    ownerUserId: userId,
    idempotencyKey: `miniapp-fixture:${tenantId}:identity`,
    preferredAppId: appId,
  });
  return { ...fixture, appId: app.appId };
}

afterAll(async () => {
  for (const fixture of created) {
    await sql`DELETE FROM app_identities WHERE tenant_id = ${fixture.tenantId} AND app_id = ${fixture.appId}`;
    await sql`DELETE FROM canonical_projects WHERE tenant_id = ${fixture.tenantId} AND project_id = ${fixture.projectId}`;
    await sql`UPDATE users SET "currentTenantId" = NULL WHERE id = ${fixture.userId} AND "currentTenantId" = ${fixture.tenantId}`;
    await sql`DELETE FROM tenants WHERE id = ${fixture.tenantId}`;
    await sql`DELETE FROM users WHERE id = ${fixture.userId}`;
  }
  await sql.end();
});

describeDb("Personal Mini-App disposable integration fixtures", () => {
  it("provisions tenant identity, project membership, private App Identity, and an injected test Gateway", async () => {
    const fixture = await provisionPersonalMiniAppFixture();
    const [tenant] =
      await sql`SELECT "ownerId", "isActive" FROM tenants WHERE id = ${fixture.tenantId}`;
    const [user] =
      await sql`SELECT "currentTenantId" FROM users WHERE id = ${fixture.userId}`;
    const [membership] =
      await sql`SELECT role, lifecycle FROM canonical_project_memberships WHERE tenant_id = ${fixture.tenantId} AND project_id = ${fixture.projectId}`;
    const [app] =
      await sql`SELECT owner_user_id, visibility, last_known_good_artifact_ref FROM app_identities WHERE tenant_id = ${fixture.tenantId} AND app_id = ${fixture.appId}`;
    const testGateway = {
      mode: "isolated-test-adapter" as const,
      generate: async (prompt: string) => ({
        title: "Fixture App",
        html: `<main>${prompt}</main>`,
        css: "",
        javascript: "",
        assets: [],
      }),
    };

    expect(tenant).toMatchObject({ ownerId: fixture.userId, isActive: true });
    expect(user.currentTenantId).toBe(fixture.tenantId);
    expect(membership).toMatchObject({ role: "owner", lifecycle: "ACTIVE" });
    expect(app).toMatchObject({
      owner_user_id: fixture.userId,
      visibility: "private",
      last_known_good_artifact_ref: null,
    });
    expect(await testGateway.generate("authorized test prompt")).toMatchObject({
      title: "Fixture App",
    });
  });
});
