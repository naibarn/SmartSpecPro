import { describe, it, expect } from "vitest";
import {
  apiKeys,
  publicApiAuditLog,
  apiWebhookEndpoints,
  apiWebhookDeliveries,
  automationJobs,
  conversations,
  agencyConversations,
  providerUsageLog,
} from "../../../drizzle/schema";
import { getTableColumns } from "drizzle-orm";

describe("api_keys table", () => {
  it("has correct columns", () => {
    const cols = getTableColumns(apiKeys);
    expect(cols.id).toBeDefined();
    expect(cols.tenantId).toBeDefined();
    expect(cols.userId).toBeDefined();
    expect(cols.name).toBeDefined();
    expect(cols.keyPrefix).toBeDefined();
    expect(cols.keyHash).toBeDefined();
    expect(cols.scopes).toBeDefined();
    expect(cols.rateLimit).toBeDefined();
    expect(cols.creditLimit).toBeDefined();
    expect(cols.expiresAt).toBeDefined();
    expect(cols.lastUsedAt).toBeDefined();
    expect(cols.isActive).toBeDefined();
    expect(cols.metadata).toBeDefined();
    expect(cols.createdAt).toBeDefined();
    expect(cols.updatedAt).toBeDefined();
  });

  it("tenantId is varchar(36), NOT integer", () => {
    const cols = getTableColumns(apiKeys);
    // Drizzle stores column type info -- varchar has columnType "PgVarchar"
    expect(cols.tenantId.columnType).toBe("PgVarchar");
  });
});

describe("public_api_audit_log table", () => {
  it("has correct columns", () => {
    const cols = getTableColumns(publicApiAuditLog);
    expect(cols.id).toBeDefined();
    expect(cols.tenantId).toBeDefined();
    expect(cols.userId).toBeDefined();
    expect(cols.apiKeyId).toBeDefined();
    expect(cols.traceId).toBeDefined();
    expect(cols.method).toBeDefined();
    expect(cols.path).toBeDefined();
    expect(cols.statusCode).toBeDefined();
    expect(cols.creditsUsed).toBeDefined();
    expect(cols.latencyMs).toBeDefined();
    expect(cols.ip).toBeDefined();
    expect(cols.userAgent).toBeDefined();
    expect(cols.requestMeta).toBeDefined();
    expect(cols.createdAt).toBeDefined();
  });
});

describe("api_webhook_endpoints table", () => {
  it("has correct columns", () => {
    const cols = getTableColumns(apiWebhookEndpoints);
    expect(cols.id).toBeDefined();
    expect(cols.tenantId).toBeDefined();
    expect(cols.apiKeyId).toBeDefined();
    expect(cols.url).toBeDefined();
    expect(cols.secretEncrypted).toBeDefined();
    expect(cols.events).toBeDefined();
    expect(cols.retryPolicy).toBeDefined();
    expect(cols.isActive).toBeDefined();
    expect(cols.lastDeliveredAt).toBeDefined();
    expect(cols.failureCount).toBeDefined();
    expect(cols.createdAt).toBeDefined();
    expect(cols.updatedAt).toBeDefined();
  });
});

describe("api_webhook_deliveries table", () => {
  it("has correct columns", () => {
    const cols = getTableColumns(apiWebhookDeliveries);
    expect(cols.id).toBeDefined();
    expect(cols.webhookEndpointId).toBeDefined();
    expect(cols.eventType).toBeDefined();
    expect(cols.payload).toBeDefined();
    expect(cols.statusCode).toBeDefined();
    expect(cols.attempt).toBeDefined();
    expect(cols.deliveredAt).toBeDefined();
    expect(cols.error).toBeDefined();
    expect(cols.createdAt).toBeDefined();
  });
});

describe("automation_jobs table", () => {
  it("has correct columns", () => {
    const cols = getTableColumns(automationJobs);
    expect(cols.id).toBeDefined();
    expect(cols.tenantId).toBeDefined();
    expect(cols.userId).toBeDefined();
    expect(cols.apiKeyId).toBeDefined();
    expect(cols.type).toBeDefined();
    expect(cols.status).toBeDefined();
    expect(cols.params).toBeDefined();
    expect(cols.result).toBeDefined();
    expect(cols.error).toBeDefined();
    expect(cols.progress).toBeDefined();
    expect(cols.creditsReserved).toBeDefined();
    expect(cols.creditsUsed).toBeDefined();
    expect(cols.callbackUrl).toBeDefined();
    expect(cols.callbackSecretEncrypted).toBeDefined();
    expect(cols.parentJobId).toBeDefined();
    expect(cols.stepIndex).toBeDefined();
    expect(cols.traceId).toBeDefined();
    expect(cols.idempotencyKey).toBeDefined();
    expect(cols.startedAt).toBeDefined();
    expect(cols.completedAt).toBeDefined();
    expect(cols.createdAt).toBeDefined();
    expect(cols.expiresAt).toBeDefined();
  });
});

describe("existing table column additions", () => {
  it("conversations has source, apiKeyId, expiresAt", () => {
    const cols = getTableColumns(conversations);
    expect(cols.source).toBeDefined();
    expect(cols.apiKeyId).toBeDefined();
    expect(cols.expiresAt).toBeDefined();
  });

  it("agencyConversations has source, apiKeyId, expiresAt", () => {
    const cols = getTableColumns(agencyConversations);
    expect(cols.source).toBeDefined();
    expect(cols.apiKeyId).toBeDefined();
    expect(cols.expiresAt).toBeDefined();
  });

  it("providerUsageLog has apiKeyId", () => {
    const cols = getTableColumns(providerUsageLog);
    expect(cols.apiKeyId).toBeDefined();
  });
});
