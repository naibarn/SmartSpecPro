# Implementation final review

## Implemented

- The `previewPromptExpansion` route now runs only the versioned
  `vertical-drama-prompt-expansion` skill with `execution_mode: llm-only`.
- Generic article routing, deterministic fallback text, copied-premise success,
  empty slots, and silent error-to-preview conversion were removed from this
  path.
- A real-run evidence contract is persisted in every successful preview:
  skill/version, provider, provider call id, model, attempt count, token usage,
  and `mocked: false`.
- The story treatment contract includes protagonists/backgrounds, meeting and
  inciting event, relationship progression, obstacles, central question, major
  conflict, turning points, climax, ending direction, assumptions, and
  exclusions. It remains a treatment layer and does not replace Draft scenes.
- Input is capped at 2,000 characters at the client and route. The client shows
  a live count and disables the action above the cap.
- Credit preflight, actual-token settlement, idempotency, tenant/user scope,
  migration preflight, stale hash/revision checks, and real-run lineage checks
  are enforced before Apply.
- Failures expose a typed reason and trace id; no partial preview or Apply
  button is rendered after a failed real run.
- The synchronous route has a 25-second per-attempt provider timeout and one
  schema repair maximum, keeping the worst-case request below the Cloudflare
  edge timeout. Proxy 524 HTML is normalized into a bounded retryable UI error.

## Focused proof

- `verticalDramaPromptExpansionService.test.ts`: 6 passed
- `verticalDramaPromptExpansionMigration.test.ts`: 4 passed
- `verticalDramaPromptExpansionSkill.test.ts`: 1 passed
- `CreateSeriesWizard.test.tsx`: 53 passed
- `CreateSeriesWizard.lineage.test.tsx`: 18 passed
- `VerticalDramaPromptExpansionDialog.test.tsx`: 2 passed
- esbuild syntax bundles passed for service, router, dialog, and live-smoke
  harness.
- `git diff --check` passed.

## Explicit release gate

The live provider smoke harness is implemented at
`apps/web/scripts/prompt-expansion-live-smoke.ts` and is opt-in because it
charges real credits. It was not executed in this workspace: no explicit
authenticated smoke user/tenant/provider run was supplied. Production release
should run it with `PROMPT_EXPANSION_LIVE_SMOKE=1` and record the emitted
provider/model/providerCallId evidence; no fixture or mock may be substituted.

## Incident evidence

The host journal showed the old route performing schema retries from 22:06:51
through 22:08:30, ending with missing `expandedPrompt` and `slots.required`.
This exceeded the public edge wait and explains the reported 524. The source
fix is local and tested; production activation was not run in this turn.
