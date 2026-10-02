import { describe, expect, it, vi } from "vitest";

import {
  createWorkflowNodeTaskDispatcher,
  WorkflowNodeAdapterRegistry,
} from "../workflowNodeAdapterRegistry";

describe("manifest-bound workflow adapter registry", () => {
  it("resolves only the exact type, version, and compiler-pinned manifest digest", async () => {
    const registry = new WorkflowNodeAdapterRegistry();
    const execute = vi.fn(async () => ({ resultRef: "artifact:result" }));
    const adapter = {
      typeId: "data.transform",
      typeVersion: "1.0.0",
      manifestDigest: "a".repeat(64),
      preflight: vi.fn(async () => ({ status: "ready" as const })),
      execute,
    };
    registry.register(adapter);
    const node = {
      typeId: adapter.typeId,
      typeVersion: adapter.typeVersion,
      manifestDigest: adapter.manifestDigest,
    };

    expect(registry.resolve(node)).toBe(adapter);
    expect(registry.resolve({ ...node, typeVersion: "2.0.0" })).toBeUndefined();
    expect(
      registry.resolve({ ...node, manifestDigest: "b".repeat(64) })
    ).toBeUndefined();
    await expect(
      registry.preflight({ ...node } as any, {} as any)
    ).resolves.toEqual({ status: "ready" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("returns an explicit fail-closed reason when the exact adapter is missing", async () => {
    const result = await new WorkflowNodeAdapterRegistry().preflight(
      {
        typeId: "ai.model",
        typeVersion: "1.0.0",
        manifestDigest: "c".repeat(64),
      } as any,
      {} as any
    );
    expect(result).toEqual({
      status: "unavailable",
      reasonCode: "NODE_ADAPTER_EXACT_VERSION_UNAVAILABLE",
    });
  });

  it("checks the pinned node and active lease before returning durable output evidence", async () => {
    const registry = new WorkflowNodeAdapterRegistry();
    const execute = vi.fn(async () => ({
      resultRef: "artifact:result",
      output: { outputDigest: "d".repeat(64) },
    }));
    const preflight = vi.fn(async () => ({ status: "ready" as const }));
    registry.register({
      typeId: "data.transform",
      typeVersion: "1.0.0",
      manifestDigest: "a".repeat(64),
      preflight,
      execute,
    });
    const assertActive = vi.fn(async () => undefined);
    const dispatch = createWorkflowNodeTaskDispatcher(registry, async () => ({
      node: {
        nodeId: "transform",
        typeId: "data.transform",
        typeVersion: "1.0.0",
        manifestDigest: "a".repeat(64),
      } as any,
      inputArtifactRefs: ["artifact:input"],
    }));
    const input = {
      payload: {
        nodeId: "transform",
        typeId: "data.transform",
        typeVersion: "1.0.0",
        manifestDigest: "a".repeat(64),
      },
      context: { tenantId: "trusted-tenant", requestedByUserId: 73 },
      lease: { jobId: "job-1" },
      reporter: { assertActive },
    } as any;

    await expect(dispatch(input)).resolves.toMatchObject({
      resultRef: "artifact:result",
    });
    expect(assertActive).toHaveBeenCalledTimes(2);
    expect(preflight).toHaveBeenCalledWith(expect.objectContaining({
      executionPrincipal: { tenantId: "trusted-tenant", actorUserId: 73 },
    }));
    expect(execute).toHaveBeenCalledOnce();
  });
});
