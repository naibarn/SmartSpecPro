# Section 06 — Artifact, QC, and final commit

## Objective

Make render success mean verified artifact plus server commit, not merely a
completed worker process.

## Files and ownership

- Add `apps/web/server/services/editorArtifactCommitService.ts`.
- Add `apps/web/server/services/editorQcService.ts`.
- Extend existing project-job/artifact integration without creating a second
  Library or queue path.

## Behavior

- Verify output roles, media probe, duration/geometry/audio constraints, hash,
  and render manifest against executable plan and snapshot.
- Upload and commit are idempotent; partial upload is recoverable and not
  completed.
- Required QC failure blocks commit; warnings remain visible and auditable.
- Artifact links pin tenant, project, revision, snapshot, job, hash, and source
  provenance.

## TDD and acceptance

Test probe/hash/role mismatch, QC failure/warning, upload retry, duplicate
commit, partial recovery, and project link freshness. Do not return a final
artifact URL before server commit.

## UI/UX Contract

### Target User / JTBD
Editor needs confidence that the final media artifact is verified and linked.

### Surface Inventory
Render progress, QC panel, artifact commit state, download/restore controls.

### Component Map
QC/artifact services own truth; Web render panel owns progress and final-state
presentation.

### State Matrix
Rendering, uploading, QC warning, QC failed, commit pending, committed,
recoverable partial, stale, and failed.

### Responsive Matrix
Mobile status-first; tablet/laptop QC summary; desktop detailed manifest and
artifact provenance.

### Accessibility Acceptance
Live progress, semantic QC severity, keyboard retry/restore, visible focus,
and no artifact success before commit.

### Copy Contract
Thai-first copy distinguishes “กำลังยืนยัน artifact” from completed; English
fallback uses the same gate.

### Browser Evidence Required
Capture render, QC warning/error, partial recovery, commit, and restore flows.
