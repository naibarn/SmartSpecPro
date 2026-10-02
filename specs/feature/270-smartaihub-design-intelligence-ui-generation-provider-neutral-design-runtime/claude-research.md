# Spec 270 Research

## Research decision

- Codebase research was required. SocratiCode is unavailable; targeted shell searches and a read-only scout were used.
- Current Stitch research was required. No credentials were inspected and no paid/live provider calls were made.
- Web tests use Vitest; schema work follows Drizzle. Never run repository npm run typecheck due to RAM policy.

## G0 and registry

- The Spec 270 directory/spec_id is unique in the searched specs/feature tree, but no canonical spec registry was found. Local uniqueness is not proof of external canonical reservation. Record this limitation in DesignIntegrationReconciliationRecord and do not create a duplicate registry.
- All proposed flags are default-off. Do not apply DDL, enable production behavior, or onboard credentials until relevant owner/schema/number/version facts are reconciled.

## Existing authorities and seams

- No generic CanonicalDesignArtifact, DesignBrief, DesignContextBundle, provider-neutral adapter, design decision/diff, or visual-verification persistence was found. Vertical Drama design context is feature-specific.
- Astryx 0.6.3 and theme integration exist. Capability and skill registries are server/services/capabilityRegistry.ts and skillRegistry.ts; map to Spec 256 rather than replace its authority.
- Spec 224 already owns DevelopmentRun, admission, persistence, evidence, and final gates. Add typed design references through these semantics; do not create another orchestrator/approval/deployment/job authority.
- Async provider/design jobs must use createControlPlaneJob in server/services/jobControlPlaneGateway.ts, registered server-owned types/executors, and canonical worker_jobs/outbox. The provider must not be selected by untrusted payload.
- Reconcile existing artifact/blob/outbox/credential/flag services before proposing new persistence or migrations.

## Provider facts

- Google's announcement describes Stitch as an experimental design tool with text/image input, iteration, and design/code export: https://developers.googleblog.com/stitch-a-new-way-to-design-uis/
- The current google-labs-code/stitch-sdk README documents API-key/OAuth auth, MCP, project/screen generation/edit/variants, HTML/screenshots, and disclaims official Google support: https://github.com/google-labs-code/stitch-sdk
- Keep Stitch optional and design-time only; require API/license/data-profile certification before adoption. Never execute imported HTML or send private project/brand data without explicit policy authorization.

## Security and evidence boundaries

- No provider credential is present in task context; none was inspected. No provider account, paid usage, or external transmission is verified.
- Preserve tenant/actor scope, LOCAL_ONLY/NO_EGRESS, prompt/secret minimization, asset provenance, cache partitioning, idempotency/cancellation/reconciliation, and existing billing/quota authority.
- Never route through Agency, work/request, Workpacks, /workflows, OpenSandbox, or Docker/OpenSandbox.
- Unit tests can prove contracts, fakes, tenancy and fail-closed behavior, not live provider, production billing, backup restore, production browser or release behavior.

## Candidate order

1. G0 owner/schema/number reconciliation; leave DDL/production enablement/provider onboarding closed until resolved.
2. Default-off flags and provider-neutral contracts.
3. Native no-provider artifacts and Astryx/product resolver.
4. Capability/action binding and Spec 224 checkpoint/evidence adapter.
5. Optional Stitch adapter after certification; then Mini App/core authoring surfaces and hardening.
