# Feature 199 Interview

## Decisions

- Feature 199 owns external MCP upstream lifecycle and governed MCP invocation.
- Existing inbound/hosted MCP registry, routers, persistence and UI are partial foundations to extend.
- External Agent runtime is Feature 200; it must never connect directly to arbitrary upstream MCP.
- Credentials remain inside server/Runner adapters; lazy discovery, quarantine, schema revision and revocation are mandatory.
- Feature 199 uses 195 Jobs, 196 Capability Gateway, 197 Runner and 198 Chat/UI without duplicating their truth.

