---
name: llms-txt-generator
description: Generate llms.txt and llms-full.txt from project metadata and README. Use when the user asks for llms-txt-generator, /llms-txt, or the corresponding bundled tool.
---

# llms-txt-generator

Codex wrapper for bundled tool `llms-txt-generator.mjs`.

## Source

- Source: Local portable skill pack
- Commit: 7a022be3b34abfc00a09ad9c2bf82870b2cfe6e8
- Tool: `tools/llms-txt-generator.mjs`

## Usage

Run the bundled tool with Node from any target project:

```bash
node ${CODEX_HOME:-$HOME/.codex}/skills/llms-txt-generator/tools/llms-txt-generator.mjs <target-or-arguments>
```

Use read-only scans without extra confirmation. If the tool writes files (this one can write generated files), explain the target output first and keep edits scoped to the user's requested project. External API calls or credential-backed queries require the relevant environment variables and should be described before running.

## Output

Parse the JSON output where available, summarize the highest-severity findings first, and include exact file paths or URLs from the tool output.
