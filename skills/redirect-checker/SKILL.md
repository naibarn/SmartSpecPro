---
name: redirect-checker
description: Check redirect chains, loops, and mixed HTTP/HTTPS. Use when the user asks for redirect-checker, /redirect, or the corresponding bundled tool.
---

# redirect-checker

Codex wrapper for bundled tool `redirect-checker.mjs`.

## Source

- Source: Local portable skill pack
- Commit: 7a022be3b34abfc00a09ad9c2bf82870b2cfe6e8
- Tool: `tools/redirect-checker.mjs`

## Usage

Run the bundled tool with Node from any target project:

```bash
node ${CODEX_HOME:-$HOME/.codex}/skills/redirect-checker/tools/redirect-checker.mjs <target-or-arguments>
```

Use read-only scans without extra confirmation. If the tool writes files (most wrappers are read-only), explain the target output first and keep edits scoped to the user's requested project. External API calls or credential-backed queries require the relevant environment variables and should be described before running.

## Output

Parse the JSON output where available, summarize the highest-severity findings first, and include exact file paths or URLs from the tool output.
