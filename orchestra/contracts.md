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

