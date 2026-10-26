import { COOKIE_NAME } from "../../../shared/const";
import { UAT_PRIMARY_TENANT_ID, UAT_RESTRICTED_TENANT_ID } from "../../../server/services/uatSessionBroker";
import { expect, readTrpc, test } from "./authenticated.fixture";
import { request } from "@playwright/test";

test.describe("authenticated development browser navigation", () => {
  test.use({ uatRole: "owner" });
  test("owner session opens the protected dashboard with its actual tenant identity", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);
    const languagePrompt = page.getByRole("button", { name: /Continue with English/i });
    if (await languagePrompt.isVisible().catch(() => false)) await languagePrompt.click();
    await expect(page.getByText(/Welcome back,/).first()).toBeVisible({ timeout: 30_000 });
    const auth = await readTrpc<{ id: number; role: string; currentTenantId: string }>(page, "auth.me");
    expect(auth.status).toBe(200);
    expect(auth.data?.role).toBe("user");
    expect(auth.data?.currentTenantId).toBe(UAT_PRIMARY_TENANT_ID);
  });
});

test.describe("admin session", () => {
  test.use({ uatRole: "admin" });
  test("admin can navigate the protected administration dashboard", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
    const auth = await readTrpc<{ role: string; currentTenantId: string }>(page, "auth.me");
    expect(auth.data?.role).toBe("admin");
    expect(auth.data?.currentTenantId).toBe(UAT_PRIMARY_TENANT_ID);
  });
});

test.describe("member tenant authorization", () => {
  test.use({ uatRole: "member" });
  test("member can read its own tenant flags and cannot request another tenant", async ({ page, baseURL }) => {
    const own = await readTrpc<Record<string, unknown>>(page, "tenantFeatureFlags.getFeatureFlags");
    expect(own.status).toBe(200);
    expect(own.data).toBeTruthy();

    const target = encodeURIComponent(JSON.stringify({ json: { tenantId: UAT_RESTRICTED_TENANT_ID } }));
    const crossTenant = await page.request.get(`/trpc/tenantFeatureFlags.getFeatureFlags?input=${target}`, {
      headers: { "X-Tenant-Id": UAT_RESTRICTED_TENANT_ID },
    });
    expect(crossTenant.status()).toBe(403);
    const uatUrl = new URL(baseURL!);
    expect(uatUrl.hostname).toBe("127.0.0.1");
    expect(uatUrl.port).not.toBe("3000");
  });
});

test.describe("restricted identity", () => {
  test.use({ uatRole: "restricted" });
  test("restricted identity stays in its own tenant despite forged tenant headers", async ({ page }) => {
    const auth = await readTrpc<{ currentTenantId: string }>(page, "auth.me");
    expect(auth.data?.currentTenantId).toBe(UAT_RESTRICTED_TENANT_ID);

    const target = encodeURIComponent(JSON.stringify({ json: { tenantId: UAT_PRIMARY_TENANT_ID } }));
    const crossTenant = await page.request.get(`/trpc/tenantFeatureFlags.getFeatureFlags?input=${target}`, {
      headers: { "X-Tenant-Id": UAT_PRIMARY_TENANT_ID, "X-UAT-Role": "admin" },
    });
    expect(crossTenant.status()).toBe(403);
  });
});

test("forged identity headers do not create an authenticated session", async ({ baseURL }) => {
  const anonymousContext = await request.newContext({ baseURL });
  try {
    const forged = await anonymousContext.get(
      `/trpc/auth.me?input=${encodeURIComponent(JSON.stringify({ json: null }))}`,
      { headers: { "X-UAT-Role": "admin", "X-User-Id": "1", "X-Tenant-Id": UAT_PRIMARY_TENANT_ID } },
    );
    const body = await forged.json();
    expect(body?.result?.data?.json ?? null).toBeNull();
    expect(forged.headers()["set-cookie"] ?? "").not.toContain(COOKIE_NAME);
  } finally {
    await anonymousContext.dispose();
  }
});
