import { describe, expect, it } from "vitest";
import AdmZip from "adm-zip";

import {
  canActorUseRunner,
  Spec224WorkspaceSpecSetError,
  createSpec224WorkspaceSpecSetService,
  parseSpec224WorkspaceArtifacts,
  workspaceFactsFromSnapshot,
  type Spec224WorkspaceSpecSetStore,
} from "./spec224WorkspaceSpecSet";

function memoryStore(): Spec224WorkspaceSpecSetStore & {
  bindings: Map<string, any>;
  revisions: any[];
  availability: "current" | "stale" | "revoked" | "forbidden";
} {
  const bindings = new Map<string, any>();
  const revisions: any[] = [];
  return {
    bindings,
    revisions,
    availability: "current",
    async listTrustedWorkspaces(input) {
      return input.actorId === 42
        ? [{ runnerId: "runner-a", displayName: "Runner A", status: "online", snapshotRevision: "7", workspaceId: "workspace-a", gitHead: "a".repeat(40), gitBranch: "main", dirty: false, contentFingerprint: "c".repeat(64) }]
        : [];
    },
    async getConversation(input) {
      return [8, 9].includes(input.conversationId) && input.tenantId === "tenant-a" && input.actorId === 42
        ? { conversationId: input.conversationId, tenantId: "tenant-a", actorId: 42 }
        : null;
    },
    async upsertBinding(input) {
      const binding = { ...input, revision: 1 };
      bindings.set(`${input.tenantId}:${input.actorId}:${input.conversationId}`, binding);
      return binding;
    },
    async getBinding(input) {
      return bindings.get(`${input.tenantId}:${input.actorId}:${input.conversationId}`) ?? null;
    },
    async getBindingAvailability() {
      return this.availability;
    },
    async getRevisionByIdempotency(input) {
      return revisions.find(revision => revision.tenantId === input.tenantId && revision.actorId === input.actorId && revision.runnerId === input.runnerId && revision.workspaceId === input.workspaceId && revision.idempotencyKey === input.idempotencyKey) ?? null;
    },
    async createRevision(input) {
      const revision = { ...input, id: `set-${input.revision}` };
      revisions.push(revision);
      return revision;
    },
    async getLatestRevision(input) {
      return revisions.filter(revision => revision.tenantId === input.tenantId && revision.actorId === input.actorId && revision.runnerId === input.runnerId && revision.workspaceId === input.workspaceId).at(-1) ?? null;
    },
    async getRevision(input) {
      return revisions.find(revision => revision.tenantId === input.tenantId && revision.actorId === input.actorId && revision.runnerId === input.runnerId && revision.workspaceId === input.workspaceId && revision.revision === input.revision) ?? null;
    },
  };
}

