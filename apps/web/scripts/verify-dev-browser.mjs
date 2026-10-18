#!/usr/bin/env node
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { lookup } from "node:dns/promises";
import { parse } from "dotenv";

const configFile = resolve(
  process.env.SMARTSPEC_DEV_ENV_FILE ||
    `${homedir()}/.config/smartspec-dev/web.env`
);
const configRoot = dirname(configFile);
const config = parse(readFileSync(configFile));
if (config.SMARTSPEC_ENVIRONMENT !== "development")
  throw new Error("Development environment required");
const url = new URL(config.APP_URL);
const sharedProduction = config.SMARTSPEC_DEV_DATABASE_MODE === "shared-production";
const credentials = sharedProduction ? null : parse(readFileSync(`${configRoot}/admin-login.txt`));
const guard = sharedProduction ? null : JSON.parse(readFileSync(`${configRoot}/guard-login.json`));
const evidence =
  process.env.SMARTSPEC_DEV_EVIDENCE_DIR ||
  `${homedir()}/.local/share/smartspec-dev/evidence`;
mkdirSync(evidence, { recursive: true, mode: 0o700 });
const result = {
  scope: "PUBLIC_DEV_TUNNEL",
  url: url.origin,
  coldLoads: [],
  spaTransitions: [],
  testedAt: new Date().toISOString(),
  dns: "system",
};
const args = [];
try {
  await lookup(url.hostname);
} catch {
  const response = await fetch(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(url.hostname)}&type=A`,
    { headers: { Accept: "application/dns-json" } }
  );
  const ip = (await response.json()).Answer?.find(row => row.type === 1)?.data;
  if (!ip) throw new Error("Development hostname has no public A record");
  args.push(`--host-resolver-rules=MAP ${url.hostname} ${ip}`);
  result.dns = "Cloudflare DoH fallback during local negative-cache expiry";
}
const browser = await chromium.launch({ headless: true, args });
const contexts = [];
const open = async (options = {}) => {
  const context = await browser.newContext({
    viewport: { width: 1187, height: 996 },
    ...options,
  });
  contexts.push(context);
  return { context, page: await context.newPage() };
};
try {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { context, page } = await open();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const response = await page.goto(`${url.origin}/login`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page
      .locator('input[type="email"]')
      .waitFor({ state: "visible", timeout: 60000 });
    await page.waitForTimeout(1000);
    result.coldLoads.push({
      status: response.status(),
      formVisible: true,
      errors,
    });
    console.log(
      `[dev:web:verify] Fresh login ${attempt + 1}/3 HTTP ${response.status()}`
    );
    if (!attempt) {
      result.tenantWebsite = await page.evaluate(async sharedProduction => {
        const current = await fetch("/api/tenant/current");
        const { tenant } = await current.json();
        const home = await fetch("/api/tenant/public-pages/home");
        const body = await home.json();
        const assets = [];
        for (const path of new Set([tenant.logoUrl, tenant.websiteLogoUrl, tenant.faviconUrl].filter(Boolean))) {
          if (sharedProduction && path.startsWith("/api/storage/files/")) {
            assets.push({ path, status: "AUTHENTICATED_STORAGE" });
            continue;
          }
          const response = await fetch(path);
          assets.push({ path, status: response.status });
        }
        return { tenantStatus: current.status, domain: tenant.primaryDomain, homeStatus: home.status,
          sectionCount: body.sections?.length || 0, assets };
      }, sharedProduction);
      if (result.tenantWebsite.homeStatus !== 200 ||
          result.tenantWebsite.domain !== (sharedProduction ? config.SMARTSPEC_DEV_TENANT_DOMAIN : url.hostname) ||
          result.tenantWebsite.assets.some(asset => asset.status !== 200 && asset.status !== "AUTHENTICATED_STORAGE"))
        throw new Error("Development tenant Home/branding verification failed");
    }
    if (!attempt)
      await page.screenshot({
        path: `${evidence}/public-login-first-load.png`,
      });
    await context.close();
  }
  // The regression needs a mounted Home SEO tree and a client-side route
  // change. Direct /login cold loads alone cannot exercise its unmount.
  for (const scenario of [
    { locale: "en-US", savedLanguage: null, expectedLanguage: "en" },
    { locale: "th-TH", savedLanguage: null, expectedLanguage: "en" },
    { locale: "th-TH", savedLanguage: "th", expectedLanguage: "th" },
  ]) {
    const { context, page } = await open({ locale: scenario.locale });
    if (scenario.savedLanguage) {
      await context.addInitScript(language => {
        localStorage.setItem("smartspec_locale", language);
      }, scenario.savedLanguage);
    }
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(url.origin, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => !!document.head.querySelector('link[rel="canonical"]'));
    await page.waitForTimeout(2000);
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.evaluate(() => {
        history.pushState(null, "", "/login");
        dispatchEvent(new PopStateEvent("popstate"));
      });
      await page.locator('input[type="email"]').waitFor({ state: "visible", timeout: 15000 });
      await page.locator('input[type="email"]').fill("navigation-check@example.invalid");
      await page.waitForTimeout(500);
      const language = await page.locator("html").getAttribute("lang");
      if (language !== scenario.expectedLanguage)
        throw new Error(`Unexpected language ${language} for ${scenario.locale}`);
      if (attempt === 0) {
        await page.screenshot({ path: `${evidence}/spa-login-${scenario.locale}-${scenario.savedLanguage || "default"}.png` });
      }
      await page.goBack();
      await page.waitForFunction(() => location.pathname === "/");
      await page.waitForTimeout(500);
      await page.goForward();
      await page.locator('input[type="email"]').waitFor({ state: "visible", timeout: 15000 });
      if (attempt < 2) {
        await page.goBack();
        await page.waitForFunction(() => location.pathname === "/");
        await page.waitForTimeout(500);
      }
    }
    result.spaTransitions.push({ ...scenario, attempts: 3, backForward: true, formVisible: true, errors });
    if (errors.length) throw new Error(`SPA navigation errors: ${errors.join("; ")}`);
    console.log(`[dev:web:verify] Home → Login + back/forward: ${scenario.locale}, ${scenario.savedLanguage || "English default"} PASS`);
    await context.close();
  }
  if (sharedProduction) {
    const { page } = await open();
    await page.goto(`${url.origin}/login`);
    result.anonymousStatus = await page.evaluate(async () =>
      (await fetch("/trpc/infrastructure.getSpec224DatabaseDiagnostics")).status);
    result.databaseMode = "shared-production";
    result.authenticatedProductionTest = "NOT_RUN_NO_PRODUCTION_CREDENTIALS";
    result.passed = result.coldLoads.every(row => row.status === 200 && !row.errors.length) &&
      result.spaTransitions.length === 3 && result.spaTransitions.every(row => !row.errors.length) &&
      [401,403].includes(result.anonymousStatus);
  } else {
  const { page, context } = await open();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${url.origin}/login`);
  result.anonymousStatus = await page.evaluate(
    async () =>
      (await fetch("/trpc/infrastructure.getSpec224DatabaseDiagnostics")).status
  );
  await page.locator('input[type="email"]').fill(credentials.EMAIL);
  await page.locator('input[type="password"]').fill(credentials.PASSWORD);
  const login = page.waitForResponse(response =>
    response.url().includes("/trpc/auth.login")
  );
  await page.locator('button[type="submit"]').click();
  result.loginStatus = (await login).status();
  console.log(`[dev:web:verify] Admin login HTTP ${result.loginStatus}`);
  if (result.loginStatus !== 200)
    throw new Error(`Admin login HTTP ${result.loginStatus}`);
  await page.waitForTimeout(1000);
  // A successful auth response alone does not prove the post-login UI renders.
  await page.goto(`${url.origin}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("dashboard-quick-links").waitFor({ state: "visible", timeout: 30000 });
  await page.waitForTimeout(1000);
  result.dashboard = { rendered: true, errors: [...errors] };
  await page.screenshot({ path: `${evidence}/public-dashboard-after-login.png`, fullPage: true });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByTestId("dashboard-quick-links").waitFor({ state: "visible", timeout: 30000 });
  result.dashboard.reloadPassed = true;
  if (errors.length) throw new Error(`Dashboard runtime errors: ${errors.join("; ")}`);
  console.log("[dev:web:verify] Authenticated Dashboard + reload PASS");
  await page.goto(`${url.origin}/admin/settings?tab=infrastructure`, {
    waitUntil: "domcontentloaded",
  });
  const language = page.getByRole("button", { name: "Continue with English" });
  try {
    await language.click({ timeout: 7000 });
  } catch {
    /* Existing accounts may already have chosen a language. */
  }
  await page.getByRole("tab", { name: /^(Monitoring|มอนิเตอร์)$/ }).click();
  const [response] = await Promise.all([
    page.waitForResponse(
      response =>
        response.url().includes("infrastructure.getSpec224DatabaseDiagnostics"),
      { timeout: 30000 }
    ),
    page
      .getByRole("button", { name: /Collect evidence|เก็บหลักฐาน/ })
      .click({ timeout: 30000 }),
  ]);
  result.collectStatus = response.status();
  const json = await response.json();
  const row = Array.isArray(json) ? json[0] : json;
  result.diagnostics = row.result?.data?.json ?? row.result?.data;
  const serialized = JSON.stringify(json);
  for (const [key, value] of Object.entries(config)) {
    if (
      /SECRET|PASSWORD|KEY|DATABASE_URL/.test(key) &&
      value.length > 15 &&
      serialized.includes(value)
    )
      throw new Error("Diagnostics exposed a secret");
  }
  await page.screenshot({
    path: `${evidence}/public-admin-collect.png`,
    fullPage: true,
  });
  result.pageErrors = errors;
  await context.close();
  const { page: guardPage } = await open();
  await guardPage.goto(`${url.origin}/login`);
  result.domainAdminGuard = await guardPage.evaluate(async credentials => {
    const login = await fetch("/trpc/auth.login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ json: credentials }),
    });
    const diagnostics = await fetch(
      "/trpc/infrastructure.getSpec224DatabaseDiagnostics"
    );
    return { loginStatus: login.status, diagnosticsStatus: diagnostics.status };
  }, guard);
  result.passed =
    result.coldLoads.every(row => row.status === 200 && !row.errors.length) &&
    result.spaTransitions.length === 3 &&
    result.spaTransitions.every(row => !row.errors.length && row.formVisible) &&
    [401, 403].includes(result.anonymousStatus) &&
    result.dashboard?.rendered && result.dashboard?.reloadPassed &&
    result.collectStatus === 200 &&
    !!result.diagnostics &&
    !errors.length &&
    result.domainAdminGuard.loginStatus === 200 &&
    result.domainAdminGuard.diagnosticsStatus === 403;
  }
  if (!result.passed) throw new Error("Public development acceptance failed");
} catch (error) {
  result.passed = false;
  result.error = error.message;
  process.exitCode = 1;
} finally {
  await browser.close();
  writeFileSync(
    `${evidence}/public-browser-verification.json`,
    JSON.stringify(result, null, 2),
    { mode: 0o600 }
  );
  console.log(JSON.stringify(result));
}
