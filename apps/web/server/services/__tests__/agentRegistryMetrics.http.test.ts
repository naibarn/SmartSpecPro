import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import {
  recordRegistryResolutionMetrics,
  renderAgentRegistryMetrics,
  resetAgentRegistryMetricsForTests,
} from "../agentRegistryMetrics";

describe("agentRegistryMetrics HTTP", () => {
  beforeEach(() => {
    resetAgentRegistryMetricsForTests();
  });

  it("serves Prometheus metrics over HTTP", async () => {
    recordRegistryResolutionMetrics({
      selectedVersionId: "agv_1",
      reason: "eligible and selected",
      usedEvidencePreference: true,
    });

    const app = express();
    app.get("/metrics", (_req, res) => {
      res.type("text/plain; version=0.0.4");
      res.send(renderAgentRegistryMetrics());
    });

    const response = await request(app).get("/metrics");
    expect(response.status).toBe(200);
    expect(response.type).toContain("text/plain");
    expect(response.text).toContain("agent_registry_resolution_total");
    expect(response.text).toContain('outcome="selected"');
  });
});
