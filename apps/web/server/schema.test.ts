import { describe, it, expect } from "vitest";
import {
  llmProviders,
  modelProviderMap,
  providerUsageLog,
  routingRules,
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
