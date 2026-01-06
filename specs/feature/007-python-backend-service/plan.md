# plan.md — 007-python-backend-service

Plan ID: **SSP-PY-007-PLAN**  
Last updated: 2026-01-06

## Done
- OpenAI-compatible surface (/v1/chat/completions)
- Forwarding mode to SmartSpecWeb gateway (JSON + SSE passthrough)
- MCP adapter calling SmartSpecWeb /mcp/*

## Next
- Wire existing tool-loop executor to use app.tools.mcp_adapter (if proxy has separate executor module)
- Add trace-id propagation to web gateway + mcp calls
