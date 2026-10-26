import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { request, type APIRequestContext } from "@playwright/test";
import { appIdentities } from "../../../drizzle/schema";
import { getDb } from "../../../server/db.ts";
import { storageDelete } from "../../../server/storage";
import { bindPersonalMiniAppArtifact, buildAndStorePersonalMiniApp } from "../../../server/services/personalMiniAppPreview";
import { issueUatSession, revokeUatSession } from "../../../server/services/uatSessionBroker";
import { COOKIE_NAME } from "../../../shared/const";
import { expect, readTrpc, test } from "./authenticated.fixture";

// Access-control UAT uses non-sensitive deterministic source, not a claim of
// live Gateway generation or protected Windows Runner execution.
test.use({ uatRole: "owner" });
test("Revision 24 owner publish, anonymous read, unpublish and tenant isolation", async ({ page }, testInfo) => {
  const owner = await readTrpc<{ id: number; currentTenantId: string }>(page, "auth.me");
  expect(owner.status).toBe(200);
  expect(owner.data?.currentTenantId).toMatch(/^tenant-codex-/);
  const tenantId = owner.data!.currentTenantId;
  const ownerUserId = owner.data!.id;
  const key = `rev24-access:${randomBytes(16).toString("hex")}`;
  const mutate = async (procedure: string, input: unknown) => page.request.post(`/trpc/${procedure}`, { headers: { Origin: "https://smartaihub.app" }, data: { json: input } });
  const created = await mutate("appIdentity.createMiniApp", { idempotencyKey: key });
  expect(created.status()).toBe(200);
  const appId: string = (await created.json()).result.data.json.appId;
  expect(appId).toMatch(/^app_/);
  const artifactKeys: string[] = [];
  const sessions: Awaited<ReturnType<typeof issueUatSession>>[] = [];
  const contexts: APIRequestContext[] = [];
  const results: Record<string, unknown> = { appId, tenantId, fixture: "deterministic-access-only", sourceSha: process.env.SMARTSPEC_UAT_SOURCE_SHA ?? null };
  const lookup = (context: APIRequestContext) => context.get(`/trpc/appIdentity.resolveMiniApp?input=${encodeURIComponent(JSON.stringify({ json: { appId } }))}`);
  try {
    const runId = `run-${randomBytes(20).toString("hex")}`;
    const built = await buildAndStorePersonalMiniApp({ userId: ownerUserId, tenantId, appId, runId,
      prompt: "Non-sensitive disposable Revision 24 access fixture",
      generate: async () => ({ title: "Disposable access fixture", html: "<main><h1>Revision 24 access fixture</h1></main>", css: "", javascript: "", assets: [] }),
    });
    artifactKeys.push(built.sourceRef.slice(5), built.artifactRef.slice(5));
    await bindPersonalMiniAppArtifact({ tenantId, ownerUserId, appId, developmentRunId: runId, ...built });
    results.sourceDigest = built.sourceDigest;
    results.artifactDigest = built.artifactDigest;
    const anonymous = await request.newContext({ baseURL: "https://smartaihub.app" });
    contexts.push(anonymous);
    expect((await lookup(anonymous)).status()).toBe(404);
    for (const role of ["member", "restricted"] as const) {
      const session = await issueUatSession(role);
      sessions.push(session);
      const context = await request.newContext({ baseURL: "https://smartaihub.app", extraHTTPHeaders: { Cookie: `${COOKIE_NAME}=${session.token}` } });
      contexts.push(context);
      expect((await lookup(context)).status()).toBe(404);
      const forbiddenPublish = await context.post("/trpc/appIdentity.publishMiniApp", { headers: { Origin: "https://smartaihub.app" }, data: { json: { appId } } });
      expect(forbiddenPublish.status()).toBe(412);
      results[`${role}PrivateDenied`] = true;
    }
    const published = await mutate("appIdentity.publishMiniApp", { appId });
    expect(published.status()).toBe(200);
    results.ownerPublish = published.status();
    const publicRead = await lookup(anonymous);
    expect(publicRead.status()).toBe(200);
    const publicBody = (await publicRead.json()).result.data.json;
    expect(publicBody.html).toContain("Revision 24 access fixture");
    expect(publicBody.factory).toBeNull();
    results.anonymousPublicRead = publicRead.status();
    const anonymousBrowser = await page.context().browser()!.newContext({ baseURL: "https://smartaihub.app", viewport: { width: 390, height: 844 } });
    try {
      const publicPage = await anonymousBrowser.newPage();
      const document = await publicPage.goto(`/miniapp/${appId}`);
      expect(document?.status()).toBe(200);
      expect(document?.headers()["content-security-policy"]).toContain("sandbox allow-scripts allow-forms");
      await expect(publicPage.getByRole("heading", { name: "Revision 24 access fixture" })).toBeVisible();
      await publicPage.screenshot({ path: testInfo.outputPath("anonymous-published-mobile.png"), fullPage: true });
      results.anonymousMobileDocument = true;
    } finally {
      await anonymousBrowser.close();
    }
    const unpublished = await mutate("appIdentity.unpublishMiniApp", { appId });
    expect(unpublished.status()).toBe(200);
    expect((await lookup(anonymous)).status()).toBe(404);
    results.ownerUnpublish = unpublished.status();
    results.immediateAnonymousDenial = true;
    expect((await readTrpc(page, "appIdentity.resolveMiniApp", { appId })).status).toBe(200);
    const deniedDocument = await anonymous.get(`/miniapp/${appId}`);
    expect(await deniedDocument.text()).not.toContain("Revision 24 access fixture");
    await page.goto(`/miniapp/${appId}/status`);
    const languagePrompt = page.getByRole("button", { name: /Continue with English/i });
    if (await languagePrompt.isVisible().catch(() => false)) await languagePrompt.click();
    await expect(page.getByRole("heading", { name: appId, exact: true })).toBeVisible();
  } finally {
    await testInfo.attach("revision24-access-results", { body: JSON.stringify(results, null, 2), contentType: "application/json" });
    await Promise.all(contexts.map(context => context.dispose()));
    await Promise.all(sessions.map(session => revokeUatSession(session)));
    // Only this authenticated synthetic owner's app is disposable. The pilot,
    // real owner records and immutable production artifacts are never touched.
    await getDb().delete(appIdentities).where(and(eq(appIdentities.appId, appId), eq(appIdentities.tenantId, tenantId), eq(appIdentities.ownerUserId, ownerUserId), eq(appIdentities.creationIdempotencyKey, key)));
    await Promise.all(artifactKeys.map(key => storageDelete(key)));
  }
});
