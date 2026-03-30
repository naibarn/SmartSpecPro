<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm test && cd python-backend && pytest
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-python-ssrf-auth
section-02-python-injection-fixes
section-03-nodejs-auth-tenant
section-04-nodejs-scope-idor
section-05-spec-compliance
section-06-infrastructure
section-07-context-summarizer
section-08-deferred-tools
section-09-vector-memory
section-10-chat-token-counting
section-11-fewshot-rag-optimization
section-12-db-schema-mcp-registry
section-13-trpc-router-mcp
section-14-admin-ui-mcp
section-15-cross-system-protections
section-16-feature-flags-audit
section-17-multi-transport-client
section-18-oauth-support
section-19-hotreload-adapters
section-20-nginx-monitoring
section-21-advanced-spec-features
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-python-ssrf-auth | - | 07,08,09,17 | Yes (Wave 1) |
| section-02-python-injection-fixes | - | - | Yes (Wave 1) |
| section-03-nodejs-auth-tenant | - | 13,14 | Yes (Wave 1) |
| section-04-nodejs-scope-idor | - | 13,14 | Yes (Wave 1) |
| section-05-spec-compliance | - | 21 | Yes (Wave 1) |
| section-06-infrastructure | - | 17 | Yes (Wave 1) |
| section-07-context-summarizer | 01 | - | Yes (Wave 2) |
| section-08-deferred-tools | 01 | - | Yes (Wave 2) |
| section-09-vector-memory | - | - | Yes (Wave 2) |
| section-10-chat-token-counting | - | - | Yes (Wave 2) |
| section-11-fewshot-rag-optimization | - | - | Yes (Wave 2) |
| section-12-db-schema-mcp-registry | - | 13,15,16,17 | No (Wave 3) |
| section-13-trpc-router-mcp | 03,04,12 | 14 | No (Wave 3) |
| section-14-admin-ui-mcp | 13 | - | No (Wave 3) |
| section-15-cross-system-protections | 01,12 | - | Yes (Wave 3) |
| section-16-feature-flags-audit | 12 | - | Yes (Wave 3) |
| section-17-multi-transport-client | 01,06,12 | 18 | No (Wave 3) |
| section-18-oauth-support | 17 | 19 | No (Wave 3) |
| section-19-hotreload-adapters | 17 | - | No (Wave 3) |
| section-20-nginx-monitoring | 06 | - | Yes (Wave 3) |
| section-21-advanced-spec-features | 05,17 | - | No (Wave 3) |

## Execution Order

### Batch 1 — Wave 1 Security (parallel)
1. section-01-python-ssrf-auth
2. section-02-python-injection-fixes
3. section-03-nodejs-auth-tenant
4. section-04-nodejs-scope-idor
5. section-05-spec-compliance
6. section-06-infrastructure

### Batch 2 — Wave 2 Context (parallel)
7. section-07-context-summarizer
8. section-08-deferred-tools
9. section-09-vector-memory
10. section-10-chat-token-counting
11. section-11-fewshot-rag-optimization

### Batch 3 — Wave 3 Foundation
12. section-12-db-schema-mcp-registry

### Batch 4 — Wave 3 Backend (partially parallel)
13. section-13-trpc-router-mcp
14. section-15-cross-system-protections (parallel with 13)
15. section-16-feature-flags-audit (parallel with 13)

### Batch 5 — Wave 3 UI + Transport
16. section-14-admin-ui-mcp
17. section-17-multi-transport-client

### Batch 6 — Wave 3 Auth + Adapters
18. section-18-oauth-support
19. section-19-hotreload-adapters (parallel with 18)
20. section-20-nginx-monitoring (parallel with 18)

### Batch 7 — Wave 3 Final
21. section-21-advanced-spec-features

## Section Summaries

### section-01-python-ssrf-auth
Fix SSRF validation activation in mcp_client.py + mcp_executor.py. Add tenant-aware cache. Plan sections 1.1, 1.2.

### section-02-python-injection-fixes
Fix OneDrive OData/path injection, browser command injection, Google Drive query escaping, internal MCP auth. Plan sections 1.3-1.6.

### section-03-nodejs-auth-tenant
Fix mcp.ts auth bypass, mcpRoutes.ts tenant injection, path traversal, cache isolation. Plan sections 2.1, 2.2.

### section-04-nodejs-scope-idor
Fix mcpPublicServer.ts scope bypass, IDOR, proxy auth, fallthrough. Plan sections 2.3, 2.4.

### section-05-spec-compliance
Add batch request support, protocol negotiation, session termination. Plan section 3.

### section-06-infrastructure
systemd KillMode, TimeoutStopSec, resource limits. Plan section 4.

### section-07-context-summarizer
Agency context auto-condensation service + wire into ReAct and autonomous executors. Plan section 5.

### section-08-deferred-tools
Deferred tool registry for token savings + integration with agency_tools. Plan section 6.

### section-09-vector-memory
Add embedding column to agency_agent_memories, vector-based retrieval, backfill task. Plan section 7.

### section-10-chat-token-counting
Token counting in buildChatContext, shared tokenEstimator utility. Plan section 8.

### section-11-fewshot-rag-optimization
Few-shot relevance filtering + RAG deduplication. Plan sections 9, 10.

### section-12-db-schema-mcp-registry
New mcp_servers + mcp_server_assignments tables, JSONB migration script. Plan section 11.

### section-13-trpc-router-mcp
MCP server CRUD router with strict Zod validation and security controls. Plan section 12.

### section-14-admin-ui-mcp
McpServerManager page + agency builder MCP picker. Plan section 13.

### section-15-cross-system-protections
MCP response wrapper, rate limits, loop detection, guardrails, memory protection, audit, credits. Plan section 14.

### section-16-feature-flags-audit
Three feature flags + audit event types. Plan sections 15, 14.7.

### section-17-multi-transport-client
McpClientManager with HTTP, Streamable HTTP, stdio (OpenSandbox) transports. Plan section 16.

### section-18-oauth-support
OAuth 2.1 token manager + authorization_code callback route. Plan section 17.

### section-19-hotreload-adapters
Config watcher + langchain-mcp-adapters evaluation. Plan section 18.

### section-20-nginx-monitoring
Nginx SSE block for MCP + health endpoint + Prometheus metrics. Plan sections 19, 20.5.

### section-21-advanced-spec-features
Content types, annotations, cancellation, pagination, JSONB cutover, docs. Plan section 20.
