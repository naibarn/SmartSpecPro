import { describe, expect, it, vi } from "vitest";
import superjson from "superjson";
import { CLOUDFLARE_MIGRATION_HANDOFF, createMigrationEngineeringRpc, startCloudflareMigrationEngineering } from "./cloudflareMigrationContinuation";
import { migrationMissionId } from "./cloudflareMigrationLifecycle";

const input = { tenantId: "tenant-ZCSKEM9s", projectId: "44fb79ed-8d65-41b0-b04e-97f4b139430b",
  conversationId: 12, checkpoint: "M3_NATIVE_RUNTIME" as const, budgetCapMinorUnits: 100 };
function ports() {
  const mission = { campaignId: migrationMissionId(input), migrationMode: "FIRST_MIGRATION", handoffRef: CLOUDFLARE_MIGRATION_HANDOFF };
  const rpc = vi.fn(async (path: string) => {
    if (path === "infrastructure.getCloudflareMigrationMission") return mission;
    if (path === "spec226DevelopmentControl.startWorkspaceRun") return { runId: "run-existing", jobId: "canonical-job", dispatchStatus: "ENQUEUED" };
    return { runId: "run-existing", workerJobId: "canonical-job", state: "IMPLEMENT" };
  });
  return { mission, rpc };
}
describe("FIRST_MIGRATION engineering uses existing authenticated canonical admission", () => {
  it("submits a real workspace start and reconciles exact canonical job without claiming Runner execution", async () => {
    const { rpc } = ports();
    expect(await startCloudflareMigrationEngineering(input, rpc)).toMatchObject({ jobId: "canonical-job", canonicalState: "IMPLEMENT", executionVerified: false });
    expect(rpc.mock.calls[1][0]).toBe("spec226DevelopmentControl.startWorkspaceRun");
    const submitted = (rpc.mock.calls as unknown[][])[1][1] as { prompt: string; factoryMode?: boolean };
    expect(submitted.prompt).toContain(CLOUDFLARE_MIGRATION_HANDOFF);
    expect(submitted.prompt).toContain("independently valid scoped authority");
    expect(submitted.factoryMode).toBeUndefined();
  });
  it("uses stable idempotency for uncertain admission and budget changes, isolating checkpoints", async () => {
    const { rpc } = ports();
    const first = await startCloudflareMigrationEngineering(input, rpc);
    expect((await startCloudflareMigrationEngineering({ ...input, budgetCapMinorUnits: 200 }, rpc)).idempotencyKey).toBe(first.idempotencyKey);
    expect((await startCloudflareMigrationEngineering({ ...input, checkpoint: "M1_DATABASE_REPAIR" }, rpc)).idempotencyKey).not.toBe(first.idempotencyKey);
  });
  it.each(["campaignId", "migrationMode", "handoffRef"])("denies foreign or missing existing %s before admission", async field => {
    const { rpc, mission } = ports();
    Object.assign(mission, { [field]: "other" });
    await expect(startCloudflareMigrationEngineering(input, rpc)).rejects.toThrow("MIGRATION_EXISTING_FIRST_MIGRATION_REQUIRED");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("preserves admission rejection and never retries another identity", async () => {
    const { rpc } = ports();
    rpc.mockImplementationOnce(async () => ({ campaignId: migrationMissionId(input), migrationMode: "FIRST_MIGRATION", handoffRef: CLOUDFLARE_MIGRATION_HANDOFF }));
    rpc.mockImplementationOnce(async () => { throw new Error("RUNNER_POLICY_DENIED"); });
    await expect(startCloudflareMigrationEngineering(input, rpc)).rejects.toThrow("RUNNER_POLICY_DENIED");
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("rejects ambiguous or mismatched canonical readback", async () => {
    const { rpc } = ports();
    rpc.mockImplementation(async path => path.includes("getCloudflare")
      ? { campaignId: migrationMissionId(input), migrationMode: "FIRST_MIGRATION", handoffRef: CLOUDFLARE_MIGRATION_HANDOFF }
      : path.includes("startWorkspace") ? { runId: "run-existing", jobId: "canonical-job" } : { runId: "run-existing", workerJobId: "different" });
    await expect(startCloudflareMigrationEngineering(input, rpc)).rejects.toThrow("MIGRATION_ENGINEERING_ADMISSION_UNKNOWN");
  });
  it("rejects missing authentication without network or database writes", () => {
    const request = vi.fn();
    expect(() => createMigrationEngineeringRpc("https://smartaihub.app", undefined, request)).toThrow("AUTHENTICATION_REQUIRED");
    expect(request).not.toHaveBeenCalled();
  });
  it("uses ordinary Bearer + SuperJSON, forbids redirect credential forwarding", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ result: { data: superjson.serialize({ ready: true }) } }), { status: 200 }));
    const rpc = createMigrationEngineeringRpc("https://smartaihub.app", "user-token", request);
    expect(await rpc("spec226DevelopmentControl.startWorkspaceRun", { conversationId: 12 }, true)).toEqual({ ready: true });
    expect(request.mock.calls[0][0].toString()).toBe("https://smartaihub.app/trpc/spec226DevelopmentControl.startWorkspaceRun");
    expect((request.mock.calls as unknown[][])[0][1]).toMatchObject({ redirect: "error", headers: { authorization: "Bearer user-token" }, method: "POST" });
    expect(() => createMigrationEngineeringRpc("http://smartaihub.app", "user-token")).toThrow("HTTPS_ENDPOINT_REQUIRED");
  });
  it("does not expose server bodies or credentials on rejected authentication", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ error: { json: { message: "secret", data: { code: "UNAUTHORIZED" } } } }), { status: 401 }));
    await expect(createMigrationEngineeringRpc("https://smartaihub.app", "user-token", request)("spec226DevelopmentControl.get", {})).rejects.toThrow("MIGRATION_ENGINEERING_RPC_HTTP_401:UNAUTHORIZED");
  });
});
