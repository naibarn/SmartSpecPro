# Orchestra Contracts — Current Work Requests UI Polish

## Contract 1: Behavior/API Preservation

- Do not change tRPC procedure names, inputs, or response assumptions.
- Do not change navigation targets for existing buttons and links.
- Do not change auth, role, tenant, backend, DB, or Work OS orchestration behavior.

## Contract 2: UI State Coverage

- `/work/requests` must cover loading, empty, error, and populated states.
- `/work/request` must cover team readiness loading/error/empty, recent requests loading/error/empty, preflight error, and locked/disabled form states.
- White mode must remain readable with no horizontal overflow on mobile, tablet, and desktop.

## Contract 3: Verification

- Run TypeScript check for touched TSX files via the repo web check command.
- Run targeted page tests for `MyRequests` and `WorkRequest`.
- Run browser screenshot/responsive gate for `/work/requests` and `/work/request` at mobile/tablet/desktop widths.

---

# Orchestra Contracts — Skill System vNext

## Contract 1: Superpowers Patterns → Orchestra References

Pattern references must be stored under:

```text
skills/orchestra/references/
```

Required files:

- `meta-activation.md`
- `worktree-discipline.md`
- `verification-before-completion.md`
- `tdd-discipline.md`
- `branch-finishing.md`
- `skill-behavior-tests.md`

`skills/orchestra/SKILL.md` must mention when each reference is read. The references must preserve SmartSpecPro's current goals:

- Works for Codex and Claude from one skill pack.
- Does not require `.venv`.
- Does not require external LLM API wiring.
- Keeps direct small tasks lightweight.

## Contract 2: Visual UI Skill → Repo Skill Folder

The active visual UI skill lives at:

```text
skills/visual-ui-enhancement/
```

It must include:

- `SKILL.md`
- `README.md`
- `VERSION`
- `LICENSE`
- `references/`
- `templates/`
- `examples/`
- `codex/`
- `claude-code/`

The active package must not require:

- `.venv`
- `OPENAI_API_KEY`
- external OpenAI Agents Python runtime

Optional external integration material may be omitted from the active repo skill or documented as excluded.

## Contract 3: UI/UX Agents → Registry and Native Definitions

Required SmartSpecPro agent files:

- `skills/sub-agents/agents/visual-ui-requirement-analyzer.md`
- `skills/sub-agents/agents/visual-ui-direction.md`
- `skills/sub-agents/agents/ui-builder.md`
- `skills/sub-agents/agents/visual-ux-reviewer.md`
- `skills/sub-agents/agents/accessibility-reviewer.md`
- `skills/sub-agents/agents/responsive-reviewer.md`
- `skills/sub-agents/agents/visual-final-refactor.md`

Required native Claude definitions:

- `.claude/agents/ssp-visual-ui-requirement-analyzer.md`
- `.claude/agents/ssp-visual-ui-direction.md`
- `.claude/agents/ssp-ui-builder.md`
- `.claude/agents/ssp-visual-ux-reviewer.md`
- `.claude/agents/ssp-accessibility-reviewer.md`
- `.claude/agents/ssp-responsive-reviewer.md`
- `.claude/agents/ssp-visual-final-refactor.md`

All new agents must appear in:

- `skills/sub-agents/README.md`
- `skills/orchestra/references/sub-agent-dispatch.md`

## Contract 4: Verification

The completed work must pass:

```bash
bash skills/audit-skills.sh
bash skills/publish-to-installed-skills.sh
bash skills/verify-installed-skills-sync.sh
```

If a long test suite is unavailable or blocked by existing unrelated dirty app work, record the blocker explicitly.
