# Project Skill Backups

This folder is the repo-backed backup for the Codex skill pack that is actively
used from `~/.codex/skills`.

Why this exists:
- files under `~/.codex/skills` are local machine state and can be lost
- repo copies are reviewed, committed, and uploaded with the project
- changes to installed skills should be synced back here after each update

Mirrored installed skills:
- see [`mirrored-codex-skills.txt`](/home/dev/projects/SmartSpecPro/skills/mirrored-codex-skills.txt)

Notes:
- `deep-plan-codex` is kept here as a project-specific variant and is not part
  of the installed mirror list above.
- `.system` skills are intentionally not mirrored here because they are managed
  separately from the project skill pack.

Sync command:

```bash
bash skills/sync-installed-codex-skills.sh
```

Run the sync script whenever any mirrored skill is changed under
`~/.codex/skills`.

If you update the mirrored copies inside this repo first, sync them back to the
installed skill pack as part of the same change so runtime behavior and repo
backup do not drift.

Publish back to installed runtime:

```bash
bash skills/publish-to-installed-codex-skills.sh
```

Validation command:

```bash
bash scripts/ci/validate_skill_pack_backup.sh
```

Verify repo mirror vs installed runtime:

```bash
bash skills/verify-installed-codex-skills-sync.sh
```
