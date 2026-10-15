# WP_SECURITY_BASELINE_DEPENDENCY_REMEDIATION

## Objective

Reduce production dependency vulnerabilities without weakening mandatory audit,
security, typecheck, integration, or runtime acceptance gates and without
mixing dependency changes into SPEC-308 or PR #403.

## Source and ownership

- Repository: `github.com/naibarn/SmartSpecPro`
- Canonical ref: `origin/main`
- Discovery SHA: `aae75ee4a18574fa67421a7688f28f7ce8adc715`
- Implementation owner / sole manifest and lockfile writer: primary Codex session
- Analysis: read-only parallel reviewers for proxy-addr, HTTP/SSRF, and upload/media/editor
- Branch: `codex/security-baseline-dependency-remediation-20261009`
- PR: not created yet

## Scope

Audit production dependency advisories by package, severity, dependency path,
directness, patched version, runtime exposure, and compatibility. Prioritize
Critical then High. Verify each candidate package update in a small isolated
set and run affected regression tests. Keep dependency remediation separate
from SPEC-308 and MCP CI fixture work.

## Safety boundaries

- Never use blind `pnpm audit --fix` or mass overrides.
- Only the primary owner may edit manifests or `pnpm-lock.yaml`.
- Preserve mandatory security gates; no advisory suppression or policy changes.
- No production secrets, production deployment, or live runtime mutation.
- Do not alter PR #399/#403 worktrees or the uploaded SPEC-308 files in the primary checkout.

## Completion predicate

For each advisory, record package/version, severity/advisory ID, affected range,
production dependency path, direct/transitive status, fixed version, runtime
exposure, compatibility evidence, chosen remediation, focused tests, and exact
SHA evidence. Re-run the mandatory full production audit and affected tests on
the final PR SHA. Unresolved patched-version compatibility requires a documented
decision and named owner approval. Keep the WorkUnit open while any applicable
gate or external authority is pending.

## Current baseline

- PR #403 CI run `37897633316` ran `pnpm audit --prod --audit-level=high` and
  reported 85 advisories: 1 Critical, 38 High, 37 Moderate, 9 Low.
- Critical `proxy-addr@2.0.7` is reached via `apps/web > express@4.22.2` and
  `apps/web > swagger-ui-express@5.0.1 > express@4.22.2`; patched range starts
  at `2.0.8`.
- `origin/main` and PR #403 have identical `package.json` and `pnpm-lock.yaml`
  SHA-256 values at discovery, so PR #403 does not contain dependency remediation.
- A fresh `pnpm audit --prod --json` completed on the exact `origin/main`
  manifests/lockfile with exit 1 due to findings and the same 85-advisory
  summary as CI. Full output is represented in `advisories.json`.
- Prior `pnpm audit --fix --prod` experiment proposed 66 overrides, including
  cross-major changes; those changes were restored and are not part of this work.

## Progress

See `progress.md` and `advisory-ledger.md`.

## Current checkpoint

- Remediated the single Critical advisory with narrow `express>proxy-addr:
  2.0.8`; Express remains 4.22.2.
- Isolated Express/proxy-addr behavior checks passed; repository Vitest
  regression awaits CI because this isolated worktree has no project
  `node_modules`.
- Post-change production audit: 84 advisories, 0 Critical, 38 High, 37
  Moderate, 9 Low. This is partial progress, not security-baseline closure.
- Separate dependency-security PR is pending creation after fast-gate review.
