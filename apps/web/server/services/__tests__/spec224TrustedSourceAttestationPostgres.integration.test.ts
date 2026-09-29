import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { compileRequirementClosureGraph } from "../spec224RequirementClosureContracts";
import {
  deriveSpec224RequirementId,
  normalizeSpec224Markdown,
} from "../spec224SpecBaseline";
import { makeReadyClosureFixture } from "./spec224ClosureReadyFixture";

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "true";
const describeDb = enabled ? describe : describe.skip;
const connectionString =
  process.env.DATABASE_URL ?? "postgresql://localhost/spec224_skipped_test";
const bundlePath = process.env.SPEC224_LOCAL_ATTESTATION_BUNDLE_PATH;
const tenantIds: string[] = [];
const userIds: number[] = [];
const jobIds: string[] = [];
let sql: ReturnType<typeof postgres>;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonicalize(child)])
    );
  }
  return value;
}

function digest(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

describeDb("Spec 224 trusted source attestation PostgreSQL", () => {
  beforeAll(async () => {
    if (!bundlePath)
      throw new Error("SPEC224_LOCAL_ATTESTATION_BUNDLE_PATH_REQUIRED");
    sql = postgres(connectionString, { max: 3, connect_timeout: 5 });
    process.env.SPEC224_NONPROD_BUNDLE_ROOT =
      process.env.SPEC224_NONPROD_BUNDLE_ROOT ?? ".";
  });

  afterAll(async () => {
    if (sql) {
      for (const jobId of jobIds) {
        await sql`DELETE FROM worker_job_events WHERE "workerJobId" = ${jobId}`;
        await sql`DELETE FROM worker_job_outbox WHERE "workerJobId" = ${jobId}`;
        await sql`DELETE FROM worker_job_attempts WHERE "workerJobId" = ${jobId}`;
        await sql`DELETE FROM worker_jobs WHERE id = ${jobId}`;
      }
      for (const tenantId of tenantIds) {
        await sql`DELETE FROM tenants WHERE id = ${tenantId}`;
      }
      for (const userId of userIds) {
        await sql`DELETE FROM users WHERE id = ${userId}`;
      }
      await sql.end({ timeout: 5 });
    }
  });

  it("verifies the sealed bundle and persists a stable, idempotent canonical job event", async () => {
    const tenantId = randomUUID();
    const runId = randomUUID();
    const jobId = randomUUID();
    tenantIds.push(tenantId);
    jobIds.push(jobId);
    const [user] = await sql`
      INSERT INTO users ("openId", role, plan, credits, "isDisabled")
      VALUES (${`spec224-attest-${tenantId}`}, 'user', 'free', 0, false)
      RETURNING id
    `;
    userIds.push(Number(user.id));
    await sql`
      INSERT INTO tenants (id, slug, name, "isActive", status, plan, created_at, "createdAt", "updatedAt")
      VALUES (${tenantId}, ${`${tenantId}-slug`}, 'Spec 224 attestation test', true, 'ACTIVE', 'FREE', NOW(), NOW(), NOW())
    `;

    const specMarkdown = await readFile(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        "../../../../../specs/feature/224-Autonomous Development Orchestrator Runtime/spec.md"
      ),
      "utf8"
    );
    const specArtifactDigest = createHash("sha256")
      .update(specMarkdown)
      .digest("hex");
    const specSourceDigest = createHash("sha256")
      .update(normalizeSpec224Markdown(specMarkdown))
      .digest("hex");
    const baselineId = `baseline:${createHash("sha256")
      .update(["224", "20", specArtifactDigest, specSourceDigest].join("\n"))
      .digest("hex")
      .slice(0, 40)}`;
    const specDigest = specArtifactDigest;
    const reqId = deriveSpec224RequirementId({
      specId: "224",
      revision: "20",
      sourceArtifactDigest: specDigest,
      sourceDigest: specSourceDigest,
      line: 1,
      text: "Attest only persisted package identity",
    });
    const baseGraph = compileRequirementClosureGraph({
      baseline: {
        specId: "224",
        revision: "20",
        sourceArtifactDigest: specDigest,
        digest: specSourceDigest,
        baselineId,
        authorityRef: "authority:spec224-test",
        scopeEnvelopeRef: "scope:224-r20",
      },
      requirements: [
        {
          id: reqId,
          sourceRef: "spec:224@20#L1",
          text: "Attest only persisted package identity",
        },
      ],
      planSections: [{ id: "section:attestation", requirementIds: [reqId] }],
      workPackages: [
        {
          id: "WP-ATTEST-01",
          planSectionId: "section:attestation",
          requirementIds: [reqId],
          dependsOn: [],
        },
      ],
    });
    const wrongSpecArtifactDigest = "c".repeat(64);
    const wrongSpecSourceDigest = "a".repeat(64);
    const wrongRequirementId = deriveSpec224RequirementId({
      specId: "224",
      revision: "19",
      sourceArtifactDigest: wrongSpecArtifactDigest,
      sourceDigest: wrongSpecSourceDigest,
      line: 1,
      text: "Attest only persisted package identity",
    });
    const wrongBaseGraph = compileRequirementClosureGraph({
      baseline: {
        specId: "224",
        revision: "19",
        sourceArtifactDigest: wrongSpecArtifactDigest,
        digest: wrongSpecSourceDigest,
        baselineId: "baseline:wrong-source",
        authorityRef: "authority:spec224-test",
        scopeEnvelopeRef: "scope:224-r19",
      },
      requirements: [
        {
          id: wrongRequirementId,
          sourceRef: "spec:224@19#L1",
          text: "Attest only persisted package identity",
        },
      ],
      planSections: [
        { id: "section:attestation", requirementIds: [wrongRequirementId] },
      ],
      workPackages: [
        {
          id: "WP-ATTEST-01",
          planSectionId: "section:attestation",
          requirementIds: [wrongRequirementId],
          dependsOn: [],
        },
      ],
    });
    const { graph } = makeReadyClosureFixture(baseGraph, {
      baseRevision: "git:attestation-test-base",
      prefix: tenantId,
      repositoryRef: "repo:spec224-attestation-test",
    });
    const metadata = {
      spec224RequirementClosure: {
        projectionVersion: 1,
        graph,
        graphDigest: digest(graph),
      },
    };

    const { graph: wrongBaselineGraph } = makeReadyClosureFixture(
      wrongBaseGraph,
      {
        baseRevision: "git:attestation-test-base",
        prefix: `${tenantId}-wrong`,
        repositoryRef: "repo:spec224-attestation-test",
      }
    );
    const wrongMetadata = {
      spec224RequirementClosure: {
        projectionVersion: 1,
        graph: wrongBaselineGraph,
        graphDigest: digest(wrongBaselineGraph),
      },
    };

    const [created] = await sql`
      INSERT INTO worker_jobs (
        id, "tenantId", "runtimeType", "requestedByUserId", "jobType", status,
        "executionClass", "contractVersion", "inputJson", "progressJson", attempt,
        "maxAttempts", "fencingVersion", "createdAt"
      ) VALUES (
        ${jobId}, ${tenantId}, 'node_job_worker', ${Number(user.id)}, 'external_agent_task', 'queued',
        'external', 'feature-186-v1', ${sql.json({ spec224Run: { runId } })}, ${sql.json({})}, 1,
        1, 0, NOW()
      ) RETURNING id
    `;
    expect(created.id).toBe(jobId);

    await sql`
      INSERT INTO worker_job_attempts ("workerJobId", attempt, "leaseGeneration", "createdAt")
      VALUES (${jobId}, 1, 1, NOW())
    `;
    const [attempt] =
      await sql`SELECT id FROM worker_job_attempts WHERE "workerJobId" = ${jobId} AND attempt = 1`;
    const runProjection = {
      contractVersion: "spec-224-v1",
      runId,
      tenantId,
      actorId: Number(user.id),
      goal: "attestation integration",
      repositoryRef: "repo:spec224-attestation-test",
      baseRevision: "git:attestation-test-base",
      contextPackHash: "b".repeat(64),
      workspaceId: `workspace:${runId}`,
      state: "DISCOVERY",
      phaseAttempt: 0,
      maxPhaseAttempts: 3,
      workerJobId: jobId,
      resumeState: null,
      decisionEpoch: 0,
      fencingVersion: 2,
      evidenceRefs: [],
      eventSequence: 0,
      eventIdempotencyKeys: [],
      events: [],
      metadata: wrongMetadata,
      projectionVersion: 4,
    };
    await sql`UPDATE worker_jobs SET "progressJson" = ${sql.json({ spec224: runProjection })}, "fencingVersion" = 9 WHERE id = ${jobId}`;

    const attestationInput = {
      workerJobId: jobId,
      tenantId,
      runId,
      workPackageId: "WP-ATTEST-01",
      expectedAttempt: 1,
      expectedProjectionRevision: 4,
      expectedDevelopmentRunFencingVersion: 2,
      expectedWorkerJobFencingVersion: 9,
      bundlePath,
    };
    const { issueLocalSpec224SourceAttestation } =
      await import("../spec224TrustedSourceAttestation");
    await expect(
      issueLocalSpec224SourceAttestation(attestationInput)
    ).rejects.toThrow("PERSISTED_REQUIREMENT_BASELINE_MISMATCH");
    await sql`UPDATE worker_jobs SET "progressJson" = ${sql.json({
      spec224: { ...runProjection, metadata },
    })} WHERE id = ${jobId}`;
    const first = await issueLocalSpec224SourceAttestation(attestationInput);
    const [second, third] = await Promise.all([
      issueLocalSpec224SourceAttestation(attestationInput),
      issueLocalSpec224SourceAttestation(attestationInput),
    ]);
    expect(first).toEqual(second);
    expect(first).toEqual(third);
    expect(first).toMatchObject({
      tenantId,
      runId,
      workerJobId: jobId,
      workPackageId: "WP-ATTEST-01",
      attemptId: attempt.id,
      trustClass: "LOCAL_NONPRODUCTION_INTEGRITY_ONLY",
      status: "ACTIVE",
    });
    const events = await sql`
      SELECT "eventType", "eventIdempotencyKey", "payloadJson"
      FROM worker_job_events
      WHERE "workerJobId" = ${jobId} AND "eventType" = 'SPEC224_SOURCE_ATTESTED'
    `;
    expect(events).toHaveLength(1);
    expect(events[0]!.payloadJson.attestation.attestationId).toBe(
      first.attestationId
    );
    expect(events[0]!.eventIdempotencyKey).toBe(
      `spec224:source-attestation:${first.attestationId}`
    );
    const { loadPersistedSpec224SourceAttestation } =
      await import("../spec224TrustedSourceAttestation");
    const loadInput = {
      attestationId: first.attestationId,
      bundlePath,
      tenantId,
      runId,
      workerJobId: jobId,
      workPackageId: "WP-ATTEST-01",
      attemptId: String(attempt.id),
      attempt: 1,
      projectionRevision: 4,
      decisionEpoch: 0,
      developmentRunFencingVersion: 2,
      workerJobFencingVersion: 9,
      sourceCommit: first.sourceCommit,
      sourceTree: first.sourceTree,
      profileDigest: first.profileDigest,
      bundleDigest: first.bundleDigest,
    };
    const loaded = await loadPersistedSpec224SourceAttestation(loadInput);
    expect(loaded).toEqual(first);
    await expect(
      loadPersistedSpec224SourceAttestation({
        ...loadInput,
        tenantId: randomUUID(),
      })
    ).rejects.toThrow("CANONICAL_JOB_NOT_ADMISSIBLE");
    await expect(
      loadPersistedSpec224SourceAttestation({
        ...loadInput,
        attestationId: "f".repeat(64),
      })
    ).rejects.toThrow("PERSISTED_ATTESTATION_NOT_FOUND");
    await sql`UPDATE worker_jobs SET "fencingVersion" = 10 WHERE id = ${jobId}`;
    await expect(
      loadPersistedSpec224SourceAttestation(loadInput)
    ).rejects.toThrow("CANONICAL_RUN_BINDING_STALE");
    const changedClosureMetadata = {
      spec224RequirementClosure: {
        ...metadata.spec224RequirementClosure,
        graphDigest: "f".repeat(64),
      },
    };
    await sql`UPDATE worker_jobs SET "fencingVersion" = 9, "progressJson" = ${sql.json(
      {
        spec224: { ...runProjection, metadata: changedClosureMetadata },
      }
    )} WHERE id = ${jobId}`;
    await expect(
      loadPersistedSpec224SourceAttestation(loadInput)
    ).rejects.toThrow("PERSISTED_REQUIREMENT_CLOSURE_INVALID");
    await sql`UPDATE worker_jobs SET "progressJson" = ${sql.json({
      spec224: {
        ...runProjection,
        actorId: Number(user.id) + 1,
        metadata,
      },
    })} WHERE id = ${jobId}`;
    await expect(
      loadPersistedSpec224SourceAttestation(loadInput)
    ).rejects.toThrow("CANONICAL_RUN_BINDING_STALE");
  }, 360_000);
});
