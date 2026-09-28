# Plan self-review — round 1

Date: 2026-08-30

## Phase A checklist scorecard

| Category | Score | Result |
| --- | ---: | --- |
| Structural integrity | 5/5 | Pass after naming the prompt-job service, route-assurance boundary, and concrete stop procedures. |
| Completeness versus synthesized spec | 6/6 | Pass: role separation, optional stop flow, handoff, long-prompt boundary, persistence, CAS, media authorization, video mapping, UI, tests, rollout, and rollback are covered. |
| Implementability | 6/6 | Pass: files, procedure names, ordering, test commands, and no-migration compatibility path are explicit. |
| Internal consistency | 5/5 | Pass: `frameRole`, `start`/`stop`, `approvedStopFrameAssetId`, stale separation, and existing bridge flag use the same names throughout. |
| Edge cases and failure modes | 5/5 | Pass: malformed/truncated LLM output, model-limit overflow, stale writes, concurrent jobs, unauthorized media, unsupported provider, late tasks, retry, and no-double-charge are specified. |

Total: 27/27 — PASS.

## Findings fixed in round 1

1. Replaced vague “follow existing conventions” stop API wording with concrete
   procedure names and required inputs.
2. Identified the exact existing job service and route-assurance registration
   files instead of leaving worker integration implicit.
3. Removed the undefined new stop-control flag. The existing
   `verticalDramaSeriesFirstLastFrameBridge` flag gates provider attachment;
   Stop prompt/image controls remain independently user-selectable.

## Phase B adversarial check

The hostile-review question was: “Can implementation accidentally make the
whole start flow require or spend for Stop?” The plan now explicitly prevents
that at API, readiness, UI, provider, and rollback layers. A second question
was: “Can an LLM claim override the selected asset?” Canonical post-sync mapping
and post-sync mode calculation explicitly override that claim and are tested.

No remaining safe must-fix was found in this review round.
