# Adversarial Self-Review — Round 1 (claude-plan.md)

Reviewer stance: skeptical senior architect. Date: 2026-07-16.
(Phase A checklist review passed 25/25 in 2 rounds prior to this; these are
adversarial findings beyond the checklist.)

## Findings (all integrated into claude-plan.md)

**F1 — Shared-worker discovery is undefined (HIGH).**
`startConnect` for server scopes "resolves the shared unit" — but nothing
says how the server knows WHICH `workers` row is the shared unit (there
could be stale rows with runtimeType `hermes_agent_gateway` from the
agent-gateway lane). Fix: the pairing script records the paired worker id
into system_settings key `hermes_shared_worker_id`; `startConnect` and the
scheduler resolve the shared unit from that setting and verify it online.

**F2 — Prompt-injection blast radius via the `file` toolset (HIGH).**
The plan enabled toolsets `image_gen|video_gen,file`. Hermes' `file`
toolset can read/write paths the agent chooses; a hostile user prompt could
try to exfiltrate profile files into the output or overwrite state. Web
research shows the media tools already materialize outputs to
`$HERMES_HOME/cache/{images,videos}` and return `MEDIA:` tags — the `file`
toolset is NOT required for collection. Fix: default toolsets are
`image_gen` / `video_gen` ONLY; collection relies on marker/MEDIA/cache
signals; the workspace `./output` scan remains as a bonus signal when
Hermes happens to write there; a config escape hatch can re-enable `file`
per deployment if a pinned version proves to need it.

**F3 — Idempotency dedupe would block legitimate retries (MEDIUM).**
`findJobByIdempotencyKey` returns ANY existing job, including failed ones —
a user retrying an identical prompt would get the old failed job back
forever. Fix: dedupe only against non-terminal jobs; terminal
(completed/failed/canceled/expired) matches allow a fresh insert with an
attempt-suffixed key.

**F4 — `hermes -z` flag compatibility is assumed (MEDIUM).**
`-z` is documented as top-level script-pure mode; whether it composes with
`--provider/--toolsets/-p` like `chat` is unverified. Fix: provisioning
compatibility checklist explicitly tests the exact composed command; the
invocation module carries a `chat -q -Q` fallback template selected by the
probe result.

**F5 — Private connect needs a worker selector (LOW).**
A user may own multiple online Worker App workers; `startConnect` already
takes `workerId?` but the UI never surfaces a choice. Fix: connect panel
lists the caller's online private workers when scope=private_worker
(single worker auto-selected).

**F6 — Hermes runtime pack build is unowned (LOW).**
Phase 4 consumes runtime packs (`hermes-windows-x64`) from the manifest
endpoint but nothing builds them. Fix: a `scripts/build-hermes-runtime-pack.ts`
(or CI job) assembling uv + python + pinned hermes-agent into the archive +
manifest entry, listed as a phase-4 deliverable.

## Non-findings (checked, held up)

- Per-connection concurrency has a single source of truth (worker_jobs
  counts) across both deployment modes.
- Fee-per-candidate on shared-pool portrait batches is correct behavior
  (fee is per job; a batch of 4 = 4 small fees) — documented, not a bug.
- `settlePortraitCandidate` works unmodified once `getTask` +
  `reconcileTaskCredits` know `hermes_` ids (its logic is task-generic).
- runtimeType-follows-worker rule survives the two-machine user case via
  the connection-affinity claim assertion.
- Serial queue + signed-URL expiry already solved by claim-time minting.
