---
name: code-profiler
description: Run static performance anti-pattern profiling for backend code. Use when the user asks for code-profiler, /code, or the corresponding bundled tool.
---

# code-profiler

Codex wrapper for bundled tool `code-profiler.mjs`.

## Source

- Source: Local portable skill pack
- Commit: 7a022be3b34abfc00a09ad9c2bf82870b2cfe6e8
- Tool: `tools/code-profiler.mjs`

## Usage

Run the bundled tool with Node from any target project:

```bash
node ${CODEX_HOME:-$HOME/.codex}/skills/code-profiler/tools/code-profiler.mjs <target-or-arguments>
```

Use read-only scans without extra confirmation. If the tool writes files (most wrappers are read-only), explain the target output first and keep edits scoped to the user's requested project. External API calls or credential-backed queries require the relevant environment variables and should be described before running.

## Output

Parse the JSON output where available, summarize the highest-severity findings first, and include exact file paths or URLs from the tool output.

## Portable Performance Review Contract

Use this section when static performance review needs to contribute to a larger audit or release scorecard.

### Inputs

- Target project directory.
- Optional route or service hints from the user.

### Required Checks

1. Run the bundled code profiler.
2. Inspect findings for synchronous filesystem work in request paths, unbounded loops, N+1 query patterns, missing pagination, repeated serialization, and large in-memory transforms.
3. Prefer file and symbol evidence over broad claims.
4. Mark runtime benchmark work as skipped unless the repository already provides a safe command for it.

### Scoring

Start at 100 and subtract:

- Critical runtime bottleneck: 20 points
- High-confidence production hotspot: 10 points
- Medium-confidence inefficiency: 5 points
- Low-confidence cleanup item: 2 points

### JSON Report

Return this shape when participating in a larger scorecard:

```json
{
  "category": "code_quality",
  "score": 100,
  "findings": [
    {
      "severity": "medium",
      "type": "n_plus_one_query",
      "message": "Loop performs one database query per item.",
      "evidence": "src/services/orders.ts:88 calls findUnique inside for-of loop",
      "fix": "batch-load records or include relations in the initial query"
    }
  ],
  "skipped": []
}
```
