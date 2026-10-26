import { describe, expect, it, vi } from "vitest";
import superjson from "superjson";
import { authenticateMigrationEngineeringDevice, prepareMigrationEngineeringWorkspace, CLOUDFLARE_MIGRATION_HANDOFF, createMigrationEngineeringRpc, startCloudflareMigrationEngineering } from "./cloudflareMigrationContinuation";
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


describe("migration continuation existing authenticated setup", () => {
  const workspace = { tenantId: input.tenantId, conversationId: 12, runnerId: "runner-authorized", workspaceId: "smartaihub" };
  it("binds only the exact trusted SHA and reconciles normal binding before Runner admission", async () => {
    let bound = false;
    const rpc = vi.fn(async (path: string) => {
      if (path.endsWith("getConversationWorkspace")) return bound ? { workspace, availability: { available: true } } : null;
      if (path.endsWith("availableWorkspaces")) return { workspaces: [{ ...workspace, gitHead: "a".repeat(40) }] };
      if (path.endsWith("bindConversationWorkspace")) { bound = true; return workspace; }
      return { ready: true };
    });
    expect(await prepareMigrationEngineeringWorkspace({ tenantId: input.tenantId, conversationId: 12,
      runnerId: workspace.runnerId, workspaceId: workspace.workspaceId, expectedRevision: "a".repeat(40) }, rpc)).toMatchObject({ workspace });
    expect(rpc.mock.calls.filter(([path]) => path.endsWith("bindConversationWorkspace"))).toHaveLength(1);
    expect(rpc.mock.calls.some(([path]) => path.endsWith("startWorkspaceRun"))).toBe(false);
  });
  it("rejects a stale advertised SHA before any binding mutation", async () => {
    const rpc = vi.fn(async path => path.endsWith("availableWorkspaces") ? { workspaces: [{ ...workspace, gitHead: "b".repeat(40) }] } : null);
    await expect(prepareMigrationEngineeringWorkspace({ tenantId: input.tenantId, conversationId: 12,
      runnerId: workspace.runnerId, workspaceId: workspace.workspaceId, expectedRevision: "a".repeat(40) }, rpc)).rejects.toThrow("REVISION_MISMATCH");
    expect(rpc.mock.calls.some(([path]) => path.endsWith("bindConversationWorkspace"))).toBe(false);
  });
  it("rejects foreign tenant before binding writes and does not invent missing binding", async () => {
    const rpc = vi.fn(async () => ({ workspace: { ...workspace, tenantId: "other" }, availability: { available: true } }));
    await expect(prepareMigrationEngineeringWorkspace({ tenantId: input.tenantId, conversationId: 12 }, rpc)).rejects.toThrow("SCOPE_MISMATCH");
    expect(rpc).toHaveBeenCalledTimes(1);
    await expect(prepareMigrationEngineeringWorkspace({ tenantId: input.tenantId, conversationId: 12 }, async () => null)).rejects.toThrow("AUTHENTICATED_WORKSPACE_BINDING_REQUIRED");
  });
  it("reports real Runner capacity failure without claiming execution or submitting a job", async () => {
    const rpc = vi.fn(async path => path.endsWith("getConversationWorkspace") ? { workspace, availability: { available: true } } : { ready: false, code: "RUNNER_OFFLINE" });
    await expect(prepareMigrationEngineeringWorkspace({ tenantId: input.tenantId, conversationId: 12 }, rpc)).rejects.toThrow("RUNNER_OFFLINE");
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("uses existing bounded device polling, no cookies or token logging, then returns in-memory bearer", async () => {
    let time = 0;
    const responses = [
      { device_code: "secret-device", user_code: "ABCD-EFGH", expires_in: 600, interval: 5 },
      { error: "authorization_pending" },
      { access_token: "secret-bearer", refresh_token: "secret-refresh", token_type: "Bearer", scope: "mcp:read development:run" },
    ];
    const request = vi.fn(async () => new Response(JSON.stringify(responses.shift()), { status: responses.length === 1 ? 400 : 200 }));
    const notify = vi.fn();
    expect(await authenticateMigrationEngineeringDevice("https://smartaihub.app", notify, {
      request, now: () => time, sleep: async ms => { time += ms; },
    })).toBe("secret-bearer");
    expect(JSON.parse(((request.mock.calls as unknown[][])[0][1] as { body: string }).body)).toEqual({ scopes: ["mcp:read", "development:run"] });
    expect(notify).toHaveBeenCalledWith({ verificationUrl: "https://smartaihub.app/auth/device?user_code=ABCD-EFGH", userCode: "ABCD-EFGH", expiresIn: 600 });
    expect(JSON.stringify(notify.mock.calls)).not.toContain("secret-");
    for (const call of request.mock.calls as unknown[][]) expect(call[1]).toMatchObject({ redirect: "error", headers: { "content-type": "application/json" } });
  });
  it("does not use a read-only device token when the server lacks engineering consent", async () => {
    let time = 0;
    const responses = [{ device_code: "secret-device", user_code: "CODE", expires_in: 600 },
      { access_token: "read-only", token_type: "Bearer", scope: "mcp:read" }];
    const request = vi.fn(async () => new Response(JSON.stringify(responses.shift()), { status: 200 }));
    await expect(authenticateMigrationEngineeringDevice("https://smartaihub.app", () => {}, {
      request, now: () => time, sleep: async ms => { time += ms; },
    })).rejects.toThrow("DEVELOPMENT_CONSENT_REQUIRED");
  });

  it("bounds expired device requests and redacts denied provider response bodies", async () => {
    let time = 0;
    const request = vi.fn(async () => new Response(JSON.stringify({ device_code: "secret", user_code: "CODE", expires_in: 5 }), { status: 200 }));
    await expect(authenticateMigrationEngineeringDevice("https://smartaihub.app", () => {}, { request,
      now: () => time, sleep: async ms => { time += ms; } })).rejects.toThrow("DEVICE_AUTH_EXPIRED");
    expect(request).toHaveBeenCalledTimes(1);
  });
});
