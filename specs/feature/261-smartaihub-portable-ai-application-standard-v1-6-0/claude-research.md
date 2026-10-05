# Spec 261 Phase A Research

## Research decision
- Codebase: yes; existing pnpm TypeScript monorepo. SocratiCode `codebase_status`/search/symbol tools are unavailable, so targeted shell discovery was used as the documented fallback.
- Web research: skipped. Phase A must implement this repository's Spec 261 contract; external changing technical facts are not needed to choose local package patterns.
- Testing: focused Vitest suites are available in `apps/web`; TypeScript packages use ESM and package-local source/tests. Root instruction forbids `npm run typecheck`; do not run repository typecheck.

## Relevant codebase patterns
- Root package manager is pnpm 10.4.1 with `packages/*` and `apps/*` workspaces; use pnpm and avoid npm workspace operations.
- `packages/shared` is ESM TypeScript but intentionally dependency-light. `packages/skills` already uses `js-yaml` with `JSON_SCHEMA`; parser pattern is in `packages/skills/src/parser.ts`.
- Zod is already used in workspace packages and `apps/web`; SHA-256 uses Node `crypto` in existing TypeScript code. Vitest is configured in `apps/web/vitest.config.ts`.
- Keep the new package core independent of app routers, persistence, network providers, runtime execution and UI. The validator is a pure package-level boundary.

## Normative source map
- `spec.md` §6–7: package layout and authoritative `app.manifest.yaml` contract.
- §8–26, §41–45, §57–59, §62, §68–79 plus later amendments: component/dependency/extension compatibility, security, digest/lock, canonicalization, runtime-independent semantics, data/privacy, and export requirements.
- §46: V1–V8 validation stages; §47: package validation test expectations.
- §81 Phase A: schema, parser, validator, canonical in-memory model, package digest, dependency graph validation, secret scanning.
- Latest amendments require explicit feature negotiation and fail-closed handling for unsupported required/security-critical features and extensions; optional unknown extensions may be preserved only under safe omission semantics. Digests must be deterministic and exclude non-package secrets; validation must not execute package content.

## Safety and scope boundaries
- Implement Phase A only. No registry/lifecycle persistence, APIs, migrations or Spec 224 Final Verify integration.
- Do not reactivate retired Agency, `/workflows` custom engine, `workpacks/*`, OpenSandbox or Docker dispatch. A package path named `workflows/` is inert package content and must never be loaded/executed by this work.
- Treat manifest/package bytes as untrusted input. Bound parser/scanner resource use, reject duplicate/ambiguous YAML keys, prevent path traversal/symlink escape, do not expose matched secret values, and use stable machine-readable validation codes.
- Never log or return secret contents; secret scan findings identify file/path and rule only.

## Test design context
- Use focused tests co-located with the new package, following Vitest and existing repo TypeScript/ESM conventions. Cover acceptance, rejection, invariants, cross-platform deterministic digest vectors, resource/path safety, and error-code stability.
- Run only package-scoped tests and lightweight validation. Do not run repository-wide typecheck/build or broad E2E.
