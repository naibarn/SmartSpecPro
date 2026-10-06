# Spec 286 R1.7 G0.1 — Next Implementation Task Packet

## Goal

Begin Spec 286 implementation without duplicating Spec 133/142/143/145.

## Source fence

```text
baseline commit: 4f4e35fadd388a8950cf801cb45c64de46c645c9
```

Before editing, sync/reconcile with the current canonical checkout and repeat local duplicate search
if HEAD moved.

## First executable slice

### WP0.4 — Fresh baseline + current visual-quality evidence

Do this before core feature implementation.

1. Select representative existing Motion Studio projects/fixtures.
2. Render current output through the real current Remotion path.
3. Record:
   - exact project revision;
   - render worker/runtime version;
   - output artifact digest;
   - render time/cost;
   - QA ledger result;
   - key frames/contact sheet;
   - current known visual deficiencies.
4. Include at least:
   - Thai 9:16 educational short;
   - SaaS/product UI launch;
   - caption-heavy social clip;
   - data/chart scene;
   - multi-scene motion project.
5. Store baseline evidence as immutable test/golden artifacts according to repo conventions.

### WP1.1 — Normalized adapters/types

Implement **no new project table**.

Create/add normalized Spec 286 types/adapters around existing video project owners.

Mandatory first targets:

```text
VideoProductionManifest assembler (projection)
DirectorBrief typed binding over existing brief
VideoQualityScorecard extension/adaptation over qaLedger
VideoIssue extension/adaptation over QaLedgerReviewIssue
VideoProductionContextProjection assembler
```

### WP1.2 — State projection

Implement Spec 286 production states as a projection over:

```text
video_projects.status
project revision
active VI job
render job/status
QA/review state
approval/delivery refs
```

Do not introduce a second job state table.

## Required discovery commands in local checkout

```bash
rg -n "VideoProduction|ProductionManifest|DeliveryPackage|BeatGrid|ObservedVideoStyleGuide|ProductionReceipt|SourceSnapshot|EditJournal" apps packages specs
rg -n "video_projects|video_project_revisions|qaLedger|worker_jobs|worker_job_events" apps/web
rg -n "approveStage|approval|publish|delivery|archive|artifact.*manifest" apps/web packages
rg -n "contact.?sheet|frame.?extract|visual.?critic|multimodal.*review" apps packages
```

If an equivalent exists, stop and reuse it.

## Forbidden implementations in the first slice

```text
new video production job table
new timeline SoT
new QA table
new Capability Registry
new Remotion renderer
new generic media storage
new billing ledger
new approval ledger
new publication service
```

## Required evidence before handoff

```text
REQ IDs covered
source files changed
existing tests reused
new tests added
no-duplicate grep evidence
migration status (expected: none for first slice)
golden/baseline artifact refs
remaining true blockers
```
