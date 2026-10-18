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
const credentials = parse(readFileSync(`${configRoot}/admin-login.txt`));
const guard = JSON.parse(readFileSync(`${configRoot}/guard-login.json`));
const evidence =
  process.env.SMARTSPEC_DEV_EVIDENCE_DIR ||
  `${homedir()}/.local/share/smartspec-dev/evidence`;
mkdirSync(evidence, { recursive: true, mode: 0o700 });
const result = {
  scope: "PUBLIC_DEV_TUNNEL",
  url: url.origin,
  coldLoads: [],
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
const open = async () => {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1100 },
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
    if (!attempt)
      await page.screenshot({
        path: `${evidence}/public-login-first-load.png`,
      });
    await context.close();
  }
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
  if (result.loginStatus !== 200)
    throw new Error(`Admin login HTTP ${result.loginStatus}`);
  await page.waitForTimeout(1000);
  await page.goto(`${url.origin}/admin/settings?tab=infrastructure`, {
    waitUntil: "domcontentloaded",
  });
  const language = page.getByRole("button", { name: "Continue with English" });
  try {
    await language.click({ timeout: 7000 });
  } catch {
    /* Existing accounts may already have chosen a language. */
  }
  const collected = page.waitForResponse(
    response =>
      response.url().includes("infrastructure.getSpec224DatabaseDiagnostics"),
    { timeout: 60000 }
  );
  await page
    .getByRole("button", { name: /Collect evidence|เก็บหลักฐาน/ })
    .click({ timeout: 60000 });
  const response = await collected;
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
    [401, 403].includes(result.anonymousStatus) &&
    result.collectStatus === 200 &&
    !!result.diagnostics &&
    !errors.length &&
    result.domainAdminGuard.loginStatus === 200 &&
    result.domainAdminGuard.diagnosticsStatus === 403;
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
