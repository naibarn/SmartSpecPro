import { describe, expect, it } from "vitest";

import { delegatedCapabilityManifestSchema } from "../workerDelegation";

describe("workerDelegation shared contracts", () => {
  it("supports discovery guidance inside delegated capability manifests", () => {
    const parsed = delegatedCapabilityManifestSchema.parse({
      sessionId: "session-1",
      workerId: "worker-1",
      workerJobId: "job-1",
      tenantId: "tenant-1",
      actingUserId: 7,
      ownerUserId: 7,
      runtimeType: "openclaw_gateway",
      scopeProfile: "worker_gateway_hybrid_executor",
      grantedScopes: ["llm:chat", "library:search", "rag:ingest"],
      routeFamilies: ["llm", "library", "rag", "callbacks"],
      allowedMcpNamespaces: [],
      allowedModelAliases: ["gpt-5.4-mini"],
      allowedProviderProfiles: [],
      knowledgeAccess: {
        libraryRead: true,
        librarySearch: true,
        libraryUpload: true,
        ragSearch: true,
        ragIngest: true,
      },
      grantSummary: {
        skills: [],
        agencies: [],
        libraryItemIds: [],
        mcpNamespaces: [],
      },
      uploadPolicy: {
        enabled: true,
        allowedItemTypes: ["document"],
        maxFileBytes: 1024,
      },
      callbackTargets: {
        roomUpdate: true,
        workflowUpdate: true,
        userNotification: true,
      },
      availability: {
        http: "ready",
        mcp: "unavailable",
        knowledge: "ready",
      },
      mcp: {
        enabled: false,
        availableFamilies: [],
        families: [],
        availableTools: [],
        experimentalTools: [],
        disabledTools: [],
        familyFlags: {
          browserEnabled: false,
          workspaceEnabled: false,
          driveEnabled: false,
          orchestratorEnabled: false,
        },
        operatorPolicy: {
          enabled: true,
          disabledFamilies: [],
          disabledToolGroups: [],
          approvalRequiredToolGroups: [],
        },
      },
      discovery: {
        openApiUrl: "/v1/openapi.json",
        docsUrl: "/v1/docs",
        catalogUrl: "/v1/mcp/catalog",
        manifestPath: "/api/worker-jobs/job-1/delegated-manifest",
        recommendedAuthMode: "bearer",
        routeHints: [
          {
            family: "rag",
            method: "POST",
            path: "/v1/knowledge/rag/ingest",
            availability: "ready",
            purpose: "Upload or re-index owner files for RAG ingestion",
          },
        ],
      },
      expiresAt: "2026-04-07T12:00:00.000Z",
    });

    expect(parsed.discovery.openApiUrl).toBe("/v1/openapi.json");
    expect(parsed.discovery.catalogUrl).toBe("/v1/mcp/catalog");
    expect(parsed.discovery.routeHints[0]?.path).toBe("/v1/knowledge/rag/ingest");
    expect(parsed.mcp.operatorPolicy.disabledFamilies).toEqual([]);
    expect(parsed.mcp.operatorPolicy.enabled).toBe(true);
  });
});
