import { describe, expect, it, vi } from "vitest";
import {
  buildMiniAppFactoryRunAnchorDefinition,
  executeMiniAppFactoryRunAnchor,
} from "./miniAppFactoryRunAnchor";

describe("Mini-App Factory DevelopmentRun anchor", () => {
  it("creates a bounded short job with the run identity needed by the durable projection", () => {
    const definition = buildMiniAppFactoryRunAnchorDefinition({
      runId: "run-miniapp-1",
    });
    expect(definition).toMatchObject({
      jobType: "mini_app_factory.run_anchor",
      executionClass: "short",
      input: { runId: "run-miniapp-1", spec224Run: { runId: "run-miniapp-1" } },
      retryPolicy: { maxAttempts: 1, allowedErrorClasses: [] },
    });
  });

  it("acknowledges the durable anchor without invoking a Runner or Gateway", async () => {
    const assertActive = vi.fn();
    const result = await executeMiniAppFactoryRunAnchor({
      context: {
        input: {
          contractVersion: "mini-app-factory-run-anchor-v1",
          runId: "run-miniapp-1",
          spec224Run: { runId: "run-miniapp-1" },
        },
      } as never,
      lease: {
        jobId: "job-anchor",
        attemptId: "attempt-1",
        leaseToken: "unused",
        fencingVersion: 0,
        expiresAt: new Date().toISOString(),
      },
      reporter: { assertActive } as never,
      controlPlane: {} as never,
    });
    expect(assertActive).toHaveBeenCalledOnce();
    expect(result).toEqual({
      output: { runId: "run-miniapp-1", state: "PERSISTED" },
    });
  });

  it("rejects an anchor whose run projection does not match its input", async () => {
    await expect(
      executeMiniAppFactoryRunAnchor({
        context: {
          input: {
            contractVersion: "mini-app-factory-run-anchor-v1",
            runId: "run-one",
            spec224Run: { runId: "run-two" },
          },
        } as never,
        lease: {
          jobId: "job-anchor",
          attemptId: "attempt-1",
          leaseToken: "unused",
          fencingVersion: 0,
          expiresAt: new Date().toISOString(),
        },
        reporter: { assertActive: vi.fn() } as never,
        controlPlane: {} as never,
      })
    ).rejects.toThrow("FACTORY_RUN_ANCHOR_INPUT_INVALID");
  });
});
