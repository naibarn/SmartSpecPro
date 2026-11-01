# SmartSIHub R1.4 source placement and delivery model

**Source archive:** `SmartSIHub_Modular_SaaS_SPEC_312-324_Ten_Pass_Reviewed_R1.4.zip`
**SHA-256:** `bbcc372f12aac54fd14f3ae6fd2aa850257a12263bd09d06dd75460343192018`
**Status:** Draft source imported for development; no application code or deployment is claimed.

## Canonical file ownership

- SPEC-312 through SPEC-324 live once under `specs/feature/`; their canonical handoffs live beside each Spec. Do not copy these Specs into the new application repository or a second feature-spec catalog.
- R1.4 roadmap, mission, and work-package references live under this directory. Architecture decisions, review evidence, templates, and mockups live in their existing repository-wide `docs/` categories.
- Relative links were adjusted where the canonical Spec and documentation destinations differ from the source archive. The external source package remains unchanged as provenance.
- The new application repository references each canonical Spec by ID, semantic ID, and approved source SHA. It does not vendor another copy of the normative Spec files.

## Recommended application repository

Use one dedicated `smartaihub-platform` Git repository, with a single workspace dependency graph and independently buildable applications/modules:

```text
apps/
  saas-core/          # Hono + TypeScript Worker
  saas-shell/         # React + TypeScript account/application shell
  public-website/     # Astro public site and marketplace
modules/
  chat/
  miniapp-creator/
  ...                 # first-party modules, independently versioned
packages/
  saas-contracts/
  module-sdk/
  ui-primitives/
  db-contracts/
executors/
  rust-job-supervisor/
pnpm-workspace.yaml
pnpm-lock.yaml        # one JavaScript dependency lockfile
Cargo.toml
Cargo.lock            # one Rust workspace lockfile, not pulled into JS builds
turbo.json
```

Each app/module has its own `package.json` and release configuration, but dependencies are declared and locked once at the repository root. Use package-filtered checks/builds so a Chat change does not build or restart Core, the public site, or the legacy app. Do not add a lockfile per workspace, copy `apps/web`, or import the legacy Node/Python runtime into the new Core.

## Deployment and environment boundaries

- Resolve every deploy by target ID through the canonical [`deployment-targets.json`](../../apps/web/scripts/deployment-targets.json); the new repository must not keep another domain-to-environment map.
- `aimarkethubs.com` is the development/UAT target only after the new Core is available on its reserved service/port 3200 and health-checked. Preserve the currently serving port 3100 site until an intentional handover.
- `smartsihub.com` is the separate Cloudflare production target. Prepare Worker-compatible source and target-specific release artifacts, but keep production inactive until its existing release authority and target are provisioned.
- `NODE_ENV=production` selects optimized build behavior; it does not select production deployment.
- PostgreSQL `smartspec` remains the canonical Core identity, tenant, wallet, and job authority. New stateful Mini Apps use their own data plane. No duplicate wallet, identity, job ledger, or Mini App business database belongs in this repository.

The source package proposes `smartaihub-platform` as a repository name, but no matching repository was found in the connected GitHub search. This document records the target structure; it does not create a remote repository, activate Cloudflare, change DNS, or move live traffic.
