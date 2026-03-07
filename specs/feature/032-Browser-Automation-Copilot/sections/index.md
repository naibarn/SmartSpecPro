<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-db-config
section-02-gateway-client
section-03-responses-api
section-04-copilot-llm-calls
section-05-browser-runner
section-06-search-cache
section-07-mcp-tools
section-08-credit-flow-ui
section-09-security-audit
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-db-config | - | all | Yes (first) |
| section-02-gateway-client | 01 | 03, 04 | No |
| section-03-responses-api | 02 | 06 | Yes (with 04, 05) |
| section-04-copilot-llm-calls | 02 | 07 | Yes (with 03, 05) |
| section-05-browser-runner | 01 | 07 | Yes (with 03, 04) |
| section-06-search-cache | 03 | 08 | No |
| section-07-mcp-tools | 04, 05 | 08 | No |
| section-08-credit-flow-ui | 03, 06, 07 | 09 | No |
| section-09-security-audit | all | - | No (final) |

## Execution Order

1. **Batch 1**: section-01-db-config (no dependencies)
2. **Batch 2**: section-02-gateway-client (after 01)
3. **Batch 3**: section-03-responses-api, section-04-copilot-llm-calls, section-05-browser-runner (parallel after 02)
4. **Batch 4**: section-06-search-cache, section-07-mcp-tools (parallel after batch 3)
5. **Batch 5**: section-08-credit-flow-ui (after batch 4)
6. **Batch 6**: section-09-security-audit (final pass)

## Section Summaries

### section-01-db-config
GPT-5.4 model_provider_map entry, apiStyle enum verification, feature flags, system settings defaults. Corresponds to Plan Section 9.

### section-02-gateway-client
Python LLMGatewayClient HTTP client + Node.js guardWithCreditsOrInternalToken() wrapper. Corresponds to Plan Section 1.

### section-03-responses-api
New responsesRoutes.ts with /v1/responses endpoint, SSE streaming, tool-call loop, web_search tracking, budget cap. Corresponds to Plan Section 2.

### section-04-copilot-llm-calls
Activate _analyze_intent(), _vision_llm_call(), _diagnose_failure(), WebAutomationExecutor.execute(). Corresponds to Plan Section 3.

### section-05-browser-runner
Wire BrowserSession action methods to real Playwright execution, add MAX_ACTIONS/MAX_PAGES caps, sandbox profile, SSRF page.route(), Node-side domain validation. Corresponds to Plan Section 4.

### section-06-search-cache
Two-tier Redis cache (tenant-shared + per-user), freshness detection, search cost tracking. Corresponds to Plan Section 5.

### section-07-mcp-tools
Register browser.execute_actions and sandbox.exec_command in internal MCP router, agency integration. Corresponds to Plan Section 6.

### section-08-credit-flow-ui
Parent reservation pattern for credit coordination, cost estimate in analyze response, AutomationChatModal UI enhancements. Corresponds to Plan Section 7.

### section-09-security-audit
Prompt injection mitigation, HTML sanitization, audit events (browser_tool_call, web_search_call, responses_api_call), redaction policy, store=false enforcement. Corresponds to Plan Section 8.
