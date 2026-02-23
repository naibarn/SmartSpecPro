# Code Review Interview — Section 05

## Review Findings and Decisions

### HIGH-1: archive/ retention guidance — USER DECISION

**Finding:** `artifact-management.md` had no retention guidance for `orchestra/archive/`, which can accumulate unboundedly.

**User decision:** Add retention note.

**Applied:** Added a "Retention Guidance" block in the Git Tracking section explaining:
- Exclude `orchestra/archive/` from git via `.gitignore`
- Prune old entries manually when no longer needed
- Never delete entries from the current session

---

### HIGH-2: 75% capacity inconsistency in compaction-safety.md — AUTO-FIX

**Finding:** The red-state classification table had a 4th criterion ("context window above 75% capacity") that was not in the CHC trigger list. The spec requires exactly 3 CHC trigger points.

**Applied:** Removed the 4th criterion from the red-state table. The 3 canonical criteria now match the trigger list: (1) many decisions + contracts + 5+ waves, (2) major topic change, (3) HIGH/CRITICAL risk work.

---

### HIGH-3: `in_progress` object structure undefined — AUTO-FIX

**Finding:** The `in_progress` field was typed as `object` with no sub-field definition, making mid-wave resume ambiguous.

**Applied:** Added recommended sub-fields to the `compaction-safety.md` field table: `wave` (string), `step` (string), `sub_agents_launched` (int), `sub_agents_complete` (int). Updated the resume banner template in `session-resume.md` to use these sub-fields explicitly.

---

### MEDIUM-1: artifact-management.md line count below spec minimum — AUTO-FIX

**Finding:** Document was 84 lines; spec requires 100–200 lines. Missing lifecycle rules for `risk_register.md`, `progress.md`, and snapshot files.

**Applied:** Added lifecycle rule sections for:
- `progress.md` — wave status log format
- `risk_register.md` — append-only security finding log
- `snapshot.json`/`snapshot.md` — overwrite semantics

---

### MEDIUM-2: backlog.md paths should be absolute — AUTO-FIX

**Finding:** Backlog entry format said "absolute or relative path" which contradicts the key_files absolute-path rule.

**Applied:** Changed format to "absolute path from filesystem root" with an explicit path rule note matching the `key_files` convention.

---

### MEDIUM-3: Yellow state notification under-specified — LET GO

**Finding:** Yellow notification message doesn't say what was logged or where.

**Decision:** The yellow state is informational only (no action required). The message is intentionally brief. Not changed.

---

### MEDIUM-4: "start fresh" edge case ambiguous — AUTO-FIX

**Finding:** "Start fresh" in the mismatched-task edge case didn't clarify that it uses archive (not delete).

**Applied:** Expanded the edge case in `session-resume.md` to show the explicit user choice prompt, clarifying that option 1 archives (not deletes) the old directory.

---

### LOW-1: Incorrect git commit coupling rule — AUTO-FIX

**Finding:** The rule "Never commit snapshot.json and snapshot.md without the wave output that prompted the checkpoint" was factually incorrect (snapshots are taken pre-work, not post-work).

**Applied:** Removed the coupling rule from `artifact-management.md`.

---

### LOW-2: `/deep-implement` not mentioned — AUTO-FIX

**Finding:** The [X] TDD cross-reference check required `/deep-implement` to be mentioned.

**Applied:** Added a brief mention in the State Synchronization section: "Continue with the next wave — typically quality gates for the planned sections, or `/deep-implement` invocation for each section."

---

### LOW-3: Banner rendering note missing — AUTO-FIX

**Finding:** Banner template had `{in_progress}` without specifying how to serialize the object.

**Applied:** Added a rendering note and updated the banner template to use `{in_progress.wave}`, `{in_progress.step}`, etc. with a fallback for old snapshot formats.

---

### LOW-4: Partial snapshot detection undefined — AUTO-FIX

**Finding:** No guidance on what to do if context compaction happened mid-snapshot-write.

**Applied:** Added "Partial Snapshot Detection" section to `compaction-safety.md` covering: JSON exists but MD is stale, both absent, invalid JSON fallback.

---

### NITPICK-1: Red state row wraps in table — LET GO

Minor formatting concern. Not changed.

---

### NITPICK-2: decision-mode.md "Retired When" was "User edits it" — AUTO-FIX

**Applied:** Changed to "Never" with a clarifying note that the user may edit the value but the file is never removed.

---

### NITPICK-3: Hard-coded project path in skill-pack-integration.md — AUTO-FIX

**Applied:** Replaced `/home/dev/projects/SmartSpecPro/` with `{project_root}` placeholder with a note to substitute the actual path.

---

### NITPICK-4: `/orchestra new` vs bare `/orchestra` inconsistency — AUTO-FIX

**Applied:** Changed the trigger condition wording in `session-resume.md` to "explicitly requests a fresh start (e.g., with an argument like `new` or `fresh`)" — decoupled from any specific syntax since the SKILL.md will define the exact command form.
