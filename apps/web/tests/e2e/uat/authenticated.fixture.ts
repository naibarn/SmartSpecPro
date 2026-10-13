import { mkdir, writeFile, chmod } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { expect as baseExpect, test as baseTest, type Page } from "@playwright/test";
import {
  issueUatSession,
  revokeUatSession,
  type UatRole,
} from "../../../server/services/uatSessionBroker";
import { COOKIE_NAME } from "../../../shared/const";

const PROVIDER_HOSTS = [
  "api.openai.com",
  "openrouter.ai",
  "api.anthropic.com",
  "api.groq.com",
  "generativelanguage.googleapis.com",
  "api.deepseek.com",
  "api.mistral.ai",
  "api.together.xyz",
  "api.perplexity.ai",
  "api.x.ai",
  "api.z.ai",
  "api.fireworks.ai",
  "api.cohere.ai",
  "api.nvidia.com",
  "api.cerebras.ai",
  "api.sambanova.ai",
  "api.elevenlabs.io",
  "api.replicate.com",
  "api.stability.ai",
  "api.kie.ai",
  "fal.run",
  "api.fal.ai",
];

type Evidence = {
  requests: Array<{ origin: string; path: string; method: string; resourceType: string }>;
  responses: Array<{ origin: string; path: string; status: number }>;
  failures: Array<{ origin: string; path: string; error: string }>;
  consoleErrors: string[];
  directProviderAttempts: string[];
};

export const test = baseTest.extend<{ uatRole: UatRole }>({
  uatRole: ["member", { option: true }],
  page: async ({ page, uatRole }, use, testInfo) => {
    const session = await issueUatSession(uatRole);
    const context = page.context();
    await context.addCookies([{
      name: COOKIE_NAME,
      value: session.token,
      domain: ".smartaihub.app",
      path: "/",
      expires: Math.floor(session.expiresAt / 1000),
      httpOnly: true,
      secure: true,
      sameSite: "None",
    }]);

    const evidence: Evidence = {
      requests: [],
      responses: [],
      failures: [],
      consoleErrors: [],
      directProviderAttempts: [],
    };
    await page.route("**/*", async (route) => {
      const requestUrl = new URL(route.request().url());
      const provider = PROVIDER_HOSTS.find((host) =>
        requestUrl.hostname === host || requestUrl.hostname.endsWith(`.${host}`),
      );
      if (provider) {
        evidence.directProviderAttempts.push(provider);
        await route.abort("blockedbyclient");
        return;
      }
      await route.continue();
    });

    page.on("request", (request) => {
      const url = new URL(request.url());
      evidence.requests.push({
        origin: url.origin,
        path: url.pathname,
        method: request.method(),
        resourceType: request.resourceType(),
      });
    });
    page.on("response", (response) => {
      const url = new URL(response.url());
      evidence.responses.push({ origin: url.origin, path: url.pathname, status: response.status() });
    });
    page.on("requestfailed", (request) => {
      const url = new URL(request.url());
      evidence.failures.push({
        origin: url.origin,
        path: url.pathname,
        error: request.failure()?.errorText?.slice(0, 160) ?? "request failed",
      });
    });
    page.on("console", (message) => {
      if (message.type() === "error") evidence.consoleErrors.push(message.text().slice(0, 300));
    });

    const tracePath = testInfo.outputPath("trace.zip");
    const networkPath = testInfo.outputPath("network-evidence.json");
    const screenshotPath = testInfo.outputPath("authenticated-page.png");
    await mkdir(testInfo.outputDir, { recursive: true, mode: 0o700 });
    await chmod(testInfo.outputDir, 0o700);
    await context.tracing.start({ screenshots: true, snapshots: true, sources: false });

    try {
      await use(page);
    } finally {
      try {
        await page.screenshot({ path: screenshotPath, fullPage: true, timeout: 10_000 });
      } catch {
        // Keep the network and trace evidence when a page cannot be captured.
      }
      try {
        await context.tracing.stop({ path: tracePath });
        const scrubber = path.resolve("scripts/uat/scrub-playwright-trace.py");
        execFileSync("python3", [scrubber, tracePath], { stdio: "ignore" });
      } catch {
        evidence.failures.push({
          origin: "local://uat-evidence",
          path: "/trace.zip",
          error: "trace capture or token scrubbing failed",
        });
      }

      // Revoke before marking the evidence successful. A failed revocation
      // fails the test instead of leaving a live test session behind.
      await revokeUatSession(session);

      await writeFile(networkPath, JSON.stringify({
        role: uatRole,
        tenantId: session.tenantId,
        userId: session.userId,
        session: { revoked: true, expiresAt: session.expiresAt },
        ...evidence,
      }, null, 2), { mode: 0o600 });
      try {
        await testInfo.attach("network-evidence", { path: networkPath, contentType: "application/json" });
        await testInfo.attach("authenticated-screenshot", { path: screenshotPath, contentType: "image/png" });
        await testInfo.attach("playwright-trace", { path: tracePath, contentType: "application/zip" });
      } catch {
        // Attachments are best effort if setup failed before an artifact was written.
      }
      if (evidence.directProviderAttempts.length > 0) {
        throw new Error("Browser attempted a direct provider request; use the SmartAIHub Gateway");
      }
    }
  },
});

export const expect = baseExpect;

export async function readTrpc<T>(page: Page, procedure: string, input?: unknown): Promise<{
  status: number;
  body: any;
  data: T | null;
}> {
  const query = input === undefined
    ? ""
    : `?input=${encodeURIComponent(JSON.stringify({ json: input }))}`;
  const response = await page.request.get(`/trpc/${procedure}${query}`);
  const body = await response.json();
  return {
    status: response.status(),
    body,
    data: body?.result?.data?.json ?? null,
  };
}
