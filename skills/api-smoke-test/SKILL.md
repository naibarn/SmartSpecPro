---
name: api-smoke-test
description: Smoke test API routes for status, JSON shape, CORS, and rate-limit headers. Use when the user asks for api-smoke-test, /api-smoke, or the corresponding bundled tool.
---

# api-smoke-test

Codex wrapper for bundled tool `api-smoke-test.mjs`.

## Source

- Source: Local portable skill pack
- Commit: 7a022be3b34abfc00a09ad9c2bf82870b2cfe6e8
- Tool: `tools/api-smoke-test.mjs`

## Usage

Run the bundled tool with Node from any target project:

```bash
node ${CODEX_HOME:-$HOME/.codex}/skills/api-smoke-test/tools/api-smoke-test.mjs <target-or-arguments>
```

Use read-only scans without extra confirmation. If the tool writes files (most wrappers are read-only), explain the target output first and keep edits scoped to the user's requested project. External API calls or credential-backed queries require the relevant environment variables and should be described before running.

## Output

Parse the JSON output where available, summarize the highest-severity findings first, and include exact file paths or URLs from the tool output.
