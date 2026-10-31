import { expect, test } from "@playwright/test";

// Synthetic API responses exercise the real UI without admitting a deployment.
for (const width of [1440, 390]) {
  test(`Staging explains insufficient lifetime and offers preparation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(() => {
      localStorage.setItem("smartspec_locale", "en");
      localStorage.setItem("smartspec_locale_chosen", "true");
    });
    const tenantId = "tenant-browser-staging", projectId = "2fe8a309-8be6-4370-9813-8fb9cc4645a0";
    const configurationRef = `cf-origin:${"a".repeat(64)}`;
    const target = { id: "browser-target", tenantId, projectId, environment: "staging", provider: "cloudflare",
      deploymentTargetId: "smartspec-cloudflare-staging", workerRef: "smartspec-cloudflare-staging",
      accountRef: "b".repeat(32), credentialRef: "browser-fixture", containerApplicationRef: null,
      provenance: "synthetic-browser-fixture", enabled: true, runtimePolicy: configurationRef };
    const responses: Record<string, unknown> = {
      "auth.me": { id: 90001, role: "admin", email: "staging-browser@example.test", currentTenantId: tenantId, credits: 0 },
      "systemSettings.listTenants": [{ id: tenantId, name: "Tenant One", selectorKind: "operational" }],
      "infrastructure.listDeploymentTargetProjects": [{ projectId, title: "Wiki", projectType: "platform-deployment" }],
      "infrastructure.listProviderDeploymentTargets": [target],
      "infrastructure.getDeploymentCredentialState": { status: "CONFIGURED" },
      "infrastructure.getCloudflareStagingDeployPreflight": { ready: false, reason: "STAGING_APPLICATION_HTTP_PROFILE_RUNWAY_TOO_SHORT", artifact: null, baseline: null },
      "infrastructure.getCloudflareOriginConfiguration": { status: "STORED", configurationRef, descriptor: {},
        applicationPreparation: { phase: "FULL_HTTP", applicationHttpExpired: false,
          applicationHttpExpiresAt: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
          imageReceipts: "VERIFIED", encryptedApplicationSecrets: "STORED", missingRuntimeFields: [],
          databaseAuthority: { requiredPermissions: [], excludedPermissions: [] } } },
      "infrastructure.getCloudflareStagingRuntimeReadiness": { status: "ACTIVATION_DISABLED", activation: "disabled", transport: "queues",
        missing: [], checkedAt: new Date().toISOString(), applicationIngress: { ready: true, enabled: true, missing: [] } },
    };
    await page.route("**/trpc/**", async route => {
      const url = new URL(route.request().url());
      const names = url.pathname.split("/trpc/")[1].split(",");
      const values = names.map(name => ({ result: { data: { json: responses[name] ?? (/list|templates|Urgent|Notifications|ByCategory/.test(name) ? [] : {}) } } }));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(url.searchParams.has("batch") ? values : values[0]) });
    });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/admin/settings?tab=deployment_targets");
    await page.getByRole("combobox", { name: "Authenticated tenant" }).click();
    await page.getByRole("option", { name: /Tenant One/ }).click();
    await page.getByRole("combobox", { name: "Canonical project" }).click();
    await page.getByRole("option", { name: /Wiki/ }).click();
    await page.getByRole("combobox", { name: "Environment", exact: true }).click();
    await page.getByRole("option", { name: "staging", exact: true }).click();
    await expect(page.getByText("Refresh the Staging profile before deploying", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Prepare Full Application HTTP candidate", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Authorize and deploy to staging", exact: true })).toHaveCount(0);
    await expect(page.getByText(/Deployment requires at least 4 hours 45 minutes/)).toBeVisible();
    await page.getByRole("status", { name: "Staging next step" }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/tmp/staging-readiness-${width}.png` });
    await page.getByRole("button", { name: "Prepare Full Application HTTP candidate", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("Prepare Full Application HTTP for Staging");
    expect(errors).toEqual([]);
  });
}
