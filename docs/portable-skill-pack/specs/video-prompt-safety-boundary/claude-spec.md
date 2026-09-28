# Synthesized Specification

Change Vertical Drama video-prompt authoring so a shot with an approved image
cannot be hard-blocked by policy-marker analysis. The approved image has already
passed the image-generation safety/provider boundary; video prompt creation is a
motion/continuity authoring step. The current false positive (`child` plus
`restrained tension`) must create and persist a prompt.

All whole-pack, single-shot, and speaker-switch video-prompt paths must remove
policy-only throws. Safety analysis remains available as warning telemetry and
must not turn a job into `failed` or suppress its result. Hard failures remain for
missing approved media, auth/ownership, queue problems, malformed LLM output,
vision requirements, provider outages, and billing/precondition failures.

Warning-bearing success must preserve prompt persistence, idempotency, queue
advancement, and the existing successful billing behavior. Actual video-render
provider rejection remains a render-job concern and must preserve the prompt.

The implementation must add tests for the exact episode-232 output, the benign
cinematic phrase, warning-bearing success, operational failures, queue/billing
behavior, and render/prompt boundary separation. It must verify the local runtime
data and browser behavior after implementation; no unrelated dirty-worktree files
may be changed or staged.
