# SmartSIHub R1.4 source placement and delivery model

**Source archive:** `SmartSIHub_Modular_SaaS_SPEC_312-324_Ten_Pass_Reviewed_R1.4.zip`
**SHA-256:** `bbcc372f12aac54fd14f3ae6fd2aa850257a12263bd09d06dd75460343192018`
**Status:** Canonical Specs are integrated. The private application repository is bootstrapped with a tested local Core liveness slice; no domain deployment is claimed.

## Canonical file ownership

- SPEC-312 through SPEC-324 live once under `specs/feature/`; their canonical handoffs live beside each Spec. Do not copy these Specs into the new application repository or a second feature-spec catalog.
- R1.4 roadmap, mission, and work-package references live under this directory. Architecture decisions, review evidence, templates, and mockups live in their existing repository-wide `docs/` categories.
- Relative links were adjusted where the canonical Spec and documentation destinations differ from the source archive. The external source package remains unchanged as provenance.
- The new application repository references each canonical Spec by ID, semantic ID, and approved source SHA. It does not vendor another copy of the normative Spec files.

## Recommended application repository

Use the private [`naibarn/smartaihub-platform`](https://github.com/naibarn/smartaihub-platform) repository, with a single workspace dependency graph and independently buildable applications/modules. The initial checkpoint is `7456bbe549050473543acbec2b9094d95e5a2e95` on `main`:

```text
apps/
  saas-core/          # Hono + TypeScript Worker
  saas-shell/         # React + TypeScript account/application shell (future slice)
  public-website/     # Astro public site and marketplace (future slice)
modules/
  chat/
  miniapp-creator/
  ...                 # first-party modules, independently versioned
packages/
  saas-contracts/
  module-sdk/
  ui-primitives/
  db-contracts/
pnpm-workspace.yaml
pnpm-lock.yaml        # one JavaScript dependency lockfile
turbo.json
```

Each app/module has its own `package.json` and release configuration, but dependencies are declared and locked once at the repository root. Add the Rust supervisor as its own Cargo workspace and lockfile only when that implementation slice begins. Use package-filtered checks/builds so a Chat change does not build or restart Core, the public site, or the legacy app. Do not add a lockfile per workspace, copy `apps/web`, or import the legacy Node/Python runtime into the new Core.

The first `apps/saas-core` slice is Hono on Cloudflare Workers with `GET /livez`, a Vitest test, a package TypeScript check, and Wrangler's dry-run build. Local testing runs on port 3200. Root `pnpm-lock.yaml` is the only JavaScript lockfile; `pnpm-workspace.yaml` scopes build approvals to `esbuild` and `workerd` and ignores `sharp` build scripts. Use Corepack and the pinned pnpm version from the README for repeatable local checks.

## Deployment and environment boundaries

- Resolve every deploy by target ID through the canonical [`deployment-targets.json`](../../apps/web/scripts/deployment-targets.json); the new repository must not keep another domain-to-environment map.
- `aimarkethubs.com` is the development/UAT target only after the new Core is available on its reserved service/port 3200 and health-checked through the designated release path. The local Wrangler smoke check does not switch traffic. Preserve the currently serving port 3100 site until an intentional handover.
- `smartsihub.com` is the separate Cloudflare production target. Prepare Worker-compatible source and target-specific release artifacts, but keep production inactive until its existing release authority and target are provisioned.
- `NODE_ENV=production` selects optimized build behavior; it does not select production deployment.
- PostgreSQL `smartspec` remains the canonical Core identity, tenant, wallet, and job authority. New stateful Mini Apps use their own data plane. No duplicate wallet, identity, job ledger, or Mini App business database belongs in this repository.

The repository was created as private so implementation can proceed without prematurely publishing the source. No Cloudflare production target, DNS record, production Worker, or live traffic was activated or changed.
