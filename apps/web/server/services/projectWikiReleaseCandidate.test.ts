import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assertApprovedProjectWikiStagingEnvelope,
  PROJECT_WIKI_CANDIDATE,
  PROJECT_WIKI_MIGRATION_PLAN,
  readProjectWikiReleaseCandidate,
  registerProjectWikiReleaseCandidate,
  verifyProjectWikiPackageArchive,
  type ProjectWikiApprovalEvidence,
  type ProjectWikiCandidateRecord,
} from "./projectWikiReleaseCandidate";

const archive = readFileSync(fileURLToPath(new URL("./__fixtures__/project-wiki-pages-candidate.tar.gz", import.meta.url)));
const identity = { tenantId: "5dfd9884-8a9c-4af7-9996-48a3f45e976f", projectId: "025fecc2-b251-48c7-a261-2e5f440ace70", appId: PROJECT_WIKI_CANDIDATE.appId } as const;
const envelope = {
  schemaVersion: "project-wiki-staging-envelope/v1", environment: "staging", provider: "cloudflare", identity,
  candidate: PROJECT_WIKI_CANDIDATE,
  target: { targetId: "wiki-staging", containerApplicationRef: "smartspec-web-staging", hostRevision: "a".repeat(40), hostImage: `registry.example/smartspec-web@sha256:${"b".repeat(64)}` },
  database: { provider: "postgresql", databaseId: "wiki-staging-db", databaseIdentity: "wiki-staging", credentialRef: "secret-ref:wiki-staging", migrationPlan: PROJECT_WIKI_MIGRATION_PLAN, recoveryStrategyId: "recovery-1", recoveryEvidenceRef: "backup-evidence-1" },
  verifiers: { v5VerifierId: "v5", v6VerifierId: "v6" }, runner: { runnerId: "runner-existing", workspaceId: "workspace-existing" },
  execution: { maxBudgetMinorUnits: 1000, maxDurationSeconds: 600, currency: "USD", expiresAt: "2030-01-01T00:00:00.000Z", cleanupAction: "remove staging deployment", revocationRef: "approval-revoke" },
};

function approved(payload: unknown = envelope, overrides: Partial<ProjectWikiApprovalEvidence> = {}): ProjectWikiApprovalEvidence {
  return { id: "f9aa62ee-b0fc-4311-8371-68bc4215fa81", requestType: "deployment", status: "approved", tenantId: identity.tenantId, projectId: identity.projectId,
    payload, currentApprovals: 2, requiredApprovers: 2, expiresAt: "2030-01-01T00:05:00.000Z", revokedAt: null, ...overrides };
}

function memoryDeps() {
  const objects = new Map<string, Uint8Array>();
  let record: ProjectWikiCandidateRecord | null = null;
  return {
    objects,
    repository: {
      isActiveBinding: async (value: typeof identity) => value.tenantId === identity.tenantId && value.projectId === identity.projectId,
      getByIdentity: async () => record,
      insert: async (candidate: ProjectWikiCandidateRecord) => { record = candidate; return candidate; },
    },
    storage: {
      putIfAbsent: async (key: string, bytes: Uint8Array) => { const created = !objects.has(key); if (created) objects.set(key, Buffer.from(bytes)); return { key, created }; },
      readBuffer: async (key: string) => objects.get(key) ?? null,
    },
    resolveApproval: async (ref: string) => ref === "f9aa62ee-b0fc-4311-8371-68bc4215fa81" ? approved() : null,
    createId: () => "cd7a74f0-fc03-4b77-9473-64cbfd2c5995",
  };
}

