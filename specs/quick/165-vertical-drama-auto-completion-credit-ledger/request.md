# Request

## Task summary

Make the Vertical Drama AI workflow reliable and auditable end to end:

1. Prompt expansion must call the real LLM, validate the expanded treatment, and automatically repair incomplete output.
2. Story plan/deep draft must cover the requested episode horizon, including complete shot data and usable dialogue for every episode.
3. Draft QC must run as a real skill, automatically repair failed or incomplete candidates, and re-run QC when required.
4. Full-story generation and story repair must automatically validate the result and repair missing episode/dialogue content without requiring another user click.
5. Every actual LLM operation, including retries, automatic repairs, QC evaluations, and repeated user runs, must charge normally and create a visible credit transaction with the exact skill slug, actual model, stage, round, run/job id, and episode scope.
6. Duplicate delivery of the same worker attempt must remain idempotent; a distinct repair/re-run must receive a new run key and charge again.
7. Refresh/resume must preserve prompt, draft, QC history, active job, and all persisted output. Provider/network failures must be resumable and must not be converted to mock/fallback output.

## Repository assumptions

- Existing Vertical Drama story jobs and canonical `bible.breakdownVersions` remain the source of truth.
- Existing skill slugs and model-selection policy are authoritative; explicit user/series model pins must not be replaced by an unrelated model.
- Existing fixed skill revenue settlement can remain for the skill product, but each physical LLM call also needs its own user-facing usage ledger entry.
- The current checkout is intentionally dirty. Only owned files for this task may be changed.

## Non-goals

- Do not auto-run media rendering, provider video jobs, or irreversible publishing.
- Do not hide provider failures behind fallback prose or synthetic dialogue.
- Do not refund a real provider call merely because its output failed a quality gate; only duplicate delivery of the same idempotent attempt is free.
