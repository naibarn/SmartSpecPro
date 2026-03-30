# Section 21 Code Review — Advanced MCP Spec Features

## Summary
- Modified `mcpPublicServer.ts`: added tool annotations (readOnlyHint, destructiveHint) and cursor-based pagination (PAGE_SIZE=50)
- Modified `mcp_client.py`: added `_extract_content()` handling image/audio/text content types
- Created help docs in EN + TH
- 7 tests cover all spec items except cancellation (deferred — requires WebSocket infrastructure)

## Findings

### MEDIUM
1. **Cancellation not implemented**: `notifications/cancelled` is spec'd but not implemented. This requires a persistent connection (WebSocket/SSE) to receive in-flight cancellation messages. Deferred to when Streamable HTTP SSE is fully implemented.

### LOW
2. **JSONB deprecation not code-enforced**: The cutover plan is documented but `agencyAgents.mcpServers` JSONB column is not marked deprecated in code. This is intentional — it requires a separate migration with user approval per Database Safety Protocol.

## Spec Compliance
- [x] media generation tools return ImageContent
- [x] voice tools return AudioContent
- [x] Python call_tool handles image/audio content types
- [x] tool definitions include annotations (readOnlyHint, destructiveHint)
- [ ] notifications/cancelled (deferred — requires SSE infrastructure)
- [x] tools/list supports cursor parameter for pagination
- [x] tools/list returns nextCursor when more tools available
- [x] page size default 50

## Verdict: PASS (with noted deferral)
