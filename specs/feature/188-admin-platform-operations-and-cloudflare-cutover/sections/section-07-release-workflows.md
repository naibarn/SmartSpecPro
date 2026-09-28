# Section 07 — Release Workflows and Repository Controls
+## UI/UX Contract

### Target User / JTBD

- N/A — CI/release workflow and artifact identity only; operators use runbooks and section-06.

### Existing Pattern Reference

- N/A — no browser product surface is changed.

### Surface Inventory

- N/A — GitHub workflow files and manifests are not in-product UI.

### Component Map

- N/A — no client component is introduced.

### State Matrix

- N/A — workflow states are verified by CI dry-run tests and shown through evidence.

### Responsive Matrix

- N/A — no browser layout is changed.

### Accessibility Acceptance

- N/A — no user-facing markup is introduced.

### Copy Contract

- N/A — workflow messages are not an in-product copy surface.

### Browser Evidence Required

- N/A — browser evidence is owned by section-06 and final integration.

## Scope

Keep the existing GitHub repository as the source of immutable code and define
Cloudflare staging/production release workflows with environment approval,
OIDC, artifact identity, target binding checks, and rollback image retention.

## Ownership paths

- .github/workflows/deploy-cloudflare-staging.yml:
  non-production build/deploy/probe workflow.
- .github/workflows/deploy-cloudflare-production.yml:
  protected production deployment and evidence handoff.
- .github/workflows/feature-188-gates.yml:
  static audits, manifest validation, test matrix, and dry-run gates.
- apps/cloudflare/package.json and wrangler.jsonc are consumed from section-04
  as the Worker build and binding inputs; this section owns only their release
  workflow integration.
- ops/feature-188/environment-contract.yaml is consumed from section-03 as the
  non-secret environment/topology contract.
- ops/feature-188/release-manifest.schema.json:
  immutable release identity schema.
- ops/feature-188/promotion-manifest.schema.json is consumed from section-03 as
  the data evidence schema for release gates.

## Repository and identity policy

Continue using naibarn/SmartSpecPro. Protect main with required checks and
reviewers. Configure development, staging, production, and emergency-rollback
GitHub Environments with branch policies and production approval.

Use short-lived OIDC identities with trust restricted by repository, branch,
workflow, and environment claims. Use separate Cloudflare staging/production
identities and a separately protected GCP rollback identity. No long-lived
cloud credential, database URL, secret, or .env file is committed.

Every release manifest includes commit SHA, Worker bundle digest, container
image digest, schema version, adapter contract version, promotion manifest
digest, gate bundle digest, target identity, and retention/rollback window.
Container images and other rollback artifacts remain available for that window.

## Workflow sequence

1. Install with repository package manager and run changed-path plus contract
   tests.
2. Build shared contracts, web app, and Cloudflare Worker package.
3. Validate environment, release, promotion, and job-family manifests.
4. Run static/generated-bundle legacy audits and security scans.
5. Deploy non-production Cloudflare bindings with staging OIDC identity.
6. Run Hyperdrive target-identity, adapter contract, synthetic, and smoke
   checks against isolated targets.
7. Publish evidence bundle keyed by immutable release identity.
8. Require production environment approval before production deploy/activation.
9. Re-run target identity, migration schema, and rollback artifact checks.
10. Hand off to the cutover control plane; workflow cannot open traffic by
    itself without the durable activation intent and required reviewer gate.

Database provisioning, secret binding, data promotion, and final activation are
separate reviewed operations. Workflow dry-run must not create a database, copy
secrets, call a paid provider, or activate production traffic.

## TDD stubs

- YAML/schema tests verify environment names, required checks, approvals, OIDC
  permissions, and no plaintext credentials.
- OIDC trust tests verify repository/branch/workflow/environment subject claims.
- Release manifest tests verify all immutable digests and target identity.
- Artifact retention tests verify rollback images remain available.
- Dry-run test proves workflow does not provision, copy, activate, or invoke
  irreversible side effects.
- Cloudflare workflow test verifies activation consumes a platform outbox intent
  and settles by stable dedupe key.

## Acceptance

The same repository produces traceable immutable artifacts, production actions
require environment approval and OIDC identity, and workflows cannot bypass
platform gates or perform unreviewed data/credential/traffic operations.
