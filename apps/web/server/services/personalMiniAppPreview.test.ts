import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
vi.mock("../storage", () => ({
  storagePutContentAddressedIfAbsent: vi.fn(),
  storageReadBuffer: vi.fn(),
}));
vi.mock("./callLLMStructured", () => ({ callLLMStructured: vi.fn() }));
vi.mock("./appIdentityRepository", () => ({
  resolveMiniAppForViewer: vi.fn(),
}));
vi.mock("../db", () => ({ getDb: vi.fn() }));
import {
  storagePutContentAddressedIfAbsent,
  storageReadBuffer,
} from "../storage";
import { callLLMStructured } from "./callLLMStructured";
import { resolveMiniAppForViewer } from "./appIdentityRepository";
import {
  assembleIsolatedMiniAppHtml,
  buildAndStorePersonalMiniApp,
  generatePersonalMiniApp,
  provisionManagedMiniAppRepository,
  resolvePersonalMiniAppPreview,
} from "./personalMiniAppPreview";

const generated = {
  title: "Expense tracker",
  html: "<main><h1>Monthly summary</h1></main>",
  css: "main{max-width:40rem}",
  javascript: "document.body.dataset.ready='true'",
  assets: [],
};

describe("personal Mini-App artifact assembly", () => {
  it("creates a dedicated private GitHub repository and commits the generated source snapshot", async () => {
    vi.stubEnv("SMARTAIHUB_MINIAPP_GITHUB_TOKEN", "test-github-token");
    vi.stubEnv("SMARTAIHUB_MINIAPP_GITHUB_OWNER", "");
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const target = String(url);
      calls.push({ url: target, init });
      if (target.endsWith("/user")) return new Response(JSON.stringify({ login: "smartaihub" }), { status: 200 });
      if (target.endsWith("/repos/smartaihub/smartaihub-app-test")) return new Response("not found", { status: 404 });
      if (target.endsWith("/user/repos")) return new Response(JSON.stringify({
        private: true,
        owner: { login: "smartaihub" },
        html_url: "https://github.com/smartaihub/smartaihub-app-test",
        default_branch: "main",
      }), { status: 201 });
      if (target.includes("/contents/app-source.json?")) return new Response("not found", { status: 404 });
      if (target.endsWith("/contents/app-source.json")) return new Response(JSON.stringify({ commit: { sha: "a".repeat(40) } }), { status: 201 });
      return new Response("unexpected request", { status: 500 });
    }));
    await expect(provisionManagedMiniAppRepository({ appId: "app_test", sourceJson: JSON.stringify(generated) })).resolves.toEqual({
      mode: "SMARTAIHUB_MANAGED",
      owner: "smartaihub",
      name: "smartaihub-app-test",
      url: "https://github.com/smartaihub/smartaihub-app-test",
      revision: "a".repeat(40),
    });
    expect(calls.some(call => call.url.endsWith("/user/repos") && call.init?.method === "POST")).toBe(true);
    const contentWrite = calls.find(call => call.init?.method === "PUT");
    expect(JSON.parse(String(contentWrite?.init?.body))).toMatchObject({
      branch: "main",
      content: Buffer.from(JSON.stringify(generated)).toString("base64"),
    });
    expect(new Headers(contentWrite?.init?.headers).get("Authorization")).toBe("Bearer test-github-token");
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sends the user's exact prompt through Skill Execution and stores the resulting built HTML by digest", async () => {
    vi.stubEnv("SMARTAIHUB_MINIAPP_GITHUB_TOKEN", "");
    vi.mocked(callLLMStructured).mockResolvedValueOnce({
      data: generated,
    } as any);
    const prompt =
      "Create a mobile-friendly personal expense tracker with income, expenses and a monthly summary chart.";
    await expect(
      generatePersonalMiniApp({
        userId: 42,
        tenantId: "tenant-test",
        appId: "app_test",
        runId: "run_test",
        prompt,
      })
    ).resolves.toEqual(generated);
    expect(callLLMStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage: prompt,
        runtimeOptions: expect.objectContaining({
          skillSlugs: ["personal-miniapp-builder"],
          requestLabel: "personal_miniapp_build",
        }),
      })
    );

    const htmlBytes = Buffer.from(assembleIsolatedMiniAppHtml(generated));
    const digest = createHash("sha256").update(htmlBytes).digest("hex");
    const sourceBytes = Buffer.from(JSON.stringify(generated));
    const sourceDigest = createHash("sha256").update(sourceBytes).digest("hex");
    vi.mocked(storagePutContentAddressedIfAbsent).mockResolvedValueOnce({
      key: `mini-app-sources/tenant-test/app_test/sha256/${sourceDigest}`,
      url: "",
      sha256: sourceDigest,
    });
    vi.mocked(storagePutContentAddressedIfAbsent).mockResolvedValueOnce({
      key: `mini-app-previews/tenant-test/app_test/sha256/${digest}`,
      url: "",
      sha256: digest,
    });
    await expect(
      buildAndStorePersonalMiniApp({
        userId: 42,
        tenantId: "tenant-test",
        appId: "app_test",
        runId: "run_test",
        prompt,
        generate: async () => generated,
      })
    ).resolves.toEqual({
      artifactRef: `r2://mini-app-previews/tenant-test/app_test/sha256/${digest}`,
      artifactDigest: digest,
      bytes: htmlBytes.byteLength,
      sourceRef: `r2://mini-app-sources/tenant-test/app_test/sha256/${sourceDigest}`,
      sourceDigest,
      repository: null,
      repositoryState: "PROVISIONING_PENDING",
    });
    vi.unstubAllEnvs();
  });

  it("assembles runnable content with a restrictive sandbox CSP and local assets", () => {
    const html = assembleIsolatedMiniAppHtml({
      title: "Expense tracker",
      html: '<main><img src="./assets/chart.png"><button id="add">Add expense</button></main>',
      css: "body{font-family:system-ui} main{max-width:40rem}",
      javascript:
        "document.querySelector('#add').addEventListener('click',()=>document.body.dataset.clicked='true')",
      assets: [
        {
          path: "assets/chart.png",
          mimeType: "image/png",
          dataBase64: Buffer.from("png-data").toString("base64"),
        },
      ],
    });

    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain("data:image/png;base64,");
    expect(html).toContain("Add expense");
    expect(html).toContain("smartaihubStorage");
    expect(html).toContain("addEventListener('click'");
  });

  it("rejects active markup and traversal asset paths", () => {
    const base = {
      title: "App",
      html: "<main>ok</main>",
      css: "",
      javascript: "",
      assets: [],
    };
    expect(() =>
      assembleIsolatedMiniAppHtml({
        ...base,
        html: '<img src=x onerror="alert(1)">',
      })
    ).toThrow("MINI_APP_MARKUP_ACTIVE_CONTENT_FORBIDDEN");
    expect(() =>
      assembleIsolatedMiniAppHtml({
        ...base,
        html: '<img src="../secret.png">',
        assets: [
          {
            path: "assets/../secret.png",
            mimeType: "image/png",
            dataBase64: Buffer.from("x").toString("base64"),
          },
        ],
      })
    ).toThrow("MINI_APP_ASSET_PATH_INVALID");
  });

  it("loads bytes only after owner authorization and verifies the immutable digest", async () => {
    const html = Buffer.from("<!doctype html><main>private</main>");
    const digest = createHash("sha256").update(html).digest("hex");
    const artifactRef = `r2://mini-app-previews/tenant-test/app_test/sha256/${digest}`;
    vi.mocked(resolveMiniAppForViewer).mockResolvedValueOnce({
      appId: "app_test",
      tenantId: "tenant-test",
      ownerUserId: 42,
      visibility: "private",
      deploymentVersion: 1,
      lastKnownGoodArtifactRef: artifactRef,
      lifecycle: "active",
    } as any);
    vi.mocked(storageReadBuffer).mockResolvedValueOnce(html);
    await expect(
      resolvePersonalMiniAppPreview({
        appId: "app_test",
        tenantId: "tenant-test",
        userId: 42,
      })
    ).resolves.toMatchObject({
      html: html.toString("utf8"),
      artifactDigest: digest,
    });
    expect(resolveMiniAppForViewer).toHaveBeenCalledWith({
      appId: "app_test",
      tenantId: "tenant-test",
      userId: 42,
    });

    vi.mocked(resolveMiniAppForViewer).mockResolvedValueOnce(null);
    await expect(
      resolvePersonalMiniAppPreview({
        appId: "app_test",
        tenantId: "tenant-test",
        userId: 77,
      })
    ).resolves.toBeNull();
    expect(storageReadBuffer).toHaveBeenCalledTimes(1);
  });
});
