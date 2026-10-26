import { mkdir, writeFile, chmod } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  chromium,
  expect as baseExpect,
  test as baseTest,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import {
  issueUatSession,
  revokeUatSession,
  type UatRole,
} from "../../../server/services/uatSessionBroker";
import { COOKIE_NAME } from "../../../shared/const";
import {
  createMoliUatEgressProxy,
  startMoliUatProcess,
} from "./moliUatRuntime";

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
  requests: Array<{
    origin: string;
    path: string;
    method: string;
    resourceType: string;
  }>;
  responses: Array<{
    origin: string;
    path: string;
    method: string;
    status: number;
    errorCode?: string;
    errorMessage?: string;
  }>;
  failures: Array<{ origin: string; path: string; error: string }>;
  consoleErrors: string[];
  directProviderAttempts: string[];
  screenshotErrors: string[];
};

function redactDiagnostic(value: string): string {
  return value
    .replace(
      /\b(?:sk-[A-Za-z0-9_-]{12,}|(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{12,})\b/g,
      "[redacted]"
    )
    .replace(
      /\b(authorization|api[_-]?key|access[_-]?token)\s*[:=]\s*[^\s,;]+/gi,
      "$1=[redacted]"
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
    .slice(0, 300);
}

export const test = baseTest.extend<{ uatRole: UatRole }>({
  uatRole: ["member", { option: true }],
  page: async ({ uatRole }, use, testInfo) => {
    const isMoli = process.env.SMARTSPEC_UAT_BROWSER === "moli";
    const isCloudflare = process.env.SMARTSPEC_UAT_BROWSER === "cloudflare";
    const session = await issueUatSession(uatRole);
    const egressProxy = isMoli ? await createMoliUatEgressProxy() : null;
    let moliProcess: Awaited<ReturnType<typeof startMoliUatProcess>> | null =
      null;
    try {
      if (isMoli) {
        moliProcess = await startMoliUatProcess({
          rootfs: process.env.SMARTSPEC_MOLI_UAT_ROOTFS!,
          runId: process.env.SMARTSPEC_UAT_RUN_ID || "run",
          testId: testInfo.testId,
          proxyPort: egressProxy!.port,
        });
      }
    } catch (error) {
      await egressProxy?.close();
      await revokeUatSession(session);
      throw error;
    }
    let browser: Browser;
    try {
      if (moliProcess) {
        browser = await chromium.connectOverCDP(moliProcess.endpoint, {
          timeout: 15_000,
        });
      } else if (isCloudflare) {
        const { cloudflareBrowserRunConnection } =
          await import("./cloudflareBrowserRun");
        const connection = cloudflareBrowserRunConnection();
        browser = await chromium.connectOverCDP(connection.endpoint, {
          headers: connection.headers,
          timeout: 30_000,
        });
      } else {
        browser = await chromium.launch({ headless: true });
      }
    } catch (error) {
      try {
        moliProcess?.stop();
      } finally {
        await egressProxy?.close();
        await revokeUatSession(session);
      }
      throw error;
    }
    const context: BrowserContext = await browser.newContext({
      baseURL: process.env.SMARTSPEC_UAT_BASE_URL,
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    const uatOrigin = new URL(process.env.SMARTSPEC_UAT_BASE_URL!);
    await context.addCookies([
      {
        name: COOKIE_NAME,
        value: session.token,
        url: uatOrigin.origin,
        expires: Math.floor(session.expiresAt / 1000),
        httpOnly: true,
        secure: uatOrigin.protocol === "https:",
        sameSite: "Lax",
      },
    ]);

    const evidence: Evidence = {
      requests: [],
      responses: [],
      failures: [],
      consoleErrors: [],
      directProviderAttempts: [],
      screenshotErrors: [],
    };
    const pendingApiDiagnostics: Promise<void>[] = [];
    if (!isMoli)
      await page.route("**/*", async route => {
        const requestUrl = new URL(route.request().url());
        const provider = PROVIDER_HOSTS.find(
          host =>
            requestUrl.hostname === host ||
            requestUrl.hostname.endsWith(`.${host}`)
        );
        if (provider) {
          evidence.directProviderAttempts.push(provider);
          await route.abort("blockedbyclient");
          return;
        }
        await route.continue();
      });

    page.on("request", request => {
      const url = new URL(request.url());
      evidence.requests.push({
        origin: url.origin,
        path: url.pathname,
        method: request.method(),
        resourceType: request.resourceType(),
      });
    });
    page.on("response", response => {
      const url = new URL(response.url());
      const diagnostic: Evidence["responses"][number] = {
        origin: url.origin,
        path: url.pathname,
        method: response.request().method(),
        status: response.status(),
      };
      evidence.responses.push(diagnostic);
      if (url.pathname.includes("/trpc/") && response.status() >= 400) {
        pendingApiDiagnostics.push(
          response
            .json()
            .then(body => {
              const error = body?.error;
              const code = error?.data?.code ?? error?.shape?.data?.code;
              if (typeof code === "string")
                diagnostic.errorCode = code.slice(0, 80);
              if (typeof error?.message === "string") {
                diagnostic.errorMessage = redactDiagnostic(error.message);
              }
            })
            .catch(() => {})
        );
      }
    });
    page.on("requestfailed", request => {
      const url = new URL(request.url());
      evidence.failures.push({
        origin: url.origin,
        path: url.pathname,
        error: redactDiagnostic(
          request.failure()?.errorText ?? "request failed"
        ),
      });
    });
    page.on("console", message => {
      if (message.type() === "error")
        evidence.consoleErrors.push(redactDiagnostic(message.text()));
    });

    const tracePath = testInfo.outputPath("trace.zip");
    const networkPath = testInfo.outputPath("network-evidence.json");
    const screenshotPath = testInfo.outputPath("authenticated-page.png");
    await mkdir(testInfo.outputDir, { recursive: true, mode: 0o700 });
    await chmod(testInfo.outputDir, 0o700);
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: false,
    });

    try {
      await use(page);
    } finally {
      await Promise.allSettled(pendingApiDiagnostics);
      try {
        try {
          await page.screenshot({
            path: screenshotPath,
            fullPage: true,
            timeout: 10_000,
          });
        } catch {
          evidence.screenshotErrors.push(
            isMoli
              ? "Moli structured DOM profile does not provide the visual layout screenshot surface; use the Chromium profile for visual evidence"
              : "Browser screenshot capture failed"
          );
        }
        try {
          await context.tracing.stop({ path: tracePath });
          const scrubber = path.resolve(
            "scripts/uat/scrub-playwright-trace.py"
          );
          execFileSync("python3", [scrubber, tracePath], { stdio: "ignore" });
        } catch {
          evidence.failures.push({
            origin: "local://uat-evidence",
            path: "/trace.zip",
            error: "trace capture or token scrubbing failed",
          });
        }

        // Revoke before marking the evidence successful. Resource cleanup below
        // still runs when revocation fails so Moli cannot outlive this test.
        let revocationFailed = false;
        try {
          await revokeUatSession(session);
        } catch {
          revocationFailed = true;
          evidence.failures.push({
            origin: "local://uat-session-broker",
            path: "/revoke",
            error: "session revocation failed",
          });
        }

        const egressAudit = egressProxy?.evidence();
        for (const deniedTarget of egressAudit?.denied ?? []) {
          const hostname = deniedTarget.split(":")[0]?.toLowerCase();
          const provider = PROVIDER_HOSTS.find(
            host => hostname === host || hostname?.endsWith(`.${host}`)
          );
          if (provider) evidence.directProviderAttempts.push(provider);
        }

        await writeFile(
          networkPath,
          JSON.stringify(
            {
              role: uatRole,
              tenantId: session.tenantId,
              userId: session.userId,
              session: {
                revoked: !revocationFailed,
                expiresAt: session.expiresAt,
              },
              browser: isMoli
                ? "moli"
                : isCloudflare
                  ? "cloudflare-browser-run"
                  : "chromium",
              egress: egressAudit,
              ...evidence,
            },
            null,
            2
          ),
          { mode: 0o600 }
        );
        try {
          await testInfo.attach("network-evidence", {
            path: networkPath,
            contentType: "application/json",
          });
          await testInfo.attach("authenticated-screenshot", {
            path: screenshotPath,
            contentType: "image/png",
          });
          await testInfo.attach("playwright-trace", {
            path: tracePath,
            contentType: "application/zip",
          });
        } catch {
          // Attachments are best effort if setup failed before an artifact was written.
        }
        if (evidence.directProviderAttempts.length > 0) {
          throw new Error(
            "Browser attempted a direct provider request; use the SmartAIHub Gateway"
          );
        }
        if (revocationFailed) throw new Error("UAT_SESSION_REVOCATION_FAILED");
      } finally {
        const cleanupErrors: unknown[] = [];
        await context.close().catch(error => cleanupErrors.push(error));
        await browser.close().catch(error => cleanupErrors.push(error));
        try {
          moliProcess?.stop();
        } catch (error) {
          cleanupErrors.push(error);
        }
        try {
          await egressProxy?.close();
        } catch (error) {
          cleanupErrors.push(error);
        }
        if (cleanupErrors.length > 0)
          throw new Error("UAT_BROWSER_SESSION_CLEANUP_FAILED");
      }
    }
  },
});

export const expect = baseExpect;

export async function readTrpc<T>(
  page: Page,
  procedure: string,
  input?: unknown
): Promise<{
  status: number;
  body: any;
  data: T | null;
}> {
  const query =
    input === undefined
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
