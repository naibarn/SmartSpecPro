# tasks.md — 007-python-backend-service

Tasks ID: **SSP-PY-007-TASKS**  
Last updated: 2026-01-06

## P0
- ✅ Forward `/v1/chat/completions` to SmartSpecWeb gateway (JSON + SSE)
- ✅ MCP adapter: list_tools + call_tool via SmartSpecWeb `/mcp/*`
- ⬜ Integrate existing tool-loop engine to use MCP adapter (หากมี executor แยกไฟล์)

## P1
- ⬜ Add retry/backoff for MCP calls + timeouts
- ⬜ Pass through `x-trace-id` for end-to-end audit correlation
