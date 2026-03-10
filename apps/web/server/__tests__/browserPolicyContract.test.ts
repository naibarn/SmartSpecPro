import fs from "fs";
import path from "path";

import { describe, expect, it } from "vitest";

import {
  browserPolicyDecisionEnvelopeSchema,
  browserWorkflowEntitlementSchema,
} from "../../shared/browserPolicy";

const fixtureDir = path.resolve(
  __dirname,
  "../../../../specs/feature/033-Browser-Automation-Policy/fixtures",
);

describe("browser policy contract fixtures", () => {
  it("parses the shared entitlement fixture", () => {
    const fixture = JSON.parse(
      fs.readFileSync(path.join(fixtureDir, "browser-policy-entitlement.json"), "utf8"),
    );

    expect(browserWorkflowEntitlementSchema.parse(fixture)).toMatchObject({
      tenantId: "tenant-123",
      workflowId: 42,
      workflowName: "Browser QA Workflow",
    });
  });

  it("parses the shared decision-envelope fixture", () => {
    const fixture = JSON.parse(
      fs.readFileSync(path.join(fixtureDir, "browser-policy-decision-envelope.json"), "utf8"),
    );

    expect(browserPolicyDecisionEnvelopeSchema.parse(fixture)).toMatchObject({
      version: "2026-03-10",
      decision: "require_approval",
      actionClass: "restricted",
    });
  });
});
