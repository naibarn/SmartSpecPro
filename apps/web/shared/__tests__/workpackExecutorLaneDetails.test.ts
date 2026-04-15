import { describe, expect, it } from "vitest";

import {
  workpackBrowserLaneDetailSchema,
  workpackClusterLaneDetailSchema,
  workpackDesktopLocalLaneDetailSchema,
} from "../workpackExecutorLaneDetails";

describe("workpackExecutorLaneDetails", () => {
  it("parses browser lane details", () => {
    const parsed = workpackBrowserLaneDetailSchema.parse({
      lane: "browser",
      stage: "navigate_queue",
      sourceCount: 1,
      connectorFamilies: ["crm"],
      fallbackPaths: ["workflow"],
      currentUrl: "https://example.com/queue",
      publishedArtifacts: ["summary"],
    });

    expect(parsed.currentUrl).toContain("example.com");
    expect(parsed.connectorFamilies).toEqual(["crm"]);
  });

  it("validates desktop-local stages against the shared worker runtime contract", () => {
    expect(() => workpackDesktopLocalLaneDetailSchema.parse({
      lane: "desktop_local",
      stage: "resolve_roots",
      rootCount: 2,
      rootLabels: ["Quotes", "Invoices"],
      indexedFileCount: 14,
    })).not.toThrow();

    expect(() => workpackDesktopLocalLaneDetailSchema.parse({
      lane: "desktop_local",
      stage: "not_a_real_stage",
    })).toThrow();
  });

  it("accepts clustered lane details for worker-fabric style orchestration", () => {
    const parsed = workpackClusterLaneDetailSchema.parse({
      lane: "worker_fabric",
      stage: "dispatching",
      capabilityFamilies: ["multi-agent-cluster"],
      intent: "workpack_worker_fabric_step",
      sourceCount: 3,
      connectorFamilies: ["jira", "slack"],
    });

    expect(parsed.lane).toBe("worker_fabric");
    expect(parsed.capabilityFamilies).toContain("multi-agent-cluster");
  });
});
