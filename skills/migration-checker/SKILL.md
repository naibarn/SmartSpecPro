---
name: migration-checker
description: Check common JavaScript ORM migration state before deploys. Use when the user asks for migration-checker, /migration, or the corresponding bundled tool.
---

# migration-checker

Codex wrapper for bundled tool `migration-checker.mjs`. The static Drizzle check
validates configured schema and journal-to-SQL file consistency only. It does not
connect to a database and must not infer applied or pending migrations from file
counts; use the repository's read-only database ledger / migration receipt path
for live applied state.

## Source

- Source: Local portable skill pack
- Commit: 7a022be3b34abfc00a09ad9c2bf82870b2cfe6e8
- Tool: `tools/migration-checker.mjs`

## Usage

Run the bundled tool with Node from any target project:

```bash
node ${CODEX_HOME:-$HOME/.codex}/skills/migration-checker/tools/migration-checker.mjs <target-or-arguments>
```

Use read-only scans without extra confirmation. If the tool writes files (most wrappers are read-only), explain the target output first and keep edits scoped to the user's requested project. External API calls or credential-backed queries require the relevant environment variables and should be described before running.

## Output

Parse the JSON output where available, summarize the highest-severity findings first, and include exact file paths or URLs from the tool output.

## Repository Change Lifecycle

This skill's domain workflow remains in force. When its work changes files inside a Git repository:

- Follow that repository's `AGENTS.md` and configured canonical repository policy.
- Use `$session-finish` or the repository equivalent at meaningful safe checkpoints, before pausing or ending, and when handing work to another owner. Task completion and heavy verification are not prerequisites for a safe checkpoint.
- Use `$integration-controller` or the repository's integration workflow to promote safe checkpoints through the normal protected path. Keep the exact canonical revision, completed and remaining scope, pending checks, and next action in the handoff.
- For builds or operations that consume an integrated revision, use `$canonical-checkout-sync` when available, or the repository's equivalent canonical-source workflow, to prepare an isolated workspace pinned to the exact revision. Release and deployment remain separate gates.

For work that does not change a Git repository, this lifecycle does not add a commit or integration step.
