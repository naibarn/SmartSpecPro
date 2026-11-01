# Cloudflare migration compute decommission — 2026-11-01

## Authority and intent

The owner explicitly requested removal of application Containers and migration Workers to stop unnecessary spend, retaining Vector DB, R2 and dependencies genuinely needed by Debian. Cloudflare application migration is deferred until the replacement is complete. This is decommissioning of provider runtime resources, not source-code deletion, cancellation of SPEC-311, or deletion of canonical application data.

Account: `f3fb0b6858e186fcc36be105bfa00243`. Scoped tenant/project: `tenant-ZCSKEM9s` / `44fb79ed-8d65-41b0-b04e-97f4b139430b`.

## Dependency and data-retention audit before changes

- Provider inventory found three migration Workers, four bounded application Containers and four associated Durable Object namespaces. All Container instances were inactive (zero active/starting) before deletion.
- Shared database audit found no nonterminal `cloudflare.*` canonical jobs. All three migration Queue metrics showed zero backlog; Queue reference checks passed again immediately before deletion.
- The Cloudflare-managed Workflow had zero instances in all listed states. It was experimental Cloudflare infrastructure, not a call to the prohibited legacy application workflow engine.
- Durable Object namespaces belonged only to the removed Node/Python application Container classes; their lifecycle/budget state was disposable. Application user/session/job/history data remains in canonical PostgreSQL. No R2 object, Vectorize record, database row representing customer data, or saved encrypted credential/configuration was deleted.
- Production `smartaihub.app/*` was still attached to the production Worker in protected Linux-origin-bridge mode. Its unchanged DNS CNAME targets tunnel `191d047e-674a-48f4-b105-b37269c2dad6`; the actual local cloudflared ingress already maps `smartaihub.app` to `http://localhost:3000`. Direct Debian health, auth bootstrap and login-page checks all returned 200 before the route was detached.
- Vectorize provider source uses the direct Cloudflare API; the three removed Workers had no production Vectorize binding. R2 uses retained direct storage integration. The unused/disposable Cloudflare search-cache setting was changed from `cloudflare_kv` to the existing supported `disabled` value before removal; the inspected namespace was empty.
- Runtime process flags showed Cloudflare hard-cutover was not enabled for Linux web/Node worker. Existing canonical PostgreSQL-pull job execution remains available. `aimarkethubs.com` returned 200 before changes.
- GitHub migration deploy workflow had no active run in the inspected recent history and was disabled to prevent accidental recreation. The separate local-readiness test workflow remains available; it does not allocate provider runtime resources.

## Executed resource removals

| Application | Provider ID | State before removal |
|---|---|---|
| smartspec-production-55e4a9dcc9d9-python-http | ada1f22a9e14436a84e22eff880f80de | 0 active / 0 starting |
| smartspec-production-55e4a9dcc9d9-node-http | 1daccc404ea04ed4a4bba93e340007cb | 0 active / 0 starting |
| smartspec-staging-55e4a9dcc9d9-python-http | c0a44c7bf54d435bb95e8275b8ad30b8 | 0 active / 0 starting |
| smartspec-staging-55e4a9dcc9d9-node-http | 79c1a4d43bbb4f92a930672659ee4ddd | 0 active / 0 starting |

All four Container application deletions returned provider success. Then:

- Detached exact route `fc7ac6d3e32d464792a7161cd247a19b` (`smartaihub.app/*`) after verifying the original Debian tunnel DNS. DNS was not repointed.
- Detached migration-only custom Worker domain `runtime.smartaihub.app`.
- Deleted Workers `smartspec-cloudflare-runtime`, `smartspec-cloudflare-staging`, and `smartspec-production-55e4a9dcc9d9-candidate` without forced reference bypass. Associated Durable Object namespace inventory became empty.
- Deleted empty Queues `smartspec-canonical-job-queue-production`, `smartspec-canonical-job-queue-production-dlq`, and `smartspec-staging-55e4a9dcc9d9-jobs`.
- Deleted unused Hyperdrive configurations `db6b46010af44ad381dd6e3e2674913a` and `d89e708095da4a9cb85ae04a8522d00f`.
- Deleted migration Workflow `smartspec-staging-55e4a9dcc9d9-workflow`, empty KV namespace `SEARCH_RESULT_CACHE`, and two migration-only VPC database service registrations. The shared Debian tunnel and DNS remain intact.
- Disabled the existing production and staging deployment-target records via the existing scoped server-side target authority service. No new approval/grant system or authenticated HTTP session was created.
- Disabled GitHub `.github/workflows/cloudflare-deploy.yml` through its existing workflow state control; source configuration and saved credentials remain preserved.
- Deleted all 35 migration image tags across the Node/Python repositories using the installed Wrangler image-delete command with the exact reviewed repository/tag list. Every deletion exited successfully; final registry image list contained only the table header and no images. Historical image digests in saved receipts are no longer deployable artifacts.

## Provider readback

Observed at `2026-11-01T01:11:58.078Z`: Workers, Container applications, Durable Object namespaces, Queues, Hyperdrive configurations, managed Workflows, KV namespaces, migration VPC service registrations, Worker custom domains, and zone Worker routes were all empty.

Preserved R2 buckets: `smartspec`, `smartspec-staging-55e4a9dcc9d9-media`, `smartspecpro`.

Preserved Vectorize indexes: `smartaihub-agent-memory-v1`, `smartaihub-knowledge-v1`, `smartaihub-library`, `smartaihub-media-v1`, `smartspec-staging-55e4a9dcc9d9-vectors`.

No storage-content deletion or database credential rotation was performed.

## Recovery and financial limitations

Historical provider IDs, application-image receipts and runtime configurations are retained for provenance, but removed resources no longer form a valid rollback/readiness baseline. An eventual explicitly resumed live phase needs inventory reconciliation, fresh scoped provisioning where actually necessary, new resource identities/receipts, and a newly verified rollback baseline; never silently reactivate from stale checkpoints. Source remains available in Git and the current Debian release is untouched.

This removes the audited compute/routing resources and registry artifacts; it is not a claim that the Cloudflare bill is zero. Retained R2/Vectorize usage, account subscriptions and previously accrued charges may remain. Subscription readback returned 403 because the connected credential lacks Billing Read; no subscription was blindly cancelled because it may support retained services.



## Live verification (quick / integration operations profile)

2026-11-01T01:13Z, source c93cb3894b01827e853bb171f17fa1a5c426c24d; fresh available memory 23,392 MiB. Both deployment targets read back `enabled=false`, the cache setting read back `disabled`, no active Cloudflare migration job remained, and GitHub deployment workflow read back `disabled_manually`.

Public GET `/healthz`, `/trpc/auth.me` and `/login` returned 200 for both `smartaihub.app` and `aimarkethubs.com`; Worker-ingress/application-runtime proxy headers were absent. Direct local Debian probes also returned 200 before route removal. Linux web, Node worker and cloudflared services remained active. These are availability and routing checks, not a claim of an authenticated browser login/email-delivery test.

Scoped Spec handoff validation and eight-section document validation passed. No application source change, service release/rebuild, repository-wide local typecheck, schema migration, canonical job history rewrite or database credential rotation was needed.

Registry cleanup completed successfully: 35/35 tag deletions; final list empty. Provider garbage collection/billing settlement may be asynchronous; no zero-invoice claim is made.
