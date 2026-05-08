# Project Skills

This folder is the repo-backed source for the portable skill pack.
The same pack is intended to run in Codex and Claude-compatible hosts.

Why this exists:
- files under `~/.codex/skills` are local machine state and can be lost
- repo copies are reviewed, committed, and uploaded with the project
- changes to installed skills should be synced back here after each update
- runtime hooks use `python3` directly and must not require per-skill `.venv`
- external LLM API credentials are not required; review loops use the active
  host model through the skill instructions
- the same source can install to Codex runtime skills and generate native
  Claude Code sub-agent definitions

Mirrored installed skills:
- see `mirrored-skills.txt`

Main usage guide:
- `ORCHESTRA-USAGE-GUIDE.md` — Thai guide for calling `orchestra` across UI/UX, backend, security, debugging, testing, release, and skill-system work.

Notes:
- `.system` skills are intentionally not mirrored here because they are managed
  separately from the project skill pack.
- `mirrored-skills.txt` should include every portable non-system installed skill
  that must travel with this repo for deployment to another machine.
- `sub-agents` is a support/reference pack used by `orchestra` and the deep-*
  skills. It intentionally does not expose a top-level `SKILL.md`.
- Native Claude Code agent files are generated from
  `skills/sub-agents/agents/*.md`; do not edit generated `.claude/agents/ssp-*`
  files as the source of truth.
- Do not distribute a raw copied working directory that includes `.venv`,
  `.pytest_cache`, or `__pycache__`; run the cleanup command first.

Install on a new machine or project:

```bash
bash skills/install-portable-skills.sh
```

By default this installs Codex skills to `${CODEX_HOME:-~/.codex}/skills` and
generates Claude Code native agents in `.claude/agents/`. Override paths when
needed:

```bash
bash skills/install-portable-skills.sh \
  --codex-skills-root /path/to/.codex/skills \
  --claude-agents-dir /path/to/project/.claude/agents
```

Generate only Claude Code agents:

```bash
bash skills/generate-claude-agents.sh
```

Sync command:

```bash
bash skills/sync-installed-skills.sh
```

Run the sync script whenever any mirrored skill is changed under
`~/.codex/skills`.

If you update the mirrored copies inside this repo first, sync them back to the
installed skill pack as part of the same change so runtime behavior and repo
backup do not drift.

Publish back to installed runtime:

```bash
bash skills/publish-to-installed-skills.sh
```

Validation command:

```bash
bash skills/audit-skills.sh
```

Clean runtime artifacts before packaging or zipping:

```bash
bash skills/clean-runtime-artifacts.sh
```

Verify repo mirror vs installed runtime:

```bash
bash skills/verify-installed-skills-sync.sh
```
