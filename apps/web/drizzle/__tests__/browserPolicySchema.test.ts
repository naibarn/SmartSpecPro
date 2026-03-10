import { describe, expect, it } from "vitest";
import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";

import {
  browserActionClassEnum,
  browserPageSensitivityEnum,
  browserPolicyDecisionEnum,
  browserWorkflowEntitlements,
  tenantBrowserPolicyConfig,
  tenantBrowserPolicyRules,
} from "../schema";

describe("browser policy schema", () => {
  it("exports dedicated browser policy enums", () => {
    expect(browserPolicyDecisionEnum.enumValues).toEqual([
      "allow",
      "allow_with_redaction",
      "require_approval",
      "deny",
      "escalate_for_review",
    ]);
    expect(browserActionClassEnum.enumValues).toEqual([
      "read",
      "draft",
      "commit",
      "restricted",
    ]);
    expect(browserPageSensitivityEnum.enumValues).toEqual([
      "none",
      "auth",
      "financial",
      "admin",
      "sensitive_data",
      "communication",
      "code",
    ]);
  });

  it("defines tenant_browser_policy_config with TTL and rollout fields", () => {
    expect(getTableName(tenantBrowserPolicyConfig)).toBe("tenant_browser_policy_config");
    const columns = getTableColumns(tenantBrowserPolicyConfig);

    expect(columns).toHaveProperty("tenantId");
    expect(columns).toHaveProperty("enabled");
    expect(columns).toHaveProperty("enforcementMode");
    expect(columns).toHaveProperty("defaultApprovalTtlSeconds");
    expect(columns).toHaveProperty("allowedDomains");
    expect(columns).toHaveProperty("visionModel");
    expect(columns.defaultApprovalTtlSeconds.notNull).toBe(true);
  });

  it("defines tenant_browser_policy_rules as an ordered tenant-scoped rule table", () => {
    expect(getTableName(tenantBrowserPolicyRules)).toBe("tenant_browser_policy_rules");
    const columns = getTableColumns(tenantBrowserPolicyRules);

    expect(columns).toHaveProperty("tenantId");
    expect(columns).toHaveProperty("priority");
    expect(columns).toHaveProperty("decision");
    expect(columns).toHaveProperty("reasonCode");
    expect(columns).toHaveProperty("match");
  });

  it("defines browser_workflow_entitlements with tenant/workflow uniqueness", () => {
    expect(getTableName(browserWorkflowEntitlements)).toBe("browser_workflow_entitlements");
    const columns = getTableColumns(browserWorkflowEntitlements);
    const config = getTableConfig(browserWorkflowEntitlements);
    const uniqueNames = config.indexes.map((index) => index.config.name);

    expect(columns).toHaveProperty("tenantId");
    expect(columns).toHaveProperty("workflowId");
    expect(columns).toHaveProperty("allowedCapabilities");
    expect(columns).toHaveProperty("forbiddenCapabilities");
    expect(columns).toHaveProperty("allowedDataClasses");
    expect(columns).toHaveProperty("config");
    expect(columns).toHaveProperty("enabled");
    expect(columns).toHaveProperty("expiresAt");
    expect(columns).toHaveProperty("reviewCadenceDays");
    expect(uniqueNames).toContain("uq_browser_workflow_entitlements_tenant_workflow");
  });
});
