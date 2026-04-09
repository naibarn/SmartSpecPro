import { describe, expect, it } from "vitest";

import {
  assertWorkflowWorkerRuntimeNodesAllowed,
  filterWorkflowWorkerRuntimeRegistryForFlags,
} from "./workflowWorkerRuntimeFlags";

const disabledFlags = {
  openClawExternalRuntime: false,
  desktopZeroClawWorker: false,
  nemoClawSecureWorkerPool: false,
  hiClawClusterRuntime: false,
} as const;

describe("workflowWorkerRuntimeFlags", () => {
  it("rejects workflow graphs with worker-runtime nodes when all runtime families are disabled", () => {
    expect(() =>
      assertWorkflowWorkerRuntimeNodesAllowed(
        disabledFlags,
        [{ type: "workflow", data: { nodeType: "dispatch_worker_job" } }],
      ),
    ).toThrowError(/worker-runtime nodes are disabled/i);
  });

  it("allows workflow graphs with worker-runtime nodes when any runtime family is enabled", () => {
    expect(() =>
      assertWorkflowWorkerRuntimeNodesAllowed(
        {
          ...disabledFlags,
          desktopZeroClawWorker: true,
        },
        [{ type: "workflow", data: { nodeType: "dispatch_worker_job" } }],
      ),
    ).not.toThrow();
  });

  it("filters worker-runtime node specs when no runtime family is enabled", () => {
    const nodeTypes = [
      { type: "llm_call" },
      { type: "dispatch_worker_job" },
      { type: "wait_for_worker_completion" },
    ];

    expect(
      filterWorkflowWorkerRuntimeRegistryForFlags(nodeTypes, disabledFlags),
    ).toEqual([{ type: "llm_call" }]);
    expect(
      filterWorkflowWorkerRuntimeRegistryForFlags(nodeTypes, {
        ...disabledFlags,
        openClawExternalRuntime: true,
      }),
    ).toEqual(nodeTypes);
  });
});
