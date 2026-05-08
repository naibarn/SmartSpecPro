---
name: content-scorer
description: Score HTML content quality, readability, keyword density, and GEO structure. Use when the user asks for content-scorer, /content, or the corresponding bundled tool.
---

# content-scorer

Codex wrapper for bundled tool `content-scorer.mjs`.

## Source

- Source: Local portable skill pack
- Commit: 7a022be3b34abfc00a09ad9c2bf82870b2cfe6e8
- Tool: `tools/content-scorer.mjs`

## Usage

Run the bundled tool with Node from any target project:

```bash
node ${CODEX_HOME:-$HOME/.codex}/skills/content-scorer/tools/content-scorer.mjs <target-or-arguments>
```

Use read-only scans without extra confirmation. If the tool writes files (most wrappers are read-only), explain the target output first and keep edits scoped to the user's requested project. External API calls or credential-backed queries require the relevant environment variables and should be described before running.

## Output

Parse the JSON output where available, summarize the highest-severity findings first, and include exact file paths or URLs from the tool output.
