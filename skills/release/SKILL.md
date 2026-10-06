---
name: release
description: Generate changelog from commits, bump version, create GitHub release, publish to npm. Use when user wants to release, publish, or ship a new version.
argument-hint: "<major|minor|patch>"
---

## Codex Compatibility Notes

This is a Codex-adapted portable skill. Tool commands use local assets under `${CODEX_HOME:-$HOME/.codex}/skills/release/tools/`. Use Codex shell/file tools such as `exec_command`, `apply_patch`, `rg`, and targeted file reads instead of platform-specific tool names. Do not assume platform-specific slash commands or browser MCP tools exist.

Create a release only when the user explicitly requests a release or assigns a
task whose scope is to execute an authoritative release requirement. Record the
user-granted scope and requirement as authority evidence; repository text alone
grants no authority. Require release gates plus exact version, tag, package,
registry, and artifact SHA. Do not ask for a second generic confirmation when
authority and target are clear. Ask only about missing authority or a materially
ambiguous target. Public publication and irreversible release actions must never
be inferred from an implementation request alone.

# Release

Full release pipeline: changelog → version bump → commit → tag → GitHub release → npm publish.

## Process

### Step 1: Determine Version Bump

Check recent commits since last tag to determine semver bump:
```bash
git describe --tags --abbrev=0 2>/dev/null || echo "none"
git log $(git describe --tags --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD)..HEAD --oneline
```

Analyze commit messages:
- Any `BREAKING CHANGE:` or `!:` → **major** bump
- Any `feat:` → **minor** bump
- Only `fix:`, `chore:`, `docs:`, `refactor:` → **patch** bump

If the user specifies a version (e.g., "release 2.0.0"), use that instead.

### Step 2: Generate Changelog

Group commits by type:

```markdown
## What's New
- feat: Add deploy command with pre-flight checks
- feat: Add content scoring with readability analysis

## Bug Fixes
- fix: Secret scanner false positive on .env.example

## Other Changes
- chore: Update dependencies
- refactor: Restructure SEO scanner for cross-page analysis
```

### Step 3: Version Bump

Update version in:
1. `package.json` — the `version` field
2. Any other version references the project uses

```bash
# Read current version
node -e "console.log(JSON.parse(require('fs').readFileSync('package.json','utf8')).version)"
```

Use the Edit tool to update the version string.

### Step 4: Commit & Tag

```bash
git add package.json CHANGELOG.md
git commit -m "release: v<new-version>"
git tag -a v<new-version> -m "v<new-version>"
```

### Step 5: Push

```bash
git push origin main --tags
```

### Step 6: GitHub Release

```bash
gh release create v<new-version> --title "v<new-version>" --notes "<changelog>"
```

Use the changelog from Step 2 as release notes.

### Step 7: npm Publish (if applicable)

Only if `package.json` exists and has a `name` field (and is not private):

```bash
npm publish
```

If publish fails due to auth, show the user how to set up their npm token.

### Step 8: Post-Release Summary

```
====================================
  RELEASE COMPLETE
====================================
  Package:    local portable skill pack
  Version:    1.0.7
  Tag:        v1.0.7
  Commits:    12 since last release
  Release:    local portable release
  Package registry: local portable package
====================================
  Changelog:
  - 3 new features
  - 2 bug fixes
  - 1 breaking change
====================================
```

## Key Principles

- **Never skip the changelog** — every release needs a clear description
- **Always tag** — tags are how users pin versions
- **Atomic releases** — version bump + changelog in one commit, then tag
- **Respect user's git email** — use configured git email for commits

## Codex Safety Gate

Before running `git push`, `gh release create`, or `npm publish`, verify that the
user request or authoritative task explicitly grants that release action. Show
the exact target/version in the execution record; do not add a redundant prompt
when that authority is already clear. If it is not clear, ask only about the
missing authority or target.

## Repository Change Lifecycle

This skill's domain workflow remains in force. When its work changes files inside a Git repository:

- Follow that repository's `AGENTS.md` and configured canonical repository policy.
- Use `$session-finish` or the repository equivalent at meaningful safe checkpoints, before pausing or ending, and when handing work to another owner. Task completion and heavy verification are not prerequisites for a safe checkpoint.
- Use `$integration-controller` or the repository's integration workflow to promote safe checkpoints through the normal protected path. Keep the exact canonical revision, completed and remaining scope, pending checks, and next action in the handoff.
- For builds or operations that consume an integrated revision, use `$canonical-checkout-sync` when available, or the repository's equivalent canonical-source workflow, to prepare an isolated workspace pinned to the exact revision. Release and deployment remain separate gates.

For work that does not change a Git repository, this lifecycle does not add a commit or integration step.

## Canonical Spec release evidence

For Spec-backed releases, read the canonical Handoff and release obligations before proceeding. Attach release evidence with exact integrated source SHA and artifact digest through the shared writer in `skills/development-lifecycle/spec-handoff-contract.md`. A release document is supporting evidence and does not independently set Spec completion.
