# Section 08 Review

- Status: complete
- Main outcome: docs, help, and release-note wording now match the implemented MCP behavior
- Main risk checked: operator/runtime docs no longer incorrectly say delegated worker MCP is fully unavailable
- Verification:
  - `npm --prefix apps/web test -- server/routes/__tests__/publicDocsApi.test.ts server/_core/__tests__/mcpPublicServer.test.ts`
