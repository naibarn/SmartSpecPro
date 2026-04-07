# Diff Notes: Section 04 - MCP LLM Parity and Auth Normalization

- Removed placeholder `smartspec.llm.*` MCP tools from discovery and dispatch so the server no longer advertises unimplemented MCP LLM surfaces.
- Added MCP-specific scope enforcement for bearer callers instead of relying on the generic scope middleware path.
- Normalized MCP session auth for API-key, session, and explicitly internal-style bearer flows.
