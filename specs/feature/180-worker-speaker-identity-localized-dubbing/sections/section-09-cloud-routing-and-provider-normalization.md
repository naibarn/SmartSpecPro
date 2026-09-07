# Section 09 — Cloud Routing and Provider Normalization

Read `../contracts-v2.md` before implementation. Depends on: 01, 04.

## Implementation and proof

- Ownership targets: apps/web/server/services (new unified audio orchestrator/cloud adapters), existing ttsService.ts normalization and existing Python cloud gateway. Shared contracts belong to section 01.
- Retain existing cloud providers and callers; route by exact registered capability. One configured cloud TTS adapter is mandatory for Release A, independently of local adapter availability.
- Normalize binary response into managed audio with actual decode/probe duration, metadata, timestamps origin and provider usage; preserve existing API consumers.
- Implement local_only/cloud_only/prefer policies, immutable selected binding snapshot, budget/rights/privacy checks and cloud external request reconciliation.
- Never claim local jobs as cloud jobs or forward cloud credentials to Worker. Avoid generic arbitrary endpoint configuration.
- Tests: exact routing/voice binding, local-reference cloud rejection, expired preflight, provider rate-limit/timeout/unknown outcome, duplicate delivery, upload-only retry, actual PCM/WAV/MP3 duration and credit settlement.
- Exit: same approved utterance contract produces a managed cloud result consumable by section 05; explicit cloud-only unavailable path fails truthfully.

## User-facing acceptance

Use existing Thai-primary component patterns and the responsive/accessibility matrix in `spec.md`. Show ready, unavailable, running, partial, canceled, error and success with exact provider/target and repair action. No hidden generation or fallback. Test keyboard navigation, privacy/cost disclosures and persisted state on navigation.

## Expanded lifecycle dependency

Read ../voice-lifecycle-v2.md and sections 11/12. Validate reference-only vs transcript-required vs trained modes separately. Existing inference readiness cannot authorize training. Release evidence must distinguish A/B/C/D and must cover profile API lifecycle, transitive rights and rollback where enabled.
