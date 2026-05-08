---
name: secret-scanner
description: Run the bundled secret scanner directly from Codex. Use when the user asks for secret-scanner, /secret, or the corresponding bundled tool.
---

# secret-scanner

Codex wrapper for bundled tool `secret-scanner.mjs`.

## Source

- Source: Local portable skill pack
- Commit: 7a022be3b34abfc00a09ad9c2bf82870b2cfe6e8
- Tool: `tools/secret-scanner.mjs`

## Usage

Run the bundled tool with Node from any target project:

```bash
node ${CODEX_HOME:-$HOME/.codex}/skills/secret-scanner/tools/secret-scanner.mjs <target-or-arguments>
```

Use read-only scans without extra confirmation. If the tool writes files (most wrappers are read-only), explain the target output first and keep edits scoped to the user's requested project. External API calls or credential-backed queries require the relevant environment variables and should be described before running.

## Output

Parse the JSON output where available, summarize the highest-severity findings first, and include exact file paths or URLs from the tool output.

## Remediation Playbook

When the scanner reports a likely secret:

1. Do not print the full secret value. Keep evidence to file path, line, pattern, and redacted prefix.
2. Classify whether it is a real credential, a test fixture, or documentation/example text.
3. For real credentials, instruct the user to rotate or revoke the credential in the provider immediately.
4. Remove the value from source and replace it with environment or secrets-manager loading.
5. Check whether the value appeared in CI logs, build artifacts, package releases, deployment config, or screenshots.
6. Add prevention: `.gitignore`, pre-commit scanning, CI scanning, and release-gate scanning.
7. Do not rewrite git history unless the user explicitly requests it and a backup/coordination plan exists.

For documentation examples, replace realistic values with clearly redacted placeholders such as `[REDACTED_EXAMPLE_SECRET]`.
