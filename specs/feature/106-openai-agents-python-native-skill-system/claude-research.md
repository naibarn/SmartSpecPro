# Research Notes

## Codebase research

### Existing skill pipeline

The repository already has a broad skill ecosystem, but it is still centered on legacy conventions:

- `apps/web/skills/intelligence-skill-creator/isc/cli.py` exposes `list`, `evaluate`, `improve`, and `apply`, but not a native `create --target-platform agents_python` path.
- `apps/web/skills/intelligence-skill-creator/isc/creator.py` still generates `skill.py`, `js/skill.js`, `skill.manifest.json`, and schema/test bundles oriented around older runtime shapes.
- `apps/web/skills/intelligence-skill-creator/isc/evaluator.py` executes skill entrypoints directly and currently looks for `python/skill.py`, `js/skill.js`, `js/skill.mjs`, or `src/index.mjs`.
- `apps/web/skills/intelligence-skill-creator/isc/validator.py` validates patch payloads and checks for required `respond()` signatures, but it is still framed around the legacy entrypoint model.

### Skill file resolution and registry behavior

The Node side already has substantial skill resolution logic:

- `apps/web/server/services/skillFiles.ts` resolves `skill.md` and `SKILL.md`, nested bundle directories, and ZIP extraction flattening.
- `apps/web/server/services/skillRegistry.ts` still treats database state plus markdown manifests as the primary skill truth and maps folder paths back to manifest files.
- `apps/web/server/services/skillCompatibilityGate.ts` already snapshots schema and file inventories, which can be extended to native-bundle validation.
- `apps/web/server/services/skillMaintenanceAnalyzer.ts` already scores legacy-vs-modern candidates and detects missing bundle surface files such as `scripts/run.sh`, `scripts/verify.sh`, `MODEL_COMPATIBILITY.md`, and `skill.lock.json`.
- `apps/web/server/services/skillUpgradeApplier.ts` already has a maintenance apply path that can be reused for safe native-bundle upgrades.

### OpenAI Agents runtime boundary

The Python backend already has an OpenAI Agents adapter layer:

- `python-backend/app/services/openai_agents_adapter.py` currently wraps plain agent execution and request/response normalization.
- `python-backend/app/services/openai_agents_contracts.py` already defines request, checkpoint, and response schemas that the new skill runtime can extend.
- `python-backend/app/services/openai_agents_trace.py` and `python-backend/app/services/openai_agents_version.py` show the runtime already has tracing and compatibility version boundaries.
- `python-backend/app/services/openai_agents_adapter.py` is the right seam for a new native skill runtime path, rather than overloading the generic chat/team runtime contracts immediately.

### Checkpointing and persistence

The Node runtime has existing persistence semantics that fit the spec’s durability goals:

- `apps/web/server/services/agentRuntime/checkpointService.ts` already redacts sensitive metadata before persistence.
- Existing agent runtime and workflow tests show that checkpointing, resumption, and redaction are already first-class concerns in the codebase.

### Testing conventions

The repo uses both `vitest` and `pytest`:

- TypeScript/Node tests are written with `vitest`, usually under `apps/web/**/__tests__` or `*.test.ts(x)`.
- Python backend tests use `pytest` with `pytest-asyncio` and related fixtures.
- The web app’s local guidance and config indicate `pnpm test` and `pnpm test:coverage` for the TypeScript side.
- Python requirements include `pytest`, `pytest-asyncio`, `pytest-cov`, and `pytest-mock`, so `uv run pytest` is the natural backend command.

## Web research

### Official OpenAI docs findings

The current OpenAI developer docs confirm the architectural direction in the spec:

- The docs homepage highlights “Sandbox agents in the Agents SDK” and says they run in container-based environments with files, commands, skills, snapshots, and memory.
- The sandbox agents guide explicitly recommends `Skills(lazy_from=LocalDirLazySkillSource(...))` for larger local skill directories when the model should discover an index first and load only what it needs.
- The same guide distinguishes `Skills(from_=LocalDir(src=...))` for small local bundles and `Skills(from_=GitRepo(...))` for bundles with separate release cadence.

### Practical implications for this feature

The docs reinforce three important implementation choices:

- The runtime should treat skills as discoverable bundle assets, not as ad hoc code entrypoints.
- Lazy loading is appropriate for larger local skill sets, which matches this repository’s existing large skill library.
- Sandbox agents are the right place to enforce files, commands, and snapshots when a skill run needs durable, inspectable state.

### Sources

- OpenAI developers homepage and docs navigation: https://developers.openai.com/
- Sandbox agents guide: https://developers.openai.com/api/docs/guides/agents/sandboxes
- Skills guide: https://developers.openai.com/api/docs/guides/tools-skills

## Testing approach

This is an existing codebase, so the testing strategy should follow current conventions:

- Use `vitest` for the TypeScript/Node parts of the plan.
- Use `pytest` for the Python backend parts.
- Keep new tests close to the modules they protect, following the repo’s current `__tests__` and `tests/unit` layouts.
- Prioritize contract tests for bundle validation, runtime loading, checkpoint persistence, migration safety, and compatibility gates.
