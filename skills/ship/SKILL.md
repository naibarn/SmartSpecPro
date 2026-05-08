---
name: ship
description: Run a portable pre-deploy scorecard in Codex using only bundled tools: SEO, secrets, code profile, dependency doctor, and bundle tracker. Use when the user asks for /ship or ship readiness.
---

# Ship Scorecard

Codex wrapper for a bundled /ship scorecard.

## Source

- Source: Local portable skill pack
- Commit: 7a022be3b34abfc00a09ad9c2bf82870b2cfe6e8
- Based on: `commands/ship.md` and `bundled scorecard logic` scoring logic

## Process

Run these bundled tools against the target project, preferably in parallel when independent:

```bash
SKILL_ROOT="${CODEX_HOME:-$HOME/.codex}/skills/ship"
node "$SKILL_ROOT/tools/seo-scanner.mjs" <project-directory>
node "$SKILL_ROOT/tools/secret-scanner.mjs" <project-directory>
node "$SKILL_ROOT/tools/code-profiler.mjs" <project-directory>
node "$SKILL_ROOT/tools/dep-doctor.mjs" <project-directory>
node "$SKILL_ROOT/tools/bundle-tracker.mjs" <project-directory>
```

Score categories consistently: SEO + AI visibility, Security, Code Quality, and Bundle Size. If a tool cannot run, mark that category as FAIL and exclude it from the overall average instead of hiding the failure.

## Safety

This skill is read-only unless the user asks to fix findings. Do not deploy, commit, or push from this skill.

## Portable Scorecard Contracts

Use this section when `/ship` needs to combine specialist checks without relying on runtime-specific worker names or tools. Each category may run sequentially or concurrently, depending on the assistant environment.

### Required Categories

- SEO: use the SEO audit contract and preserve SEO/GEO/AEO scores.
- Security: use the security audit contract and block release on critical issues.
- Secrets: run the bundled secret scanner and require zero high-confidence leaks.
- Dependencies: run the dependency doctor and package-manager audit where supported.
- Migrations: run the migration checker for ORM-backed projects.
- Bundle: run bundle tracking for frontend projects with a build artifact.
- Static performance: run the code profiler for backend or server-heavy projects.

### Optional Categories

- Browser verification: run when a local or deployed URL is available and browser automation is installed.
- Lighthouse-style performance: run only when the repository already provides a working command or the environment has the needed browser tooling.
- API smoke test: run when API routes or an OpenAPI document are discoverable.

### Browser Verification Contract

1. Detect an application URL from explicit input, running dev server output, or common local ports.
2. Load the homepage and two or three high-value routes.
3. Record navigation errors, console errors, visible server error pages, and broken core interactions.
4. If browser automation is unavailable, return `SKIP` with the missing capability instead of failing the release.

```json
{
  "category": "browser",
  "result": "PASS",
  "routes_checked": [],
  "console_errors": [],
  "findings": [],
  "skipped": []
}
```

### Performance Contract

1. Prefer repository-provided performance commands when present.
2. Use bundle size and static profiling as fallback signals.
3. Treat missing Chrome, missing Lighthouse, or unavailable browser tooling as skipped unless the user explicitly required that check.

```json
{
  "category": "performance",
  "score": 100,
  "findings": [],
  "skipped": []
}
```

### Release Gate

- Block on critical security findings, verified secret leaks, failed build, failed tests, failed migrations, or production-blocking browser failures.
- Warn on SEO, bundle, content, or performance regressions unless the user has set stricter release criteria.
- Include skipped checks with reasons so the report is honest about coverage.
