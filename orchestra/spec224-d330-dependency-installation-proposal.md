# Spec 224 D3.30 — Dependency Installation and Source Closure Proposal

Status: proposal only. No manifest, lockfile, Cloudflare-owned file, or Spec 224 text was changed.

## Reproducible install findings

The requested clean-checkout command using pnpm 10.4.1 was attempted without editing manifests or lockfiles:

```sh
npm_config_package_manager_strict=false npm_config_manage_package_manager_versions=false \
  npx --yes pnpm@10.4.1 install --frozen-lockfile
```

It failed with `ERR_PNPM_OUTDATED_LOCKFILE`. The root `pnpm-lock.yaml` importer records `sharp: ^0.34.5`, while root `package.json` declares `sharp: ^0.35.3`; root `package.json` also declares `vite: ^7.3.6`, absent from the root lock importer. pnpm also reports that `apps/web/package.json`'s `pnpm.patchedDependencies` and `pnpm.overrides` are ignored when installation is run from the workspace root. These are concrete manifest/lock and configuration-scope mismatches.

The repository currently identifies root package management as `npm@10.9.8`, while `apps/web/package.json` identifies pnpm 10.4.1. Root npm lock, root pnpm lock, and app-level npm and pnpm lockfiles coexist. Workspace discovery includes `packages/*` and `apps/*`; local package dependencies are represented inconsistently (`@smartspec/shared: "*"` in db/skills/ui and `file:../../packages/...` in web), so a single canonical workspace install contract is not established.

## Ownership and proposed changes

| Path / concern | Evidence and scope | D3.30 action |
|---|---|---|
| Root `package.json`, `pnpm-workspace.yaml`, root `pnpm-lock.yaml` | Controls all workspaces, including `apps/cloudflare`; the lockfile necessarily resolves Cloudflare workspace dependencies too | No edit. Requires workspace/Cloudflare owner handoff before changing package manager, workspace protocol, root pnpm config, or regenerating the lockfile |
| `apps/web/package.json` | Web dependencies and pnpm config; pnpm config is currently nested where root installation ignores it | No edit. Propose moving effective pnpm settings to the authorized workspace root together with lock regeneration, after owner handoff |
| `packages/db/package.json`, `packages/skills/package.json`, `packages/ui/package.json` | Shared workspace package manifests; local `@smartspec/shared` dependency uses `*` | No edit. Propose `workspace:*` only after package owners confirm the workspace contract |
| App-level `apps/web/package-lock.json` and `apps/web/pnpm-lock.yaml` | Duplicate lock sources alongside root lockfiles | No edit. Owners must choose and document the single supported install entry point before deleting or regenerating either lock |
| `react-helmet-async@2.0.5` / React 19 | Registry peer metadata for 2.0.5 declares React `^16.6.0 || ^17.0.0 || ^18.0.0`; React 19.3.0 is outside that declared range | No force/override or downgrade. Adopt React 19 metadata APIs or select a package with declared React 19 support, then validate affected Helmet usage and approve the migration |

Recommended reproducibility resolution, after handoff: choose one root package manager/version; put all pnpm settings at workspace root; use explicit workspace links for local packages; designate one canonical lockfile per install entry point; regenerate only within the owning workstream; and prove a clean frozen install for the supported environment matrix.

## Source closure status

WP-SOURCE-03 already traces local static imports, literal dynamic imports, workspace exports, and npm/pnpm/uv lock dependency graphs. The D3.30 change makes external package limitations explicit in every external identity: artifact bytes are not captured, lockfile integrity has not been verified against those bytes, and install-hook status is either declared-present or unknown without the artifact. The assembler rejects contradictory claims. Therefore external packages remain outside the source bundle and closure remains fail-closed.

External artifacts still missing for complete closure include the actual package archives (or an immutable equivalent), cryptographic verification of each archive against lock metadata, platform-specific optional dependency selection, and executable lifecycle/install-hook contents and behavior. Lockfile hashes alone are metadata evidence, not proof that the source bundle contains or verified the corresponding package bytes.

## Evidence

- Clean isolated checkout at Source HEAD `1af88d72b46f11393f88bad4a88ca8fb32810b84`; `pnpm@10.4.1 install --frozen-lockfile` failed with the root importer mismatches above.
- Registry peer metadata confirms `react-helmet-async@2.0.5` does not declare React 19 compatibility. No override, force, or React downgrade was applied.
- Source Bundle Vitest suite: 9/9 passed after the fail-closed metadata change.
- Recovery suites rerun from Recovery HEAD `7027a95facf845cc691c3044834dabf82f6c9310`: 16 Web tests passed and 10 Python tests passed; 2 legacy Python placeholders skipped. This is 26 passed rather than the requested label of 21; no arbitrary test selection was made to force the count.
- TypeScript typecheck: `SKIPPED_POLICY` under repository `AGENTS.md`.
- No Spec 224 text or Specs 1–213 were edited. No branch was merged or cherry-picked.

## Gate status

- P-SOURCE: `BLOCKED` for full external dependency closure; local discovery and fail-closed behavior are verified.
- P-RECOVERY: `BLOCKED` for production/release recovery claims; the local Recovery tests pass, but they do not constitute runtime or production evidence.
- Dependency installation reproducibility: `BLOCKED` until owners authorize and resolve the root manifest/lock/configuration contract.
