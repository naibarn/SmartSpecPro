import { expect, test, type Browser } from "playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.G1_PRODUCTION_BASE_URL?.replace(/\/$/, "");
const evidenceDir = process.env.G1_EVIDENCE_OUTPUT_DIR;
const model = process.env.G1_RESPONSES_MODEL;

async function runBetaSearch(browser: Browser, alias: string, storageStatePath: string | undefined, subject: string) {
  test.skip(!baseUrl || !storageStatePath || !model, "Set Production URL, model and authorized local Browser storageState path for this beta user");
  expect(baseUrl).toMatch(/^https:\/\//);
  const context = await browser.newContext({ storageState: storageStatePath });
  try {
    const page = await context.newPage();
    const endpoint = new URL("/v1/responses", baseUrl!).toString();
    const prompt = `Search the web for the official NASA page about ${subject}. Cite the official source. Test reference ${randomUUID()}`;
    const results: Array<{ status: number; requestId: string | null; hasSearchCall: boolean }> = [];
    await page.goto(new URL("/chat", baseUrl!).toString());
    await expect(page.getByPlaceholder("Type a message or / for skills...")).toBeVisible();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await page.evaluate(async ({ endpoint, prompt, model }) => {
        const res = await fetch(endpoint, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model,
            input: prompt,
            tools: [{ type: "web_search" }],
            tool_choice: "required",
            max_output_tokens: 200,
            stream: false,
            store: false,
          }),
        });
        const requestId = res.headers.get("x-trace-id");
        const body = res.ok ? await res.json() : null;
        return {
          status: res.status,
          requestId,
          hasSearchCall: Array.isArray(body?.output) && body.output.some((item: any) => item?.type === "web_search_call"),
        };
      }, { endpoint, prompt, model: model! });
      results.push(response);
      expect(response.status, "Responses API request must succeed for the authorized beta account").toBe(200);
      expect(response.requestId, "Capture the request id to correlate Web and Worker traces").toBeTruthy();
      expect(response.hasSearchCall, "The response must contain a real web search call").toBe(true);
    }
    const record = { accountAlias: alias, checkedAt: new Date().toISOString(), cacheMissThenRepeat: results, promptRecorded: false, identityRecorded: false };
    if (evidenceDir) {
      await mkdir(evidenceDir, { recursive: true });
      await writeFile(path.join(evidenceDir, `${alias}.json`), JSON.stringify(record, null, 2), { mode: 0o600 });
    }
    expect(results[0].requestId).not.toBe(results[1].requestId);
  } finally {
    await context.close();
  }
}

test("Beta account A exercises real Search cache miss then repeat", async ({ browser }) => {
  await runBetaSearch(browser, "beta-a", process.env.G1_BETA_A_STORAGE_STATE, "Mars exploration");
});

test("Beta account B exercises real Search cache miss then repeat", async ({ browser }) => {
  await runBetaSearch(browser, "beta-b", process.env.G1_BETA_B_STORAGE_STATE, "Earth science");
});

test("Production Admin Cloudflare tab displays the live Worker and KV binding", async ({ browser }) => {
  const storageStatePath = process.env.G1_ADMIN_STORAGE_STATE;
  test.skip(!baseUrl || !storageStatePath, "Set Production URL and authorized local Admin Browser storageState path");
  expect(baseUrl).toMatch(/^https:\/\//);
  const context = await browser.newContext({ storageState: storageStatePath });
  try {
    const page = await context.newPage();
    await page.goto(new URL("/admin/settings?tab=infrastructure", baseUrl!).toString());
    const cloudflareTab = page.getByRole("tab", { name: /Cloudflare/i });
    await expect(cloudflareTab).toBeVisible();
    await cloudflareTab.click();
    await expect(page.getByText("smartspec-cloudflare-runtime", { exact: false })).toBeVisible();
    await expect(page.getByText("SEARCH_RESULT_CACHE", { exact: true }).first()).toBeVisible();
  } finally {
    await context.close();
  }
});

test("request-scoped KV get failure falls back to a real web search", async ({ browser }) => {
  const storageStatePath = process.env.G1_ADMIN_STORAGE_STATE;
  test.skip(!baseUrl || !storageStatePath || !model || process.env.G1_FAULT_INJECTION_ENABLED !== "true", "Requires the temporary request-scoped fault flag and an authorized Admin Browser session");
  expect(baseUrl).toMatch(/^https:\/\//);
  const context = await browser.newContext({ storageState: storageStatePath });
  try {
    const page = await context.newPage();
    await page.goto(new URL("/chat", baseUrl!).toString());
    await expect(page.getByPlaceholder("Type a message or / for skills...")).toBeVisible();
    const trace = await page.evaluate(async ({ endpoint, model }) => {
      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", "x-sah-cache-test-fault": "kv-get" },
        body: JSON.stringify({
          model,
          input: `Search the web for the official NASA page about ocean worlds. Cite the official source. Test reference ${crypto.randomUUID()}`,
          tools: [{ type: "web_search" }],
          tool_choice: "required",
          max_output_tokens: 200,
          stream: false,
          store: false,
        }),
      });
      const body = res.ok ? await res.json() : null;
      return { status: res.status, traceId: res.headers.get("x-trace-id"), hasSearchCall: Array.isArray(body?.output) && body.output.some((item: any) => item?.type === "web_search_call") };
    }, { endpoint: new URL("/v1/responses", baseUrl!).toString(), model: model! });
    expect(trace.status).toBe(200);
    expect(trace.traceId).toBeTruthy();
    expect(trace.hasSearchCall).toBe(true);
    if (evidenceDir) {
      await mkdir(evidenceDir, { recursive: true });
      await writeFile(path.join(evidenceDir, "kv-fault-fallback.json"), JSON.stringify({ accountAlias: "admin-fault-probe", checkedAt: new Date().toISOString(), ...trace, promptRecorded: false, identityRecorded: false }, null, 2), { mode: 0o600 });
    }
  } finally {
    await context.close();
  }
});
