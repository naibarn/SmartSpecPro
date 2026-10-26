import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
const state = vi.hoisted(() => ({ job: null as any, intent: null as any, checkpoint: null as any, preflight: null as any, recover: vi.fn(), owner: vi.fn() }));
vi.mock("./cloudflareHttpRuntimeAdmission", () => ({ readHttpRuntimeIntent: async () => ({ updatedBy: 17, valueJson: state.intent }) }));
vi.mock("./cloudflareHttpCandidatePreparation", () => ({ assertHttpCandidateOwner: async () => state.owner() }));
vi.mock("./cloudflareHttpRuntimePlan", () => ({ getHttpRuntimePlan: async () => state.preflight }));
vi.mock("./jobControlPlane", () => ({ createJobControlPlane: () => ({ recoverReviewGatedJob: state.recover }) }));
vi.mock("./crypto", () => ({ decrypt: () => JSON.stringify(state.checkpoint) }));
import { recoverHttpRuntimePrewrite } from "./cloudflareHttpRuntimeRecovery";
import { HTTP_RUNTIME_JOB, HTTP_RUNTIME_CONTRACT } from "./cloudflareHttpRuntimeContract";
beforeEach(() => {
  state.owner.mockReset(); state.recover.mockReset().mockResolvedValue(true);
  const id = "11111111-1111-4111-8111-111111111111", plan = { candidateJobId: "22222222-2222-4222-8222-222222222222", artifactRef: `sha256:${"a".repeat(64)}` },
    planDigest = createHash("sha256").update(JSON.stringify(plan)).digest("hex");
  state.job = { id, jobType: HTTP_RUNTIME_JOB, contractVersion: HTTP_RUNTIME_CONTRACT, requestedByUserId: 17, tenantId: "tenant-fixture",
    status: "failed", attempt: 1, maxAttempts: 1, fencingVersion: 1, leaseOwnerToken: null, leaseExpiresAt: null,
    errorCode: "HTTP_RUNTIME_PROVIDER_HTTP_200", createdAt: new Date(), inputJson: { projectId: "project-fixture", planDigest, candidateJobId: plan.candidateJobId } };
  state.intent = { tenantId: "tenant-fixture", projectId: "project-fixture", actorUserId: 17, submissionId: id, planDigest, plan,
    revokedAt: null, expiresAt: new Date(Date.now()+2700000).toISOString(), authority: "existing-candidate-bounded-runtime-test-v1",
    trafficMutation: false, dnsMutation: false, applicationCreation: false, imagePublication: false, fixtureCreation: false };
  state.checkpoint = { jobId: id, tenantId: "tenant-fixture", projectId: "project-fixture", actorUserId: 17, planDigest,
    stage: "PREPARING", rolePrepared: false, providerWriteIntent: false };
  state.preflight = { ready: true, planDigest };
});
const db = () => { let reads=0; return { select: () => ({ from: () => ({ where: () => ({ limit: async () => ++reads===1 ? [state.job]
  : [{ isSensitive: true, updatedBy: 17, value: "encrypted" }] }) }) }) } as any; };
describe("original Owner-intent technical prewrite recovery", () => {
  it("uses one canonical same-job recovery without minting an intent, extending expiry or changing paid budgets", async () => {
    expect(await recoverHttpRuntimePrewrite(db(), state.job.id)).toMatchObject({ accepted: true, newIntentIssued: false, paidStartsAdded: 0 });
    expect(state.recover).toHaveBeenCalledWith(state.job.id, `native-runtime-prewrite:${state.job.id}`, expect.any(String),
      expect.objectContaining({ replacementGrantRef: state.job.id, replacementGrantExpiresAt: state.intent.expiresAt, disposition: "pre_submission_failure" }),
      undefined, { tenantId: "tenant-fixture", requestedByUserId: 17, authorizationScope: "infrastructure.cloudflare_native_runtime_technical_recovery" });
  });
  it.each(["expired", "revoked", "changed-plan", "foreign-owner", "role", "write", "unknown-error", "attempt-budget", "lease"])("rejects %s before canonical recovery", async mode => {
    if (mode==="expired") state.intent.expiresAt=new Date(Date.now()-1).toISOString();
    if (mode==="revoked") state.intent.revokedAt=new Date().toISOString();
    if (mode==="changed-plan") state.preflight.planDigest="f".repeat(64);
    if (mode==="foreign-owner") state.checkpoint.actorUserId=18;
    if (mode==="role") state.checkpoint.rolePrepared=true;
    if (mode==="write") state.checkpoint.providerWriteIntent=true;
    if (mode==="unknown-error") state.job.errorCode="HTTP_RUNTIME_PROVIDER_WRITE_UNKNOWN";
    if (mode==="attempt-budget") state.job.attempt=2;
    if (mode==="lease") state.job.leaseOwnerToken="another-worker";
    await expect(recoverHttpRuntimePrewrite(db(),state.job.id)).rejects.toThrow(/DENIED|CHANGED/); expect(state.recover).not.toHaveBeenCalled();
  });
});
