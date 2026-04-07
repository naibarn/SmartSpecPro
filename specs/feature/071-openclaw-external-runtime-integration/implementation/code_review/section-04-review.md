# Code Review: Section 04 - MCP LLM Parity and Auth Normalization

## Findings

No blocking correctness or security issues remain after hiding the placeholder tools and tightening MCP auth.

## Auto-fixes applied during review

- Enforced `mcp:read` at the MCP route layer for bearer callers.
- Restricted internal-style bearer session bootstrapping so tenant/user headers are only honored for explicitly internal subjects.

## Test coverage

- placeholder MCP LLM tools are no longer listed
- bearer callers still require MCP scopes
- session initialization keeps tenant/user context normalized across supported auth modes
- missing tenant/user context for internal-style bearer sessions now fails closed

## Notes

- MCP still stays truthful by omission rather than by advertising partial LLM parity.
