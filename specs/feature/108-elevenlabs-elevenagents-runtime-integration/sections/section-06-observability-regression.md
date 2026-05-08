# section-06-observability-regression

## Goal

Add observability, audit coverage, regression tests, rollout safeguards, and
final quality gates for Feature 108.

## Depends On

- section-03-backend-services
- section-04-api-callbacks
- section-05-chat-admin-ui

## Files Owned

- Relevant monitoring/audit service additions.
- Regression tests under existing router/service/component test directories.
- Any rollout or feature flag wiring that follows existing tenant flag patterns.
- Shared tenant feature flag definitions for a concrete `voiceAgents` flag.
- Documentation updates in the feature planning directory if implementation
  discovers provider caveats.

## Observability

Record structured logs/audits for:

- Config create/update/enable/disable/test.
- Session create/connecting/active/ended/failed/cancelled.
- Provider token request success/failure.
- SDK event ingestion failures.
- Transcript reconciliation success/failure.
- Tool callback received/denied/completed/failed.
- Credit reservation/settlement/release/failure.

Metrics should be added where existing monitoring patterns make this practical:

- Session start/success/failure counts.
- Average session duration.
- Transcript event count.
- Tool call count and success/failure.
- Provider error count.
- Reconciliation pending/failure count.

## Security Review Preparation

Because implementation adds a public callback route, new tRPC procedures,
credit handling, and transcript persistence, prepare for pre-merge security
review. Ensure evidence exists for:

- No API key in browser payloads.
- Signature/timestamp/replay validation.
- Tenant/user/session/provider conversation binding.
- Request size limits.
- Redacted admin views.
- Idempotent tool and billing operations.

## Regression Tests

Add or update tests proving:

- Existing Media Studio ElevenLabs TTS still creates media jobs.
- Existing ElevenLabs speech-to-text media job still creates transcript
  artifacts.
- WaveSpeed audio routing remains unchanged.
- Skill execution modes remain separate from voice-agent runtime.
- Existing media provider admin config still works with no voice-agent configs.
- Existing credit transaction idempotency behavior still passes.
- `voiceAgents` flag disabled hides admin and Chat surfaces and blocks tool
  bridge execution.

## Rollout

Use the existing tenant feature flag system and add a concrete `voiceAgents`
gate for:

- Admin config visibility.
- Chat voice panel visibility.
- Tool bridge enablement.

The flag must fail closed if tenant flag lookup fails.

Rollout order:

1. Internal hidden config/service deployment.
2. Internal Chat voice panel.
3. Transcript reconciliation shadow verification.
4. `chat.create_message` tool bridge.
5. Launcher skill.
6. Follow-on Team Room/Work OS hooks.

## Final Quality Gates

Run:

- `cd apps/web && pnpm check`
- Narrow `pnpm test` suites for schema, shared contracts, services, router,
  route, and UI tests.
- Existing media provider regression tests.
- Security-focused callback/tool tests.

If a full test suite is too slow, document narrow commands and residual risk.

## Acceptance

- Observability gives enough evidence to debug sessions and callbacks.
- Security-sensitive behavior has targeted tests.
- Existing media generation behavior is unchanged.
- Rollout can be disabled per tenant or feature flag.
- Rollout uses the concrete `voiceAgents` tenant flag.
