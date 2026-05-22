# Section 09: Migration and Backward Compatibility

## Goal

Move from the interim Production Director implementation to Production Space without stranding existing saved runs or breaking Image/Video/Audio workflows.

## Current Interim State To Preserve

The current implementation may already have:

- `mediaProductionRuns` records,
- goal versions,
- plan versions,
- verification versions,
- approvals,
- `goal.tabSnapshots`,
- project list/search records,
- Storyboard Review / Video Edit projection records,
- Gemini Omni provider asset references.

Feature 116 must read these records and adapt them into a `ProductionSpace` view.

## Compatibility Adapter

Add a compatibility adapter that can build a minimal ProductionSpace from old records:

- `goal.summary` -> ProductionBrief concept,
- `goal.title` -> project title,
- `goal.audience/platform/durationSeconds` -> brief fields,
- `goal.productContext` -> product/reference context assets,
- `goal.characterContext.characterIds` -> character context assets,
- `goal.voiceAudioStrategy.audioIds` -> audio context assets,
- `goal.tabSnapshots.image/video/audio` -> draft node config snapshots,
- latest plan storyboard/shot data -> initial shots where possible,
- latest verification -> verifier status,
- latest approval -> approval state.

This adapter should be read-compatible first. Backfill can be optional and feature-flagged.

## Migration Modes

Support three modes:

- read-only compatibility: old run opens in new Production UI but is not backfilled yet;
- on-save migration: first save writes a new ProductionSpace version;
- admin/backfill migration: background or admin script converts eligible old runs.

The system should never delete old goal/plan/version records during initial rollout.

## UI Migration Behavior

When an old run opens:

- show a small compatibility badge in debug/advanced UI only;
- create default ordered shots only when planner/plan data is sufficient;
- otherwise show a draft space with brief and context assets;
- ask the user to run planner before batch execution;
- keep project search title/thumbnail behavior intact.

## Rollback

Feature flag rollback must:

- keep old Image/Video/Audio workflows working;
- keep project list/search working;
- keep old Production run records readable;
- hide new Production Space UI if disabled;
- avoid corrupting old run status transitions.

## Migration Verification

Implementation must define explicit migration acceptance before enabling write-mode migration.

Backfill verification must cover:

- old run with only goal and `tabSnapshots` opens as draft ProductionSpace;
- old run with latest plan version maps available storyboard/shot data into ordered shots;
- old verifier and approval records map to verifier/approval state without changing original rows;
- Storyboard Review / Video Edit projection records remain linked to the original production run;
- Gemini Omni Character/Audio provider asset references remain tenant/user scoped;
- repeated adapter reads are deterministic and do not create duplicate spaces.

No-data-loss acceptance:

- initial migration never deletes `mediaProductionRuns`, goal versions, plan versions, verification versions, approvals, asset plans, or output projections;
- on-save migration writes a new `mediaProductionSpaces` version and preserves the source legacy IDs in metadata;
- admin/backfill migration records migrated run count, skipped run count, error count, and per-run failure reasons;
- failed migration leaves the legacy run readable through the old compatibility path.

Rollback/read-safe behavior:

- disabling Production Space flags hides new write actions but keeps old run search/open read-compatible;
- old Image/Video/Audio, Gemini Omni suite, provider asset, Storyboard Review, and Video Edit flows continue to work;
- newly created ProductionSpace versions remain stored but are not required for legacy routes to render;
- rollback tests must prove the app can open pre-migration runs and post-migration spaces without corrupting old status transitions.

Schema-version upgrade tests:

- v1 ProductionSpace fixture upgrades to the latest schema without losing brief, shots, nodes, config snapshots, output refs, product evidence, or downstream projection refs;
- unknown future schema version returns a safe unsupported-version state rather than attempting destructive downgrade;
- incompatible old schema fields are preserved in metadata for manual recovery when they cannot be mapped.

## Acceptance

- Existing interim Production runs open in the new Production UI.
- Old runs with only goal/tabSnapshots become draft ProductionSpaces.
- Old runs with planner output can produce initial shots where possible.
- Saving an adapted old run creates a new ProductionSpace version without deleting old versions.
- Disabling the feature flag does not break Image/Video/Audio or existing Gemini Omni asset workflows.
- Backfill, rollback, no-data-loss, and schema-version upgrade tests pass before admin/backfill migration is enabled.
