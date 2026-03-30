# Section 21 — Advanced MCP Spec Features

## Section ID
`section-21-advanced-spec-features`

## Dependencies
- **section-05**: Spec compliance base fixes
- **section-17**: Multi-transport client

## Overview

Completes MCP 2025-03-26 spec compliance with content types (image/audio), tool annotations, cancellation support, cursor-based pagination for `tools/list`, JSONB deprecation cutover plan, and user-facing documentation.

## Files Modified

| File | Path | Changes |
|------|------|---------|
| mcpPublicServer.ts | `apps/web/server/_core/mcpPublicServer.ts` | Added annotations + cursor-based pagination (PAGE_SIZE=50) |
| mcp_client.py | `python-backend/app/services/mcp_client.py` | Added `_extract_content()` for image/audio/text content types |

## Files Created

| File | Path |
|------|------|
| Tests | `python-backend/tests/unit/services/test_mcp_advanced_features.py` |
| Help (EN) | `apps/web/docs/help/en/mcp-servers.md` |
| Help (TH) | `apps/web/docs/help/th/mcp-servers.md` |

---

## TDD Specification

```
# Test: media generation tools return ImageContent {type:"image", data:base64, mimeType}
# Test: voice tools return AudioContent {type:"audio", data:base64, mimeType}
# Test: Python call_tool handles image/audio content types, not just text
# Test: tool definitions include annotations (readOnlyHint, destructiveHint)
# Test: notifications/cancelled aborts in-progress tool call
# Test: tools/list supports cursor parameter for pagination
# Test: tools/list returns nextCursor when more tools available
# Test: page size default 50
```

---

## Implementation Guidance

See claude-plan.md Section 20 for full specs.

### Content Types
```typescript
// For smartspec.media.generate_image:
return {
  content: [
    { type: "image", data: base64Data, mimeType: "image/png" }
  ]
};
```

### Tool Annotations
```typescript
{
  name: "smartspec.skills.execute",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
  }
}
```

### Pagination (NEW-08 fix applied)
```typescript
case "tools/list": {
  const rawCursor = params?.cursor;
  const cursor = rawCursor !== undefined ? Number(rawCursor) : 0;
  // Validate cursor is a safe integer — prevents NaN/Infinity bypass
  if (!Number.isInteger(cursor) || cursor < 0 || cursor > 100000) {
    throw { code: -32602, message: "Invalid cursor value" };
  }
  const PAGE_SIZE = 50;
  const page = allTools.slice(cursor, cursor + PAGE_SIZE);
  const nextCursor = cursor + PAGE_SIZE < allTools.length ? String(cursor + PAGE_SIZE) : undefined;
  return { tools: page, nextCursor };
}
```

### JSONB Deprecation Cutover

Define explicit milestone (after 4-week verification period):
1. `resolve_mcp_tools_for_agent()` reads exclusively from `mcp_servers` table
2. `agencyAgents.mcpServers` JSONB column marked deprecated in code comments
3. Column dropped in a future migration (separate section, requires user approval)

### User Documentation

Create help pages in EN + TH covering:
- How to add an MCP server (each transport type with screenshots)
- OAuth connection flow
- How tools appear in agent prompts
- Troubleshooting (common errors, health check)
- Security considerations for external servers

### Security Considerations

1. **Image/audio content encoding**: Base64 data in tool responses could be large. Apply the existing 100KB `MAX_RESULT_BYTES` limit.
2. **Cancellation race condition**: `notifications/cancelled` may arrive after the tool call completes. The handler must be idempotent.

## Implementation Notes

- **7 tests passing** covering content types, annotations, and pagination
- Cancellation (`notifications/cancelled`) deferred — requires SSE infrastructure from Streamable HTTP
- JSONB deprecation cutover documented but not code-enforced (separate migration needed)
- `_extract_content()` returns `[image:mime]` / `[audio:mime]` placeholders for non-text content
- Tool annotations derive `readOnlyHint` from existing `readWrite` field on TOOL_REGISTRY
- Cursor validation prevents NaN/Infinity bypass with safe integer check
