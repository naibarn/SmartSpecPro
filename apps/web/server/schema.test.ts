import { describe, it, expect } from "vitest";
import {
  llmProviders,
  modelProviderMap,
  providerUsageLog,
  routingRules,
  workflowExecutionStatusEnum,
  dlqItemStatusEnum,
  policyActionEnum,
  workflowExecutions,
  workflowDeadLetterQueue,
  workflowCacheMetadata,
  workflowAuditEvents,
  workflowSecrets,
  workflowPolicyRules,
} from "../drizzle/schema";

describe("llmProviders extended columns", () => {
  it("has providerType column", () => {
    expect(llmProviders.providerType).toBeDefined();
  });

  it("has healthStatus column", () => {
    expect(llmProviders.healthStatus).toBeDefined();
  });

  it("has lastHealthCheck column", () => {
    expect(llmProviders.lastHealthCheck).toBeDefined();
  });

  it("has failureCount column", () => {
    expect(llmProviders.failureCount).toBeDefined();
  });

  it("has successCount column", () => {
    expect(llmProviders.successCount).toBeDefined();
  });
});

describe("modelProviderMap table", () => {
  it("has expected columns", () => {
    expect(modelProviderMap.id).toBeDefined();
    expect(modelProviderMap.modelId).toBeDefined();
    expect(modelProviderMap.providerId).toBeDefined();
    expect(modelProviderMap.providerModelId).toBeDefined();
    expect(modelProviderMap.modelName).toBeDefined();
    expect(modelProviderMap.pricingInput).toBeDefined();
    expect(modelProviderMap.pricingOutput).toBeDefined();
    expect(modelProviderMap.isFree).toBeDefined();
    expect(modelProviderMap.contextLength).toBeDefined();
    expect(modelProviderMap.isEnabled).toBeDefined();
    expect(modelProviderMap.priority).toBeDefined();
  });
});

describe("providerUsageLog table", () => {
  it("has expected columns", () => {
    expect(providerUsageLog.id).toBeDefined();
    expect(providerUsageLog.userId).toBeDefined();
    expect(providerUsageLog.providerId).toBeDefined();
    expect(providerUsageLog.modelUsed).toBeDefined();
    expect(providerUsageLog.inputTokens).toBeDefined();
    expect(providerUsageLog.outputTokens).toBeDefined();
    expect(providerUsageLog.costUsd).toBeDefined();
    expect(providerUsageLog.creditsCharged).toBeDefined();
    expect(providerUsageLog.responseTimeMs).toBeDefined();
    expect(providerUsageLog.statusCode).toBeDefined();
    expect(providerUsageLog.errorType).toBeDefined();
    expect(providerUsageLog.wasFallback).toBeDefined();
    expect(providerUsageLog.fallbackFromProviderId).toBeDefined();
    expect(providerUsageLog.createdAt).toBeDefined();
  });
});

describe("routingRules table", () => {
  it("has expected columns", () => {
    expect(routingRules.id).toBeDefined();
    expect(routingRules.modelPattern).toBeDefined();
    expect(routingRules.routingMode).toBeDefined();
    expect(routingRules.providerOrder).toBeDefined();
    expect(routingRules.maxFallbacks).toBeDefined();
    expect(routingRules.isActive).toBeDefined();
    expect(routingRules.createdAt).toBeDefined();
  });
});

// Section 13: Workflow Engine Schema Tests
describe("Section 13: Workflow Engine Schema", () => {
  describe("Enums", () => {
    it("workflowExecutionStatusEnum has correct values", () => {
      expect(workflowExecutionStatusEnum.enumValues).toEqual([
        "pending",
        "running",
        "completed",
        "failed",
        "cancelled",
        "interrupted",
      ]);
    });

    it("dlqItemStatusEnum has correct values", () => {
      expect(dlqItemStatusEnum.enumValues).toEqual([
        "pending",
        "reprocessing",
        "resolved",
        "discarded",
      ]);
    });

    it("policyActionEnum has correct values", () => {
      expect(policyActionEnum.enumValues).toEqual([
        "allow",
        "deny",
        "require_approval",
      ]);
    });
  });

  describe("workflowExecutions table", () => {
    it("has required columns", () => {
      const columns = Object.keys(workflowExecutions);
      expect(columns).toContain("id");
      expect(columns).toContain("workflowId");
      expect(columns).toContain("tenantId");
      expect(columns).toContain("userId");
      expect(columns).toContain("status");
      expect(columns).toContain("threadId");
      expect(columns).toContain("createdAt");
    });
  });

  describe("workflowDeadLetterQueue table", () => {
    it("has required columns", () => {
      const columns = Object.keys(workflowDeadLetterQueue);
      expect(columns).toContain("id");
      expect(columns).toContain("workflowId");
      expect(columns).toContain("inputData");
      expect(columns).toContain("error");
      expect(columns).toContain("status");
    });
  });

  describe("workflowCacheMetadata table", () => {
    it("has required columns", () => {
      const columns = Object.keys(workflowCacheMetadata);
      expect(columns).toContain("id");
      expect(columns).toContain("cacheKey");
      expect(columns).toContain("nodeType");
      expect(columns).toContain("hitCount");
    });
  });

  describe("workflowAuditEvents table", () => {
    it("has required columns", () => {
      const columns = Object.keys(workflowAuditEvents);
      expect(columns).toContain("id");
      expect(columns).toContain("workflowId");
      expect(columns).toContain("eventType");
      expect(columns).toContain("traceId");
    });
  });

  describe("workflowSecrets table", () => {
    it("has required columns", () => {
      const columns = Object.keys(workflowSecrets);
      expect(columns).toContain("id");
      expect(columns).toContain("tenantId");
      expect(columns).toContain("name");
      expect(columns).toContain("encryptedValue");
    });
  });

  describe("workflowPolicyRules table", () => {
    it("has required columns", () => {
      const columns = Object.keys(workflowPolicyRules);
      expect(columns).toContain("id");
      expect(columns).toContain("tenantId");
      expect(columns).toContain("ruleType");
      expect(columns).toContain("action");
    });
  });
});
