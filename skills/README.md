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

Mirrored installed skills:
- see `mirrored-skills.txt`

Main usage guide:
- `ORCHESTRA-USAGE-GUIDE.md` — Thai guide for calling `orchestra` across UI/UX, backend, security, debugging, testing, release, and skill-system work.

Notes:
- `.system` skills are intentionally not mirrored here because they are managed
  separately from the project skill pack.
- `cybersecurity` and `sub-agents` are support/reference packs used by
  `orchestra` and the deep-* skills. They intentionally do not expose top-level
  `SKILL.md` files unless promoted to standalone skills later.
- Do not distribute a raw copied working directory that includes `.venv`,
  `.pytest_cache`, or `__pycache__`; run the cleanup command first.

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