describe("spec224 workspace Spec Set", () => {
  it("uses sanitized additive workspace facts without deriving repository data", () => {
    expect(workspaceFactsFromSnapshot({
      runnerId: "runner-a",
      workspaceIds: ["workspace-legacy"],
      workspaces: [{ workspaceId: "workspace-a", displayName: "App", gitHead: "b".repeat(40), gitBranch: "main", dirty: true, contentFingerprint: "d".repeat(64) }, { workspaceId: "workspace-a", repositoryRef: "do-not-expose" }],
    })).toEqual([{ workspaceId: "workspace-a", projectId: null, repositoryId: null, displayName: "App", gitHead: "b".repeat(40), gitBranch: "main", dirty: true, contentFingerprint: "d".repeat(64) }, { workspaceId: "workspace-legacy", projectId: null, repositoryId: null, displayName: null, gitHead: null, gitBranch: null, dirty: null, contentFingerprint: null }]);
  });

  it("accepts bounded Markdown and JSON artifacts deterministically", async () => {
    await expect(parseSpec224WorkspaceArtifacts([
      { path: "specs/login.md", contentBase64: Buffer.from("# Login\n- [ ] MUST authenticate users", "utf8").toString("base64") },
      { path: "specs/metadata.json", contentBase64: Buffer.from('{"name":"login"}', "utf8").toString("base64") },
    ])).resolves.toMatchObject({ files: [{ path: "specs/login.md" }, { path: "specs/metadata.json" }] });
  });

  it("expands an allowlisted ZIP package as untrusted bounded artifacts", async () => {
    const zip = new AdmZip();
    zip.addFile("nested/spec.md", Buffer.from("# Scope\n- [ ] MUST stay bounded", "utf8"));
    await expect(parseSpec224WorkspaceArtifacts([
      { path: "spec-set.zip", contentBase64: zip.toBuffer().toString("base64") },
    ])).resolves.toMatchObject({ files: [{ path: "nested/spec.md" }] });
  });

  it("stops a compressed ZIP before an understated entry can exceed the streaming expansion cap", async () => {
    const zip = new AdmZip();
    for (let index = 0; index < 5; index += 1) zip.addFile(`bomb-${index}.md`, Buffer.alloc(900 * 1024, 0x61));
    const archive = zip.toBuffer();
    let offset = 0;
    for (let index = 0; index < 5; index += 1) {
      offset = archive.indexOf(Buffer.from("PK\x01\x02"), offset);
      expect(offset).toBeGreaterThanOrEqual(0);
      archive.writeUInt32LE(1, offset + 24);
      offset += 4;
    }
    await expect(parseSpec224WorkspaceArtifacts([
      { path: "understated.zip", contentBase64: archive.toString("base64") },
    ])).rejects.toMatchObject({ code: "SPEC_SET_EXPANSION_LIMIT" });
  });

  it("rejects aggregate raw uploads before retaining a multi-file request", async () => {
    const contentBase64 = Buffer.alloc(1_500_000, 0x61).toString("base64");
    await expect(parseSpec224WorkspaceArtifacts([
      { path: "one.md", contentBase64 },
      { path: "two.md", contentBase64 },
      { path: "three.md", contentBase64 },
    ])).rejects.toMatchObject({ code: "SPEC_SET_RAW_AGGREGATE_LIMIT" });
  });

  it("allows tenant-shared Runner ownership without allowing another owner", () => {
    expect(canActorUseRunner(null, 42)).toBe(true);
    expect(canActorUseRunner(42, 42)).toBe(true);
    expect(canActorUseRunner(43, 42)).toBe(false);
  });

  it("rejects traversal and duplicate case-folded artifact paths", async () => {
    await expect(parseSpec224WorkspaceArtifacts([
      { path: "../secrets.md", contentBase64: Buffer.from("MUST reject", "utf8").toString("base64") },
    ])).rejects.toMatchObject({ code: "SPEC_SET_PATH_INVALID" });
    await expect(parseSpec224WorkspaceArtifacts([
      { path: "Spec.md", contentBase64: Buffer.from("MUST work", "utf8").toString("base64") },
      { path: "spec.md", contentBase64: Buffer.from("MUST work", "utf8").toString("base64") },
    ])).rejects.toMatchObject({ code: "SPEC_SET_PATH_DUPLICATE" });
  });

  it("binds only a current trusted workspace for the owning conversation", async () => {
    const store = memoryStore();
    const service = createSpec224WorkspaceSpecSetService(store);
    await expect(service.bindConversationWorkspace({
      tenantId: "tenant-a", actorId: 42, conversationId: 8, runnerId: "runner-a", workspaceId: "workspace-a",
    })).resolves.toMatchObject({ conversationId: 8, runnerId: "runner-a", workspaceId: "workspace-a", revision: 1 });
    await expect(service.bindConversationWorkspace({
      tenantId: "tenant-a", actorId: 99, conversationId: 8, runnerId: "runner-a", workspaceId: "workspace-a",
    })).rejects.toMatchObject({ code: "CONVERSATION_SCOPE_FORBIDDEN" });
  });

  it("shares immutable workspace-keyed revisions across bound Chat sections and keeps preparation side-effect free", async () => {
    const store = memoryStore();
    const service = createSpec224WorkspaceSpecSetService(store);
    await service.bindConversationWorkspace({ tenantId: "tenant-a", actorId: 42, conversationId: 8, runnerId: "runner-a", workspaceId: "workspace-a" });
    await service.bindConversationWorkspace({ tenantId: "tenant-a", actorId: 42, conversationId: 9, runnerId: "runner-a", workspaceId: "workspace-a" });
    const first = await service.ingestSpecSet({
      tenantId: "tenant-a", actorId: 42, conversationId: 8, idempotencyKey: "spec-set-key-0001",
      artifacts: [{ path: "spec.md", contentBase64: Buffer.from("# Scope\n- [ ] MUST preserve old revisions", "utf8").toString("base64") }],
    });
    const second = await service.ingestSpecSet({
      tenantId: "tenant-a", actorId: 42, conversationId: 8, idempotencyKey: "spec-set-key-0002",
      artifacts: [{ path: "spec.md", contentBase64: Buffer.from("# Scope\n- [ ] MUST create a new revision", "utf8").toString("base64") }],
    });
    expect(first.revision).toBe(1);
    expect(second.revision).toBe(2);
    expect(store.revisions).toHaveLength(2);
    expect(store.revisions[1]).toMatchObject({ parentRevision: 1, replacedPaths: ["spec.md"] });
    expect(store.revisions[1].files).toHaveLength(1);
    await expect(service.getConversationWorkspace({ tenantId: "tenant-a", actorId: 42, conversationId: 9 })).resolves.toMatchObject({
      specSet: { revision: 2, files: [{ path: "spec.md" }], replacedPaths: ["spec.md"] },
    });
    await expect(service.prepareWorkspaceRun({ tenantId: "tenant-a", actorId: 42, conversationId: 9, mode: "spec_set", specSetRevision: first.revision })).resolves.toMatchObject({ requirementCount: 1, runnableWorkPackageIds: [], blockers: ["NO_RUNNABLE_WORK_PACKAGES"] });
    expect(store.revisions).toHaveLength(2);
  });

  it("blocks parsed requirements that do not declare a runnable work package", async () => {
    const store = memoryStore();
    const service = createSpec224WorkspaceSpecSetService(store);
    await service.bindConversationWorkspace({ tenantId: "tenant-a", actorId: 42, conversationId: 8, runnerId: "runner-a", workspaceId: "workspace-a" });
    await service.ingestSpecSet({
      tenantId: "tenant-a", actorId: 42, conversationId: 8, idempotencyKey: "spec-set-key-empty",
      artifacts: [{ path: "notes.md", contentBase64: Buffer.from("# Notes\nOnly context.", "utf8").toString("base64") }],
    });
    await expect(service.prepareWorkspaceRun({ tenantId: "tenant-a", actorId: 42, conversationId: 8, mode: "spec_set" })).resolves.toMatchObject({ runnableWorkPackageIds: [], blockers: [expect.stringMatching(/REQUIREMENTS_REQUIRED/)] });
  });

  it("prepares an explicitly complete package while an independent package stays blocked", async () => {
    const store = memoryStore();
    const service = createSpec224WorkspaceSpecSetService(store);
    await service.bindConversationWorkspace({ tenantId: "tenant-a", actorId: 42, conversationId: 8, runnerId: "runner-a", workspaceId: "workspace-a" });
    const artifacts = [
      { path: "specs/auth.md", contentBase64: Buffer.from("# Auth\n\n- [ ] MUST authenticate users", "utf8").toString("base64") },
      { path: "specs/packages.json", contentBase64: Buffer.from(JSON.stringify({ spec224: { workPackages: [
        { id: "auth-api", requirementRefs: [{ artifactPath: "specs/auth.md", line: 3 }], dependsOn: [], acceptanceCriteria: ["A valid login creates a session"], verification: [{ id: "auth-test", kind: "test", ref: "test:apps/web/auth.test.ts" }], allowedWriteSet: ["apps/web/server/auth.ts"] },
        { id: "future-ui", requirementRefs: [{ artifactPath: "specs/missing.md", line: 3 }], dependsOn: [], acceptanceCriteria: ["A login form is visible"], verification: [{ id: "ui-test", kind: "test", ref: "test:apps/web/ui.test.tsx" }], allowedWriteSet: ["apps/web/client/Auth.tsx"] },
      ] } }), "utf8").toString("base64") },
      ...[1, 2, 3].map(index => ({
        path: `future/unrelated-${index}.json`,
        contentBase64: Buffer.from(JSON.stringify({ notes: "x".repeat(700_000) }), "utf8").toString("base64"),
      })),
    ];
    await service.ingestSpecSet({ tenantId: "tenant-a", actorId: 42, conversationId: 8, idempotencyKey: "spec-set-incremental-ready-0001", artifacts });

    const preparation = await service.prepareWorkspaceRun({ tenantId: "tenant-a", actorId: 42, conversationId: 8, mode: "spec_set" });
    expect(preparation).toMatchObject({
      requirementCount: 1,
      runnableWorkPackageIds: [expect.stringMatching(/^wp:/)],
      blockers: [],
      workPackages: [
        expect.objectContaining({ externalId: "auth-api", readiness: "READY" }),
        expect.objectContaining({ externalId: "future-ui", readiness: "BLOCKED" }),
      ],
    });
    const input = await service.resolveWorkspaceRunInput({
      tenantId: "tenant-a", actorId: 42, conversationId: 8, mode: "spec_set",
      workPackageId: preparation.runnableWorkPackageIds[0],
    });
    expect(input).toMatchObject({
      repositoryRef: "runner:runner-a/workspace-a",
      baseRevision: `git:${"a".repeat(40)}`,
      specSetRevision: 1,
      inputFiles: [
        { path: "specs/auth.md", contentBase64: Buffer.from("# Auth\n\n- [ ] MUST authenticate users", "utf8").toString("base64") },
        { path: "specs/packages.json", contentBase64: artifacts[1].contentBase64 },
      ],
    });
  });

  it("prepares prompt intent without dispatching and pins its workspace revision", async () => {
    const store = memoryStore();
    const service = createSpec224WorkspaceSpecSetService(store);
    await service.bindConversationWorkspace({ tenantId: "tenant-a", actorId: 42, conversationId: 8, runnerId: "runner-a", workspaceId: "workspace-a" });

    await expect(service.prepareWorkspaceRun({
      tenantId: "tenant-a", actorId: 42, conversationId: 8, mode: "prompt", prompt: "Prepare the workspace for a safe change",
    })).resolves.toMatchObject({
      runnableWorkPackageIds: ["prompt"],
      blockers: [],
    });
    await expect(service.resolveWorkspaceRunInput({
      tenantId: "tenant-a", actorId: 42, conversationId: 8, mode: "prompt", prompt: "Prepare the workspace for a safe change",
    })).resolves.toMatchObject({
      repositoryRef: "runner:runner-a/workspace-a",
      baseRevision: `git:${"a".repeat(40)}`,
      specSetRevision: null,
      inputFiles: [{ path: "prompt.md", contentBase64: Buffer.from("Prepare the workspace for a safe change", "utf8").toString("base64") }],
    });
  });

  it("rejects a merged manifest that exceeds the durable JSONB size bound", async () => {
    const store = memoryStore();
    const service = createSpec224WorkspaceSpecSetService(store);
    await service.bindConversationWorkspace({ tenantId: "tenant-a", actorId: 42, conversationId: 8, runnerId: "runner-a", workspaceId: "workspace-a" });
    const contentBase64 = Buffer.alloc(1024 * 1024, 0x61).toString("base64");

    await expect(service.ingestSpecSet({
      tenantId: "tenant-a", actorId: 42, conversationId: 8, idempotencyKey: "spec-set-manifest-size-0001",
      artifacts: ["one", "two", "three", "four"].map(name => ({ path: `${name}.md`, contentBase64 })),
    })).rejects.toMatchObject({ code: "SPEC_SET_MANIFEST_OVERSIZED" });
    expect(store.revisions).toHaveLength(0);
  });

  it("recovers the same idempotency result after a concurrent stale-head conflict", async () => {
    const store = memoryStore();
    const service = createSpec224WorkspaceSpecSetService(store);
    await service.bindConversationWorkspace({ tenantId: "tenant-a", actorId: 42, conversationId: 8, runnerId: "runner-a", workspaceId: "workspace-a" });
    store.createRevision = async input => {
      const committed = { ...input, id: "set-concurrent" };
      store.revisions.push(committed);
      throw new Spec224WorkspaceSpecSetError("SPEC_SET_REVISION_STALE");
    };

    await expect(service.ingestSpecSet({
      tenantId: "tenant-a", actorId: 42, conversationId: 8, idempotencyKey: "spec-set-race-replay-0001",
      artifacts: [{ path: "spec.md", contentBase64: Buffer.from("- [ ] MUST survive a concurrent writer", "utf8").toString("base64") }],
    })).resolves.toMatchObject({ revision: 1, files: [{ path: "spec.md" }] });
    expect(store.revisions).toHaveLength(1);
  });

  it("reports an idempotency conflict when a concurrent unique insert has another digest", async () => {
    const store = memoryStore();
    const service = createSpec224WorkspaceSpecSetService(store);
    await service.bindConversationWorkspace({ tenantId: "tenant-a", actorId: 42, conversationId: 8, runnerId: "runner-a", workspaceId: "workspace-a" });
    store.createRevision = async input => {
      store.revisions.push({ ...input, id: "set-other-request", requestDigest: "different-request-digest" });
      throw Object.assign(new Error("duplicate key"), { code: "23505" });
    };

    await expect(service.ingestSpecSet({
      tenantId: "tenant-a", actorId: 42, conversationId: 8, idempotencyKey: "spec-set-race-conflict-0001",
      artifacts: [{ path: "spec.md", contentBase64: Buffer.from("- [ ] MUST reject a conflicting replay", "utf8").toString("base64") }],
    })).rejects.toMatchObject({ code: "SPEC_SET_IDEMPOTENCY_CONFLICT" });
  });

  it("allows an offline owner to view and append the persistent workspace Spec Set, but rejects execution preparation", async () => {
    const store = memoryStore();
    const service = createSpec224WorkspaceSpecSetService(store);
    await service.bindConversationWorkspace({ tenantId: "tenant-a", actorId: 42, conversationId: 8, runnerId: "runner-a", workspaceId: "workspace-a" });
    await service.ingestSpecSet({
      tenantId: "tenant-a", actorId: 42, conversationId: 8, idempotencyKey: "spec-set-online-0001",
      artifacts: [{ path: "first.md", contentBase64: Buffer.from("- [ ] MUST retain state", "utf8").toString("base64") }],
    });
    store.availability = "stale";
    await expect(service.getConversationWorkspace({ tenantId: "tenant-a", actorId: 42, conversationId: 8 })).resolves.toMatchObject({ availability: { status: "stale", available: false }, specSet: { revision: 1 } });
    await expect(service.ingestSpecSet({
      tenantId: "tenant-a", actorId: 42, conversationId: 8, idempotencyKey: "spec-set-offline-0002",
      artifacts: [{ path: "second.md", contentBase64: Buffer.from("- [ ] MUST append offline", "utf8").toString("base64") }],
    })).resolves.toMatchObject({ revision: 2, files: [{ path: "first.md" }, { path: "second.md" }] });
    await expect(service.prepareWorkspaceRun({ tenantId: "tenant-a", actorId: 42, conversationId: 8, mode: "spec_set" })).rejects.toMatchObject({ code: "WORKSPACE_BINDING_STALE" });
  });

  it("rejects revoked workspace bindings even for persistent read or ingestion", async () => {
    const store = memoryStore();
    const service = createSpec224WorkspaceSpecSetService(store);
    await service.bindConversationWorkspace({ tenantId: "tenant-a", actorId: 42, conversationId: 8, runnerId: "runner-a", workspaceId: "workspace-a" });
    store.availability = "revoked";
    await expect(service.getConversationWorkspace({ tenantId: "tenant-a", actorId: 42, conversationId: 8 })).rejects.toMatchObject({ code: "WORKSPACE_BINDING_REVOKED" });
    await expect(service.ingestSpecSet({ tenantId: "tenant-a", actorId: 42, conversationId: 8, idempotencyKey: "spec-set-revoked-01", artifacts: [{ path: "spec.md", contentBase64: "TUFZVA==" }] })).rejects.toMatchObject({ code: "WORKSPACE_BINDING_REVOKED" });
  });
});