describe("Project Wiki release candidate intake", () => {
  it("verifies the exact archive bytes, four-file inventory and SPAAS digest", () => {
    expect(verifyProjectWikiPackageArchive(archive)).toEqual({
      archiveSha256: PROJECT_WIKI_CANDIDATE.archiveSha256,
      packageDigest: PROJECT_WIKI_CANDIDATE.packageDigest,
      inventory: ["README.md", "actions.json", "app.manifest.yaml", "ui.json"],
    });
    expect(() => verifyProjectWikiPackageArchive(Buffer.from("not an archive"))).toThrow("PACKAGE_ARCHIVE_DIGEST_MISMATCH");
  });

  it("stores immutable bytes, persists a needs_context candidate and supports idempotent readback", async () => {
    const deps = memoryDeps();
    const input = { identity, approvalRef: "f9aa62ee-b0fc-4311-8371-68bc4215fa81", archiveBytes: archive, actorUserId: 7 };
    const first = await registerProjectWikiReleaseCandidate(input, deps);
    const retry = await registerProjectWikiReleaseCandidate(input, deps);
    expect(first).toMatchObject({ created: true, storageCreated: true, candidate: { qualificationStatus: "CANDIDATE_NOT_RELEASED", validationStatus: "needs_context" } });
    expect(retry).toMatchObject({ created: false, storageCreated: false, candidate: { objectKey: first.candidate.objectKey } });
    expect(await readProjectWikiReleaseCandidate(identity, deps.repository, deps.storage)).toMatchObject({ storedBytesSha256: PROJECT_WIKI_CANDIDATE.archiveSha256 });
    expect(deps.objects.size).toBe(1);
  });

  it("rejects absent, expired, revoked, under-quorum and cross-scope approval", () => {
    expect(() => assertApprovedProjectWikiStagingEnvelope({ approval: null, identity, now: new Date("2026-01-01") })).toThrow("STAGING_APPROVAL_NOT_FOUND");
    expect(() => assertApprovedProjectWikiStagingEnvelope({ approval: approved(undefined, { expiresAt: "2025-01-01T00:00:00.000Z" }), identity, now: new Date("2026-01-01") })).toThrow("STAGING_APPROVAL_EXPIRED");
    expect(() => assertApprovedProjectWikiStagingEnvelope({ approval: approved(undefined, { revokedAt: "2025-01-01T00:00:00.000Z" }), identity, now: new Date("2026-01-01") })).toThrow("STAGING_APPROVAL_NOT_APPROVED");
    expect(() => assertApprovedProjectWikiStagingEnvelope({ approval: approved(undefined, { currentApprovals: 1 }), identity, now: new Date("2026-01-01") })).toThrow("STAGING_APPROVAL_NOT_APPROVED");
    expect(() => assertApprovedProjectWikiStagingEnvelope({ approval: approved(undefined, { projectId: "e81476fc-a169-470a-ad92-0f2a107bd4e4" }), identity, now: new Date("2026-01-01") })).toThrow("STAGING_APPROVAL_SCOPE_MISMATCH");
  });

  it("rejects staging-envelope and project-binding mismatches before persistence", async () => {
    const deps = memoryDeps();
    deps.resolveApproval = async () => approved({ ...envelope, environment: "production" });
    await expect(registerProjectWikiReleaseCandidate({ identity, approvalRef: "f9aa62ee-b0fc-4311-8371-68bc4215fa81", archiveBytes: archive, actorUserId: 7 }, deps)).rejects.toThrow("STAGING_APPROVAL_ENVELOPE_INVALID");
    await expect(registerProjectWikiReleaseCandidate({ identity: { ...identity, projectId: "e81476fc-a169-470a-ad92-0f2a107bd4e4" }, approvalRef: "f9aa62ee-b0fc-4311-8371-68bc4215fa81", archiveBytes: archive, actorUserId: 7 }, deps)).rejects.toThrow("PROJECT_WIKI_BINDING_NOT_ACTIVE");
    expect(deps.objects.size).toBe(0);
  });

  it("rejects storage readback tampering", async () => {
    const deps = memoryDeps();
    const result = await registerProjectWikiReleaseCandidate({ identity, approvalRef: "f9aa62ee-b0fc-4311-8371-68bc4215fa81", archiveBytes: archive, actorUserId: 7 }, deps);
    deps.objects.set(result.candidate.objectKey, Buffer.from("tampered"));
    await expect(readProjectWikiReleaseCandidate(identity, deps.repository, deps.storage)).rejects.toThrow("PACKAGE_ARCHIVE_DIGEST_MISMATCH");
  });
});
