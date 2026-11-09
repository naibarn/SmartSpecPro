# Section 04 — Worker proof and canonical handoff

## Objective and requirement mapping

Prove the first auth slice compiles and runs in the same Hono Worker handler locally, preserve target safety, and record only evidence that actually exists.

**Canonical requirement:** `REQ-46847581892C` (implementation/check evidence only; full parent acceptance remains open).

## Owned scope

- `smartaihub-platform`: Core package tests/config/docs needed for package proof.
- SmartSpecPro: new evidence under `specs/feature/312-smartaihub-modular-saas-rebuild-master-plan/handoff/evidence/` and updates made only through the existing `tools.spec_handoff` writer to the manifest/requirement ledger.
- Do not edit generated `handoff/STATUS.md` or unrelated dirty workspace paths.

## Prerequisites

Sections 01–03 are implemented and their focused checks pass. Refresh each repository's canonical `main` before its checkpoint and stage only owned paths.

## Acceptance and verification

- Run `corepack pnpm@10.4.1 test:core`, `corepack pnpm@10.4.1 typecheck:core`, `corepack pnpm@10.4.1 build:core`, and a local `dev:core` HTTP smoke test using `wrangler dev --local`.
- Pin Wrangler/workers-types to compatible releases and set the compatibility date to a date supported by the bundled Workerd runtime; local workstation timezone may be ahead of the UTC release date.
- Inspect bundle/import closure for no Express or `apps/web` runtime dependency; preserve liveness JSON.
- Run a local workerd smoke through the actual Durable Object binding, including persistent counts across repeated calls and restart, verify bounded shard names and expiry cleanup, and confirm only the local Modular development class migration is configured.
- If the development DB role exists, verify database/role identity and grants catalog-only, and confirm no DDL. Do not select or print real user data. Otherwise state the exact live credential proof gap.
- No Cloudflare deploy, remote mode, public target, DNS/resource creation, port-3100 handover or production secret provisioning.
- Record source SHA, commands, outcome, DB identity/grant evidence if collected, and remaining real-user/target/production acceptance gaps through existing canonical handoff tooling. The parent requirement remains OPEN unless its complete acceptance evidence is actually met.

## Integration and rollback

Integrate each coherent source commit through canonical `smartaihub-platform/main`; verify local and fetched `origin/main` match before the next section. Commit SPEC handoff evidence separately on SmartSpecPro's canonical `main` while preserving the user's other dirty files. Source rollback is a scoped revert; target traffic remains unchanged.

## Blocker strategy

Repair fixable package/workerd failures and rerun the focused checks. If a DB role or real test account cannot be safely/legitimately used, continue code proof and keep live-user acceptance open. Never mark deployment, UAT, real-user login, or production separation as PASS without direct evidence.
