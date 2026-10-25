import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
const githubMocks = vi.hoisted(() => ({
  getConnection: vi.fn(),
  getToken: vi.fn(),
  validateToken: vi.fn(),
}));
vi.mock("../storage", () => ({
  storagePutContentAddressedIfAbsent: vi.fn(),
  storageReadBuffer: vi.fn(),
}));
vi.mock("./callLLMStructured", () => ({ callLLMStructured: vi.fn() }));
vi.mock("./appIdentityRepository", () => ({
  resolveMiniAppForViewer: vi.fn(),
}));
vi.mock("../db", () => ({ getDb: vi.fn() }));
vi.mock("./userGithubConnectionService", () => ({
  getUserGitHubConnection: (...args: unknown[]) => githubMocks.getConnection(...args),
  getUserGitHubToken: (...args: unknown[]) => githubMocks.getToken(...args),
  validateGitHubToken: (...args: unknown[]) => githubMocks.validateToken(...args),
}));
import {
  storagePutContentAddressedIfAbsent,
  storageReadBuffer,
} from "../storage";
import { callLLMStructured } from "./callLLMStructured";
import { resolveMiniAppForViewer } from "./appIdentityRepository";
import {
  assembleIsolatedMiniAppHtml,
  buildAndStorePersonalMiniApp,
  derivePersonalMiniAppTitle,
  generatePersonalMiniApp,
  importMiniAppGitRevisionCandidate,
  listMiniAppGitRevisionCandidates,
  materializeMiniAppGitCandidateArtifactFiles,
  packageMiniAppGitCandidate,
  provisionManagedMiniAppRepository,
  provisionMiniAppRepositoryFromSnapshot,
  promoteMiniAppArtifactAfterVerification,
  repairPersonalMiniAppJsonCandidate,
  resolveOriginalMiniAppTitle,
  resolveMiniAppGitCandidateSource,
  resolvePersonalMiniAppHomeMilestone,
  resolvePersonalMiniAppPreview,
} from "./personalMiniAppPreview";

const generated = {
  title: "Expense tracker",
  html: "<main><h1>Monthly summary</h1></main>",
  css: "main{max-width:40rem}",
  javascript: "document.body.dataset.ready='true'",
  assets: [],
};

beforeEach(() => {
  vi.mocked(callLLMStructured).mockReset();
  vi.mocked(storagePutContentAddressedIfAbsent).mockReset();
  vi.mocked(storageReadBuffer).mockReset();
  githubMocks.getConnection.mockReset();
  githubMocks.getToken.mockReset();
  githubMocks.validateToken.mockReset();
});

