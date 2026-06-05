import { afterEach, describe, expect, it } from "vitest";

import {
  buildCompletedHyperframesStagePayload,
  isHyperframesRuntimeExecutionReady,
  isHyperframesWorkerEnabled,
  runHyperframesRenderWorkerOnce,
} from "../../workers/hyperframesRenderWorker";

describe("hyperframesWorkerPolicy", () => {
  const previous = process.env.MARKETPLACE_HYPERFRAMES_RENDER_WORKER_ENABLED;
  const previousRuntimeReady = process.env.MARKETPLACE_HYPERFRAMES_RUNTIME_READY;
  const previousEnabled = process.env.MARKETPLACE_HYPERFRAMES_ENABLED;
  const previousDisabled = process.env.MARKETPLACE_HYPERFRAMES_DISABLED;

  afterEach(() => {
    if (previous == null) {
      delete process.env.MARKETPLACE_HYPERFRAMES_RENDER_WORKER_ENABLED;
    } else {
      process.env.MARKETPLACE_HYPERFRAMES_RENDER_WORKER_ENABLED = previous;
    }
    if (previousRuntimeReady == null) {
      delete process.env.MARKETPLACE_HYPERFRAMES_RUNTIME_READY;
    } else {
      process.env.MARKETPLACE_HYPERFRAMES_RUNTIME_READY = previousRuntimeReady;
    }
    if (previousEnabled == null) {
      delete process.env.MARKETPLACE_HYPERFRAMES_ENABLED;
    } else {
      process.env.MARKETPLACE_HYPERFRAMES_ENABLED = previousEnabled;
    }
    if (previousDisabled == null) {
      delete process.env.MARKETPLACE_HYPERFRAMES_DISABLED;
    } else {
      process.env.MARKETPLACE_HYPERFRAMES_DISABLED = previousDisabled;
    }
  });

  it("defaults the global worker gate open so tenant flags can control rollout", () => {
    delete process.env.MARKETPLACE_HYPERFRAMES_RENDER_WORKER_ENABLED;
    expect(isHyperframesWorkerEnabled()).toBe(true);
  });

  it("allows explicit env false values to kill worker execution globally", () => {
    process.env.MARKETPLACE_HYPERFRAMES_RENDER_WORKER_ENABLED = "false";
    expect(isHyperframesWorkerEnabled()).toBe(false);
  });

  it("respects the global HyperFrames kill switches before tenant rollout", () => {
    process.env.MARKETPLACE_HYPERFRAMES_DISABLED = "true";
    process.env.MARKETPLACE_HYPERFRAMES_RENDER_WORKER_ENABLED = "true";
    expect(isHyperframesWorkerEnabled()).toBe(false);

    process.env.MARKETPLACE_HYPERFRAMES_DISABLED = "false";
    process.env.MARKETPLACE_HYPERFRAMES_ENABLED = "false";
    expect(isHyperframesWorkerEnabled()).toBe(false);
  });

  it("keeps explicit on values compatible with existing deployments", () => {
    process.env.MARKETPLACE_HYPERFRAMES_RENDER_WORKER_ENABLED = "true";
    expect(isHyperframesWorkerEnabled()).toBe(true);
  });

  it("keeps runtime execution gated separately from worker enablement", () => {
    process.env.MARKETPLACE_HYPERFRAMES_RUNTIME_READY = "false";
    expect(isHyperframesRuntimeExecutionReady()).toBe(false);

    process.env.MARKETPLACE_HYPERFRAMES_RUNTIME_READY = "yes";
    expect(isHyperframesRuntimeExecutionReady()).toBe(true);
  });

  it("defers jobs when worker is enabled but runtime execution is not ready", async () => {
    process.env.MARKETPLACE_HYPERFRAMES_RENDER_WORKER_ENABLED = "true";
    process.env.MARKETPLACE_HYPERFRAMES_RUNTIME_READY = "false";

    await expect(runHyperframesRenderWorkerOnce()).resolves.toEqual({
      processed: 0,
      disabled: false,
      runtimeDeferred: true,
    });
  });

  it("builds job-type specific completion payloads before render execution", () => {
    expect(
      buildCompletedHyperframesStagePayload({
        jobType: "hyperframes_lint",
        payload: { productId: "product_1" },
      })
    ).toMatchObject({
      productId: "product_1",
      lintStatus: "passed",
      lintDiagnostics: [],
    });

    expect(
      buildCompletedHyperframesStagePayload({
        jobType: "hyperframes_snapshot",
        payload: { productId: "product_1" },
      })
    ).toMatchObject({
      snapshotStatus: "passed",
      snapshotManifest: {
        renderer: "local_smoke_snapshot",
        frameCount: 1,
        redacted: true,
      },
    });

    expect(
      buildCompletedHyperframesStagePayload({
        jobType: "hyperframes_render",
        payload: { productId: "product_1" },
      })
    ).toBeNull();
  });
});
