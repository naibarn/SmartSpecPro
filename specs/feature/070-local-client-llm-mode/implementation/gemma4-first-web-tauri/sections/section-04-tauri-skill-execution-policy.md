# Section 04: Tauri Skill Execution Policy

## Ownership

- skill-level local execution tiers
- Tauri local-safe skill runtime boundaries
- local preprocess-only skill assistance
- reviewed packaged Python/JS skill eligibility
- reviewed packaged JS/TS/JSX/TSX bundle eligibility
- server-authoritative validation, audit, and fallback compatibility

## Target files

- `apps/web/server/services/skillExecutionPolicy.ts`
- `apps/web/server/services/skillOrchestrator.ts`
- `apps/web/server/services/skillParamExtractor.ts`
- `apps/web/server/services/skillExecutor.ts`
- `apps/web/server/services/skillFiles.ts`
- `apps/web/server/services/skillRegistry.ts`
- `apps/web/server/routers/skills.ts`
- `apps/web/client/src/features/local-ai/skills/tauriSkillRuntime.ts`
- `apps/web/client/src/features/local-ai/skills/skillLocalExecutionPolicy.ts`
- reviewed skill manifests under `apps/web/skills/*/skill.md`
- reviewed Python skills under `apps/web/skills/*/python/skill.py`
- reviewed JS/TS bundle skills under `apps/web/skills/*/*/skill.manifest.json`

## Implementation approach

1. Introduce a local execution tier alongside the current server skill execution policy:
   - `cloud_required`
   - `local_preprocess_only`
   - `local_safe`
2. Default every skill to `cloud_required` until reviewed.
3. Restrict `local_safe` to Tauri in v1.
4. Allow `local_safe` only when all of the following are true:
   - the local runtime is ready
   - the invocation is user-present and interactive
   - the skill is on a reviewed allowlist
   - the skill output is text, bounded JSON, or explicitly approved app-owned files
   - the skill has no side effects beyond explicitly approved local file writes
   - the skill has no server tool dependency
   - the invocation does not originate from public API, scheduler, workflow background, channel bridge, or team automation paths
   - scripted variants use packaged runtimes and reviewed entrypoints only
   - JSX/TSX-authored scripted variants compile to reviewed entry artifacts before execution
   - scripted variants are network-denied by default and restricted to app-owned filesystem roots
   - scripted variants do not require reusable backend or provider secrets
5. Use `local_preprocess_only` for:
   - schema drafting
   - long-input cleanup
   - JSON extraction hints
   - prompt normalization
   - context compaction before final server skill execution
6. Keep `cloud_required` for:
   - `media-generate`
   - automation/workflow skills
   - python/command/sandbox/tool-using skills unless they are explicitly reviewed as packaged local-safe scripted skills
   - shared-state or side-effectful skills
   - multimodal reviewer skills until local image parity is explicitly validated
7. Preserve the current server path as the canonical fallback whenever:
   - the user is not on Tauri
   - runtime readiness fails
   - the skill is not allowlisted
   - policy requires cloud execution

## Local-script contract

For reviewed scripted `local_safe` skills, extend `skill.manifest.json` with a `localExecution` block.

Minimum contract:

- `runtimeKind`
- `reviewedEntry`
- `artifactDigestSha256`
- `permissionProfile`
- `inputRoots`
- `outputRoots`
- `maxOutputMb`
- `provenance`

Policy mapping rules:

- reuse `requires_network` as the default network intent signal
- reuse `max_runtime_seconds` as the runner timeout default
- reuse `max_input_mb` as the staged input ceiling
- reuse `sandbox_profile` only when it maps to a supported Tauri permission profile
- if any reused field conflicts with the local-script contract, the safer local-script contract wins

The reviewed local-script contract is the source of truth for trust and permission enforcement, not the raw bundle entry alone.

## Local execution envelope

The Tauri app passes a bounded execution envelope to local scripts:

- sanitized params
- `localExecutionId`
- staged input descriptors
- staged output contract
- non-secret display/debug metadata

The envelope must never include:

- reusable session tokens
- provider API keys
- refresh tokens
- unrestricted host file paths

If a script needs backend callbacks or cloud secrets, it must stay `cloud_required`.

## Offline and sync policy

Reviewed `local_safe` scripted skills may run offline on Tauri.

Rules:

- local execution writes result metadata into an app-owned outbox
- the script does not sync directly to the backend
- the Tauri app performs authenticated sync later when online
- synced results still pass the current server validation/audit/persistence layer
- cloud fallback paths remain available when online and policy allows them

## Filesystem staging policy

To keep host access bounded:

- user-selected files are staged into app-owned per-execution input roots
- scripts only read from staged roots
- scripts only write into staged output roots
- export back to user-visible destinations happens after runner validation

## Candidate skill guidance

Strong first candidates for reviewed `local_safe` rollout:

- prompt writers
- storyboard/prompt drafting skills
- article/story drafting skills
- translation/rewrite skills
- schema-bound evaluator/classifier skills that return text or JSON only
- reviewed packaged Python/JS skills that already follow structured input/stdout or manifest-based entry contracts and do not require backend callbacks
- reviewed packaged JS/TS/JSX/TSX bundles that compile to deterministic reviewed entry artifacts and do not require backend callbacks

Strong non-candidates for v1:

- media generation skills
- automation and workflow skills
- scheduled or background skill runs
- public API skill entry points
- multimodal reviewer/document-heavy skills
- scripted skills requiring unrestricted shell, unrestricted network, arbitrary workspace access, or raw source execution without a reviewed compiled artifact

## TDD expectations

- Add tests proving every skill defaults to `cloud_required`.
- Add tests proving reviewed `local_safe` skills route locally only on Tauri.
- Add tests proving `local_preprocess_only` can assist input shaping without replacing the existing server executor.
- Add tests proving public API, scheduler, channel, workflow background, and team automation paths stay cloud-required.
- Add tests proving local results still pass existing schema validation and persistence rules.
- Add tests proving reviewed scripted local-safe skills stay within packaged-runtime, timeout, output-size, and filesystem/network limits.
- Add tests proving JSX/TSX-authored local-safe bundles are only executable through reviewed compiled entry artifacts.
- Add tests proving local-script manifest reuse/mapping from existing fields is deterministic and conflict-safe.
- Add tests proving secret-free execution envelopes and app-owned outbox sync semantics.

## Acceptance checks

- a reviewed text-only skill can use Tauri local Gemma 4 without a second skill system
- a reviewed packaged Python/JS/TS/JSX/TSX skill can use Tauri local execution without opening a generic local code-execution surface
- a non-reviewed or unsafe skill still uses the current cloud/server path
- preprocess-only assists can save tokens without altering authoritative skill execution policy
- server audit and validation behavior remains intact
- reviewed local-script permissions can be derived from a clear contract instead of ad hoc bundle heuristics

## Risks and coordination

- Do not infer `local_safe` from `execution_mode: llm-only` alone; reviewed allowlisting is required.
- Do not infer scripted local safety from `execution_mode: python` or a manifest alone; reviewed allowlisting is required.
- Section 02 owns the runtime bridge. This section only decides when that bridge may be used for skills.
- Section 05 must review abuse paths, trust boundaries, and regression coverage for these tiers.