describe("personal Mini-App artifact assembly", () => {
  it("lists branch heads for a second app repository without exposing Git details as a requirement", async () => {
    vi.stubEnv("SMARTAIHUB_MINIAPP_GITHUB_TOKEN", "managed-test-token");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/branches")) return new Response(JSON.stringify([
        { name: "main", commit: { sha: "a".repeat(40) } },
        { name: "feature/dashboard", commit: { sha: "b".repeat(40) } },
      ]));
      return new Response(JSON.stringify({ private: true, full_name: "synthetic-owner/another-private-app", default_branch: "main" }));
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      await expect(listMiniAppGitRevisionCandidates({
        tenantId: "tenant-synthetic-two",
        ownerUserId: 73,
        repository: { mode: "SMARTAIHUB_MANAGED", owner: "synthetic-owner", name: "another-private-app", revision: "c".repeat(40) },
      })).resolves.toEqual({
        defaultBranch: "main",
        candidates: [
          { branch: "main", revision: "a".repeat(40), isDefault: true },
          { branch: "feature/dashboard", revision: "b".repeat(40), isDefault: false },
        ],
      });
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  it("keeps the app title from its original run instead of the V2 development goal", () => {
    const original = {
      spec224: {
        runId: "run-v1",
        goal: "Create a personal expense tracker with income, expenses and monthly charts.",
        metadata: { miniAppFactoryProgramState: { miniAppId: "app_expense" } },
      },
    };
    const adoption = {
      spec224: {
        runId: "run-v2",
        goal: "Adopt the verified prepared Thai and THB candidate for the existing Mini-App",
        metadata: { miniAppFactoryProgramState: { miniAppId: "app_expense" } },
      },
    };
    expect(resolveOriginalMiniAppTitle([
      { progressJson: adoption }, { progressJson: original },
    ], "app_expense")).toBe("Personal Expense Tracker");
  });

  it("reproduces a Git candidate static build from committed source when dist is gitignored", () => {
    const sourceFiles = {
      "src/index.html": "<main>V2</main>",
      "src/styles.css": "main{color:teal}",
      "src/storage-adapter.js": "window.storageReady=true",
      "src/app.js": "document.body.dataset.ready='true'",
      "src/assets/logo.png": "base64:aGVsbG8=",
    };
    expect(materializeMiniAppGitCandidateArtifactFiles(sourceFiles)).toEqual({
      "index.html": sourceFiles["src/index.html"],
      "styles.css": sourceFiles["src/styles.css"],
      "storage-adapter.js": sourceFiles["src/storage-adapter.js"],
      "app.js": sourceFiles["src/app.js"],
      "assets/logo.png": "base64:aGVsbG8=",
    });
    expect(() => materializeMiniAppGitCandidateArtifactFiles({ "src/index.html": "<main>V2</main>" }))
      .toThrow("MINI_APP_CANDIDATE_FILE_MISSING");
    expect(() => materializeMiniAppGitCandidateArtifactFiles({
      ...sourceFiles,
      "src/assets/../escape.png": "base64:aGVsbG8=",
    })).toThrow("MINI_APP_CANDIDATE_ASSET_INVALID");
  });

  it("imports a dynamically bound private repository revision after Git lineage and blob hash verification", async () => {
    const appId = "app_other_owner";
    const owner = "miniapp-owner";
    const repository = "private-app";
    const branch = "feature/thai-ui";
    const revision = "a".repeat(40);
    const baseRevision = "b".repeat(40);
    const sourceFiles: Record<string, string> = {
      "src/index.html": "<!doctype html><html><head><link rel=\"stylesheet\" href=\"./styles.css\"></head><body><main>App</main><script src=\"./storage-adapter.js\"></script><script src=\"./app.js\"></script></body></html>",
      "src/styles.css": "main{color:teal}",
      "src/storage-adapter.js": "window.storageReady=true",
      "src/app.js": "document.body.dataset.ready='true'",
    };
    const sourceHash = createHash("sha256");
    for (const name of ["app.js", "index.html", "storage-adapter.js", "styles.css"]) {
      sourceHash.update(name).update("\0").update(sourceFiles[`src/${name}`]!).update("\n");
    }
    const sourceTreeDigest = sourceHash.digest("hex");
    const contentByPath: Record<string, string> = {
      ...sourceFiles,
      "package.json": JSON.stringify({ scripts: { build: "node scripts/build.mjs" } }),
      "scripts/build.mjs": 'const sourceFiles = ["index.html", "styles.css", "storage-adapter.js", "app.js"];\nconst sourceTree = await digestTree(source, sourceFiles);\nconst artifactTree = await digestTree(out, sourceFiles);\nnew Function(data.toString("utf8"));',
      "scripts/serve.mjs": "// no-op static server metadata",
      "SOURCE_PROVENANCE.json": JSON.stringify({ appId, v2: { branch, sourceTreeDigest } }),
    };
    const blobSha = (content: string) => {
      const bytes = Buffer.from(content, "utf8");
      return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
    };
    const blobs = new Map(Object.entries(contentByPath).map(([path, content]) => [blobSha(content), content]));
    const fileEntries = Object.entries(contentByPath).map(([path, content]) => ({ path, type: "blob", sha: blobSha(content) }));
    vi.stubEnv("SMARTAIHUB_MINIAPP_GITHUB_TOKEN", "managed-test-token");
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const path = decodeURIComponent(url.pathname).replace(`/repos/${owner}/${repository}`, "");
      if (path === "") return new Response(JSON.stringify({ private: true, full_name: `${owner}/${repository}` }));
      if (path === `/branches/${branch}`) return new Response(JSON.stringify({ commit: { sha: revision } }));
      if (path === `/commits/${revision}`) return new Response(JSON.stringify({ sha: revision, parents: [{ sha: baseRevision }], commit: { tree: { sha: "tree-sha" } } }));
      if (path.startsWith("/compare/")) {
        const [base, head] = decodeURIComponent(path.slice("/compare/".length)).split("...");
        return new Response(JSON.stringify({ status: head === revision && base === revision ? "identical" : "ahead", merge_base_commit: { sha: base === baseRevision ? baseRevision : revision } }));
      }
      if (path === "/git/trees/tree-sha") return new Response(JSON.stringify({ tree: fileEntries }));
      const blobMatch = /^\/git\/blobs\/([a-f0-9]+)$/.exec(path);
      if (blobMatch) return new Response(JSON.stringify({ encoding: "base64", content: Buffer.from(blobs.get(blobMatch[1]!)!, "utf8").toString("base64") }));
      return new Response("not found", { status: 404 });
    }));
    vi.mocked(storagePutContentAddressedIfAbsent).mockImplementation(async (key, bytes) => {
      const digest = createHash("sha256").update(bytes).digest("hex");
      return { key: `${key}/sha256/${digest}`, sha256: digest, url: "" };
    });

    try {
      const imported = await importMiniAppGitRevisionCandidate({
        appId,
        tenantId: "tenant-owner",
        ownerUserId: 42,
        repository: { mode: "SMARTAIHUB_MANAGED", owner, name: repository, revision: baseRevision },
        branch,
        revision,
      });
      expect(imported.bundle).toMatchObject({ appId, owner, repository, branch, revision, parentRevision: baseRevision, sourceTreeDigest });
      expect(imported.sourceRef).toMatch(/^r2:\/\/mini-app-sources\/tenant-owner\/app_other_owner\/sha256\//);
      expect(storagePutContentAddressedIfAbsent).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  it("packages the normal structured app-source repository format without generation", async () => {
    const revision = "a".repeat(40);
    const appSource = JSON.stringify(generated);
    const sourceTreeDigest = createHash("sha256").update(appSource).digest("hex");
    const bundle = {
      schemaVersion: "smartaihub-miniapp-git-candidate.v1" as const,
      format: "STRUCTURED_APP_SOURCE" as const,
      appId: "app_candidate",
      owner: "owner",
      repository: "private-app",
      branch: "main",
      revision,
      parentRevision: "b".repeat(40),
      sourceTreeDigest,
      files: { "app-source.json": appSource },
    };
    expect(resolveMiniAppGitCandidateSource(bundle)).toEqual(generated);
    const sourceBytes = Buffer.from(JSON.stringify(bundle));
    const sourceDigest = createHash("sha256").update(sourceBytes).digest("hex");
    vi.mocked(storageReadBuffer).mockResolvedValueOnce(sourceBytes);
    vi.mocked(storagePutContentAddressedIfAbsent).mockImplementation(async (key, bytes) => {
      const digest = createHash("sha256").update(bytes).digest("hex");
      return { key: `${key}/sha256/${digest}`, sha256: digest, url: "" };
    });

    const result = await packageMiniAppGitCandidate({
      tenantId: "tenant-test",
      appId: "app_candidate",
      sourceRef: `r2://mini-app-sources/tenant-test/app_candidate/sha256/${sourceDigest}`,
      sourceDigest,
      owner: "owner",
      repository: "private-app",
      branch: "main",
      revision,
    });
    expect(result.artifactDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(storagePutContentAddressedIfAbsent).toHaveBeenCalledOnce();
    expect(callLLMStructured).not.toHaveBeenCalled();
  });

  it("keeps V1 serving when a pre-promotion smoke assertion fails", async () => {
    const v1Bytes = Buffer.from("<!doctype html><html><head></head><body><main>V1 expense tracker</main></body></html>");
    const v1Digest = createHash("sha256").update(v1Bytes).digest("hex");
    const v1Ref = `r2://mini-app-previews/tenant-test/app_test/sha256/${v1Digest}`;
    const identity = { lastKnownGoodArtifactRef: v1Ref, deploymentVersion: 1 };
    const candidateRef = "r2://mini-app-previews/tenant-test/app_test/sha256/" + "b".repeat(64);
    const promote = vi.fn(async () => {
      identity.lastKnownGoodArtifactRef = candidateRef;
      identity.deploymentVersion += 1;
      return { deploymentVersion: identity.deploymentVersion };
    });
    const serveOwnerApp = () => identity.lastKnownGoodArtifactRef;

    await expect(promoteMiniAppArtifactAfterVerification({
      verify: async () => {
        // Candidate bytes, rendering/CSP and private access checks pass first.
        // Inject the final pre-promotion assertion failure from the smoke stage.
        throw new Error("INJECTED_PRE_PROMOTION_SMOKE_FAILURE");
      },
      promote,
    })).rejects.toThrow("INJECTED_PRE_PROMOTION_SMOKE_FAILURE");

    expect(promote).not.toHaveBeenCalled();
    expect(identity.deploymentVersion).toBe(1);
    expect(serveOwnerApp()).toBe(v1Ref);
    vi.mocked(resolveMiniAppForViewer).mockResolvedValueOnce({
      appId: "app_test", tenantId: "tenant-test", ownerUserId: 42, visibility: "private",
      deploymentVersion: identity.deploymentVersion, lastKnownGoodArtifactRef: identity.lastKnownGoodArtifactRef,
      lifecycle: "active",
    } as any);
    vi.mocked(storageReadBuffer).mockResolvedValueOnce(v1Bytes);
    await expect(resolvePersonalMiniAppPreview({ appId: "app_test", tenantId: "tenant-test", userId: 42 }))
      .resolves.toMatchObject({ html: v1Bytes.toString("utf8"), artifactDigest: v1Digest });
  });

  it("keeps an existing preview available when a later factory stage fails", () => {
    expect(resolvePersonalMiniAppHomeMilestone({
      failed: true,
      hasUsableArtifact: true,
      storedMilestone: "VERIFICATION_PENDING",
    })).toBe("VERIFICATION_PENDING");
    expect(resolvePersonalMiniAppHomeMilestone({
      failed: true,
      hasUsableArtifact: false,
      storedMilestone: "BUILDING",
    })).toBe("BUILD_FAILED");
    expect(resolvePersonalMiniAppHomeMilestone({
      failed: false,
      hasUsableArtifact: true,
      storedMilestone: "BUILDING",
    })).toBe("PREVIEW_AVAILABLE");
  });

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
      if (target.includes("/commits/" + "a".repeat(40))) return new Response(JSON.stringify({ sha: "a".repeat(40) }), { status: 200 });
      if (target.includes(`/contents/app-source.json?ref=${"a".repeat(40)}`)) return new Response(JSON.stringify({
        path: "app-source.json",
        encoding: "base64",
        content: Buffer.from(JSON.stringify(generated)).toString("base64"),
      }), { status: 200 });
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

  it("uses the explicitly connected personal GitHub account and avoids duplicate source commits", async () => {
    const sourceBytes = Buffer.from(JSON.stringify(generated));
    const sourceDigest = createHash("sha256").update(sourceBytes).digest("hex");
    const sourceRef = `r2://mini-app-sources/tenant-test/app_test/sha256/${sourceDigest}`;
    const revision = "b".repeat(40);
    vi.mocked(storageReadBuffer).mockResolvedValue(sourceBytes);
    githubMocks.getConnection.mockResolvedValue({ githubLogin: "personal-owner", tenantId: "tenant-test", configured: true });
    githubMocks.getToken.mockResolvedValue("user-owned-token");
    githubMocks.validateToken.mockResolvedValue("personal-owner");
    vi.stubEnv("SMARTAIHUB_MINIAPP_GITHUB_TOKEN", "managed-token-must-not-be-used");
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const target = String(url);
      calls.push({ url: target, init });
      if (target.endsWith("/repos/personal-owner/smartaihub-app-test") && init?.method !== "POST") {
        return response({ private: true, owner: { login: "personal-owner" }, html_url: "https://github.com/personal-owner/smartaihub-app-test", default_branch: "main" });
      }
      if (target.endsWith("/repos/personal-owner/smartaihub-app-test") && init?.method === "POST") {
        return response({ private: true, owner: { login: "personal-owner" }, html_url: "https://github.com/personal-owner/smartaihub-app-test", default_branch: "main" }, 201);
      }
      if (target.endsWith("/repos/personal-owner/smartaihub-app-test/contents/app-source.json?ref=main")) {
        const putAlreadyHappened = calls.some(call => call.init?.method === "PUT");
        return putAlreadyHappened
          ? response({ path: "app-source.json", encoding: "base64", sha: "file-blob", content: sourceBytes.toString("base64") })
          : response("not found", 404);
      }
      if (target.endsWith("/repos/personal-owner/smartaihub-app-test/contents/app-source.json") && init?.method === "PUT") {
        return response({ commit: { sha: revision } }, 201);
      }
      if (target.endsWith(`/repos/personal-owner/smartaihub-app-test/commits?path=app-source.json&per_page=1`)) {
        return response([{ sha: revision }]);
      }
      if (target.endsWith(`/repos/personal-owner/smartaihub-app-test/commits/${revision}`)) return response({ sha: revision });
      if (target.endsWith(`/repos/personal-owner/smartaihub-app-test/contents/app-source.json?ref=${revision}`)) {
        return response({ path: "app-source.json", encoding: "base64", content: sourceBytes.toString("base64") });
      }
      return response({ message: "unexpected request" }, 500);
    }));

    const input = { userId: 23, tenantId: "tenant-test", appId: "app_test", sourceRef, sourceDigest };
    const first = await provisionMiniAppRepositoryFromSnapshot(input);
    const second = await provisionMiniAppRepositoryFromSnapshot(input);

    expect(first).toMatchObject({ mode: "USER_OWNED", owner: "personal-owner", revision });
    expect(second).toEqual(first);
    expect(calls.filter(call => call.init?.method === "PUT")).toHaveLength(1);
    expect(calls.some(call => new Headers(call.init?.headers).get("Authorization") === "Bearer managed-token-must-not-be-used")).toBe(false);
    expect(githubMocks.getConnection).toHaveBeenCalledWith(23);
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

  it("derives a missing app title from the owner's goal without a second model call", async () => {
    const { title: _title, ...candidate } = generated;
    vi.mocked(callLLMStructured).mockResolvedValueOnce({ data: candidate } as any);
    await expect(generatePersonalMiniApp({
      userId: 42,
      tenantId: "tenant-test",
      appId: "app_expenses",
      runId: "run_expenses",
      prompt: "Create a personal expense tracker with income and monthly charts.",
    })).resolves.toEqual({ ...generated, title: "Personal expense tracker" });
    expect(callLLMStructured).toHaveBeenCalledTimes(1);
    expect(derivePersonalMiniAppTitle("Create a mobile-friendly personal expense tracker with income, expenses and a chart.")).toBe("Mobile-friendly personal expense tracker");
  });

  it("repairs a complete malformed Gateway JSON candidate locally before another call", async () => {
    const rawResponse = JSON.stringify({ app: {
      html: "<!doctype html><html><body><main>Expense tracker</main></body></html>",
      css: "main{max-width:40rem}",
      javascript: "document.body.dataset.ready='true'",
      assets: [],
    } }).replace(',"css"', '"css"');
    expect(repairPersonalMiniAppJsonCandidate(rawResponse)).toMatchObject({ html: expect.any(String) });
    vi.mocked(callLLMStructured).mockRejectedValueOnce(Object.assign(
      new Error("LLM returned invalid JSON"),
      { name: "LLMStructuredOutputError", rawResponse },
    ));
    await expect(generatePersonalMiniApp({
      userId: 42,
      tenantId: "tenant-test",
      appId: "app_json_repair",
      runId: "run_json_repair",
      prompt: "Create a personal expense tracker with monthly charts.",
    })).resolves.toMatchObject({ title: "Personal expense tracker", html: expect.any(String) });
    expect(callLLMStructured).toHaveBeenCalledTimes(1);
  });

  it("normalizes the common js alias from a complete persisted candidate", () => {
    const candidate = repairPersonalMiniAppJsonCandidate(JSON.stringify({ app: {
      title: "Expense tracker",
      html: generated.html,
      css: generated.css,
      js: generated.javascript,
      assets: [],
    } }));
    expect(candidate).toMatchObject({ javascript: generated.javascript });
  });

  it("builds an eligible persisted candidate locally without another Gateway call", async () => {
    const candidate = { app: { html: generated.html, css: generated.css, js: generated.javascript, assets: [] } };
    const candidateBytes = Buffer.from(JSON.stringify(candidate));
    const candidateDigest = createHash("sha256").update(candidateBytes).digest("hex");
    const runId = "run_candidate_only";
    const candidateRef = `r2://mini-app-candidates/tenant-test/app_expenses/run-${createHash("sha256").update(runId).digest("hex").slice(0, 16)}/sha256/${candidateDigest}`;
    vi.mocked(storageReadBuffer).mockResolvedValueOnce(candidateBytes);
    vi.mocked(storagePutContentAddressedIfAbsent).mockImplementation(async (key, bytes) => {
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      return { key: `${key}/sha256/${sha256}`, sha256, url: "" };
    });

    const result = await buildAndStorePersonalMiniApp({
      userId: 42,
      tenantId: "tenant-test",
      appId: "app_expenses",
      runId,
      prompt: "Create an expense tracker with monthly totals.",
      previousCandidateRef: candidateRef,
      candidateOnly: true,
    });
    expect(result.sourceDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(result.artifactDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(callLLMStructured).not.toHaveBeenCalled();
  });

  it("repairs malformed field-repair JSON locally while retaining the candidate", async () => {
    const invalid = { ...generated, html: `${generated.html}<script>bad()</script>`, javascript: "const = broken" };
    const repairedHtml = "<!doctype html><html><body><main>Expense tracker</main></body></html>";
    const malformedRepair = JSON.stringify({ html: repairedHtml, javascript: "document.body.dataset.ready='true'" })
      .replace(',"javascript"', '"javascript"');
    vi.mocked(callLLMStructured)
      .mockResolvedValueOnce({ data: invalid } as any)
      .mockRejectedValueOnce(Object.assign(new Error("invalid field repair JSON"), {
        name: "LLMStructuredOutputError",
        rawResponse: malformedRepair,
      }));
    vi.mocked(storagePutContentAddressedIfAbsent).mockImplementation(async (key, bytes) => {
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      return { key: `${key}/sha256/${sha256}`, sha256, url: "" };
    });
    await expect(generatePersonalMiniApp({
      userId: 42,
      tenantId: "tenant-test",
      appId: "app_field_repair",
      runId: "run_field_repair",
      prompt: "Create a personal expense tracker with income and monthly charts.",
    })).resolves.toMatchObject({
      html: repairedHtml,
      javascript: "document.body.dataset.ready='true'",
    });
    expect(callLLMStructured).toHaveBeenCalledTimes(2);
    expect(storagePutContentAddressedIfAbsent).toHaveBeenCalledOnce();
  });

  it("rejects deterministic JSON repair when the generated HTML document is truncated", () => {
    const rawResponse = JSON.stringify({
      html: "<!doctype html><html><body><main>Expense tracker",
      css: "",
      javascript: "",
      assets: [],
    });
    expect(repairPersonalMiniAppJsonCandidate(rawResponse)).toBeNull();
  });

  it("preserves a partial app candidate and repairs only invalid JavaScript", async () => {
    const candidate = { ...generated, javascript: "const = broken" };
    vi.mocked(callLLMStructured)
      .mockResolvedValueOnce({ data: candidate } as any)
      .mockResolvedValueOnce({ data: { javascript: "document.body.dataset.ready='true'" } } as any);
    vi.mocked(storagePutContentAddressedIfAbsent).mockImplementation(async (key, bytes) => {
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      return { key: `${key}/sha256/${sha256}`, sha256, url: "" };
    });

    await expect(buildAndStorePersonalMiniApp({
      userId: 42,
      tenantId: "tenant-test",
      appId: "app_expenses",
      runId: "run_repair",
      prompt: "Create an expense tracker with monthly totals.",
    })).resolves.toMatchObject({
      candidateRef: expect.stringMatching(/^r2:\/\/mini-app-candidates\/tenant-test\/app_expenses\/run-/),
      candidateDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      repairedFields: ["javascript"],
    });
    expect(callLLMStructured).toHaveBeenCalledTimes(2);
    expect(callLLMStructured.mock.calls[1]?.[0]).toMatchObject({
      billingDescription: "Personal Mini-App field repair",
      runtimeOptions: expect.objectContaining({ requestLabel: "personal_miniapp_field_repair" }),
    });
    expect(storagePutContentAddressedIfAbsent).toHaveBeenCalledTimes(3);
  });

  it("fails safely when repaired content remains invalid and keeps the candidate reference", async () => {
    const candidate = { ...generated, html: "<iframe src='https://example.invalid'></iframe>" };
    vi.mocked(callLLMStructured)
      .mockResolvedValueOnce({ data: candidate } as any)
      .mockResolvedValueOnce({ data: { html: "<script>alert(1)</script>" } } as any);
    vi.mocked(storagePutContentAddressedIfAbsent).mockImplementationOnce(async (key, bytes) => {
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      return { key: `${key}/sha256/${sha256}`, sha256, url: "" };
    });
    await expect(generatePersonalMiniApp({
      userId: 42,
      tenantId: "tenant-test",
      appId: "app_expenses",
      runId: "run_invalid",
      prompt: "Create an expense tracker.",
    })).rejects.toMatchObject({
      name: "PersonalMiniAppGenerationError",
      candidateRef: expect.stringMatching(/^r2:\/\/mini-app-candidates\//),
      invalidFields: ["html"],
    });
  });

  it("resumes the original candidate by digest and repairs it without another generation call", async () => {
    const candidate = { ...generated, javascript: "const = broken" };
    const candidateBytes = Buffer.from(JSON.stringify(candidate));
    const candidateDigest = createHash("sha256").update(candidateBytes).digest("hex");
    const runId = "run_resume";
    const candidateRef = `r2://mini-app-candidates/tenant-test/app_expenses/run-${createHash("sha256").update(runId).digest("hex").slice(0, 16)}/sha256/${candidateDigest}`;
    vi.mocked(storageReadBuffer).mockResolvedValueOnce(candidateBytes);
    vi.mocked(callLLMStructured).mockResolvedValueOnce({ data: { javascript: generated.javascript } } as any);
    vi.mocked(storagePutContentAddressedIfAbsent).mockImplementation(async (key, bytes) => {
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      return { key: `${key}/sha256/${sha256}`, sha256, url: "" };
    });

    const result = await buildAndStorePersonalMiniApp({
      userId: 42,
      tenantId: "tenant-test",
      appId: "app_expenses",
      runId,
      prompt: "Create an expense tracker with monthly totals.",
      previousCandidateRef: candidateRef,
    });
    expect(result.sourceDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(result.repairedFields).toEqual(["javascript"]);
    expect(callLLMStructured).toHaveBeenCalledTimes(1);
    expect(callLLMStructured).toHaveBeenCalledWith(expect.objectContaining({ billingDescription: "Personal Mini-App field repair" }));
    expect(storageReadBuffer).toHaveBeenCalledWith(candidateRef.slice("r2://".length));
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
