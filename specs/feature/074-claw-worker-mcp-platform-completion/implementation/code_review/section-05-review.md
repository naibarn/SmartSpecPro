# Section 05 Review

- Status: complete
- Main outcome: major operational MCP families now call real services and return structured async state
- Main risk checked: unsupported or ungranted delegated families remain hidden from `tools/list`
- Verification:
  - `npm --prefix apps/web test -- server/_core/__tests__/mcpPublicServer.test.ts server/_core/__tests__/mcpPublicServerSecurity.test.ts`
