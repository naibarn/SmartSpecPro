# Cloudflare GitHub deployment bootstrap

The `Cloudflare runtime deployment` workflow uses the existing Worker and the pinned source revision. It does not create a Worker, route, Queue, Container, VPC, or Hyperdrive resource. Staging is a separate `workers.dev` Worker. Production promotion changes the active version weights of the existing `smartspec-cloudflare-runtime` Worker only; it never creates or edits routes.

## One-time GitHub environment setup

Create the GitHub Environments `cloudflare-staging` and `cloudflare-production`. Configure each separately:

| Environment | Secret | Variables |
| --- | --- | --- |
| `cloudflare-staging` | `CLOUDFLARE_API_TOKEN` | `CLOUDFLARE_ACCOUNT_ID`, later `CLOUDFLARE_STAGING_BASELINE_DEPLOYMENT_ID` |
| `cloudflare-production` | `CLOUDFLARE_API_TOKEN` | `CLOUDFLARE_ACCOUNT_ID`, later `CLOUDFLARE_PRODUCTION_BASELINE_DEPLOYMENT_ID` |

Use separate, account-scoped tokens for the two environments. Grant the token only Workers Scripts Read and Write (the Cloudflare Workers Editor role for the target account). The workflow refuses to create a missing Worker; Workers Admin is not required unless an administrator separately decides that a staging Worker must first be created. It does not edit routes, so do not grant Workers Routes Write. It does not create or mutate Queue/Container resources.

The Cloudflare account administrator creates the token in Cloudflare and enters it directly into the matching GitHub Environment secret. Never paste it into Codex, a repository file, workflow input, issue, or log. `CLOUDFLARE_ACCOUNT_ID` is a GitHub Environment variable, not a secret. The token is checked against the account ID and the exact Worker name before any deployment action.

After configuring the secrets and account variables, run the workflow on `main` with `inspect-staging` and `inspect-production`. These actions are read-only and publish the exact active deployment IDs and traffic weights to each workflow summary. Copy the respective active deployment ID to the matching `*_BASELINE_DEPLOYMENT_ID` variable. If either Worker is absent, stop; do not change the workflow to create it implicitly.

## Staging and production

Run `staging` to build the pinned commit, upload a Worker Version, promote only the staging Worker, and test liveness, Worker readiness, public evidence-key metadata, and the anonymous session route's `cloudflare-container` runtime marker. If deployment or verification fails, the workflow restores the exact previous staging traffic split and leaves the run failed.

Run `production` only from `main`. It requires the exact input `DEPLOY_SMARTAIHUB_PRODUCTION`, a successful staging job from the same source SHA, a matching production baseline deployment ID, and the `cloudflare-production` environment credential. The workflow uploads a version without activation, promotes that exact version to 100% of the existing Worker, verifies live health/readiness and that the session route is served by the Cloudflare Container, and automatically restores all previously active version weights if post-promotion verification fails. Routes remain untouched. The workflow does not prove authenticated tenant, billing, or queue parity; those require the existing synthetic acceptance receipts and remain separate migration gates.

For an explicit recovery, choose `rollback-production`, provide the exact prior deployment ID from a workflow summary, and type `ROLLBACK_SMARTAIHUB_PRODUCTION`. The workflow reads that deployment's immutable version weights from Cloudflare, restores them, and verifies provider readback. Do not guess a version or deployment ID.

## Current configuration limitation

The checked-in `apps/cloudflare/wrangler.staging.jsonc` intentionally has `CLOUDFLARE_ACTIVATION=disabled` and no Container, Hyperdrive, Queue, or Durable Object bindings. Consequently `/readyz` cannot pass and the staging smoke test will fail closed; if a staging version was already promoted, it is rolled back. Production is skipped unless staging passes. Do not weaken the smoke test or set a readiness variable to make it green. The existing account-specific binding/profile and synthetic acceptance configuration must first be supplied through the already-authorized Cloudflare target configuration; this workflow does not infer or create those resources.

The Cloudflare build runs Vite without its broad `public/` copy, then uses `apps/cloudflare/scripts/prepare-worker-assets.mjs` to copy browser assets and validate the result. It omits downloadable artifacts under `releases/` and hidden source maps from Worker static assets, fails on any other file over 25 MiB, and verifies the HTML entry point, referenced JS/CSS bundles, and favicons. Hidden source maps are staged into a separate two-day GitHub Actions artifact, not the public asset bundle. The source release artifacts are not deleted. Current in-app release catalogs use the existing `/api/workers/runtime-pack/download/...` and `/api/desktop-releases/.../download` routes; those routes remain unchanged. Runtime and desktop downloads still rely on their existing origin/storage delivery and have not all been verified from R2. Direct `/releases/...` static-file access is not part of the current app catalog contract.

The verified local Cloudflare package currently contains 856 Wrangler assets; its largest static asset is `images/hero-gradient.png` at about 6.28 MiB, below the 25 MiB limit. Runtime archives in source range from 52.11 MiB (Hermes macOS) up to about 4.28 GiB (HyperFrames WSL2). The release inventory is added to the workflow summary by the preparation script. This resolves the oversized-asset packaging failure, not the artifact storage migration: the repository has R2 storage integration, but no production R2 bucket/public delivery path for these exact artifacts was read back in this session. Binary publishing remains independent of website deployment.

The deployment version API changes version traffic only. Cloudflare routes are a separate setting. This is why the workflow can promote/rollback an existing Worker without requiring DNS or route-write permissions, and why a successful Worker deployment must not be reported as full native-runtime cutover by itself.
