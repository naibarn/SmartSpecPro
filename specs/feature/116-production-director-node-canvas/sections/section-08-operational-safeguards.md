# Section 08: Operational Safeguards and Edge Cases

## Goal

Define the operational rules that keep Production Director reliable when real users edit long-running projects, run planner revisions, configure many nodes, and spend credits through downstream tools.

## Versioning and Approval Invalidation

Production Director must version the important layers independently:

- ProductionSpace version,
- brief version,
- shot version,
- node config version,
- canvas layout version,
- plan/verifier version,
- approval version.

Minimal version ownership contract:

| Layer | Owner field | Incremented when | Required save guard |
| --- | --- | --- | --- |
| ProductionSpace | `spaceVersion` | any material project/space JSON change | `expectedSpaceVersion` |
| Brief | `briefVersion` | goal, audience, platform, constraint, or product-truth note changes | `expectedBriefVersion` when saving brief fields |
| Shot | `shot.version` | shot metadata, order, duration, product use, cast, audio intent, or child node plan changes | `expectedShotVersion` |
| Node config | `node.version` and `configSnapshot.id` | config snapshot, product refs, prompt, model, provider settings, or output mapping changes | `expectedNodeVersion` and `previousConfigSnapshotId` |
| Canvas layout | `canvas.layoutVersion` | node position, viewport, collapsed/expanded state, or layout-only changes | `expectedLayoutVersion` |
| Planner/verifier | `planVersion` / `verifierVersion` | planner output or verifier result changes | `expectedPlanVersion` / `expectedVerifierVersion` |
| Approval | `approvalVersion` | approval, revoke approval, or material invalidation | `expectedApprovalVersion` |

Every router mutation that writes a layer must include the matching expected version. Stale writes return a typed conflict with the current version, changed fields, and safe preview metadata. Layout-only conflicts may offer merge; shot/node config conflicts must never silently merge.

Approval should be invalidated when a change can materially affect output:

- brief/story goal changes,
- shot order changes,
- shot duration changes,
- product truth/evidence changes,
- character/audio/product asset changes,
- node config changes after approval,
- edge/dependency changes,
- verifier output changes from pass/warning to revise/block.

Minor layout-only canvas movement should not invalidate approval.

## Optimistic Locking and Conflict Recovery

Production projects may be opened in more than one browser tab. Save operations must use optimistic locking or expected version checks.

Conflict behavior:

- show a conflict dialog or drawer,
- allow reload latest,
- allow save as new version,
- allow manual merge for non-overlapping canvas layout changes,
- never silently overwrite another user's shot/node config.

## Undo, Redo, and Change History

Canvas and shot edits should support local undo/redo for:

- node move,
- edge reconnect,
- node add/remove,
- shot reorder,
- shot split/merge/duplicate,
- node config snapshot update,
- asset drop/remove.

Durable change history should record:

- actor,
- timestamp,
- changed layer,
- changed fields,
- previous version,
- new version,
- reason: user edit, planner revision, verifier fix, system migration.

## Capability Registry and Tool Adapter Contract

The planner must not invent tools that SmartSpecPro cannot run.

Build and pass a capability registry into the planner:

- available node types,
- available surfaces,
- model/provider candidates,
- required input schemas,
- output schemas,
- supported reference modes,
- duration/resolution/aspect limits,
- provider quota constraints,
- pricing estimate support,
- whether node can batch execute or requires manual configuration,
- fallback providers or blocked state.

Each executable node should bind to a tool adapter:

```ts
type ProductionSurface =
  | "production_workspace"
  | "production_skill"
  | "production_asset_drawer"
  | "production_qa"
  | "production_gate"
  | "production_review"
  | "production_timeline"
  | "video_shot"
  | "image"
  | "video"
  | "audio"
  | "character_wizard"
  | "audio_asset_wizard"
  | "caption_editor"
  | "storyboard_review"
  | "video_edit"
  | "render_surface"
  | "publish_export";

interface ProductionToolAdapter {
  surface: ProductionSurface;
  mode: string;
  inputSchemaVersion: string;
  outputSchemaVersion: string;
  canConfigure: boolean;
  canGenerate: boolean;
  canBatch: boolean;
  estimateCredits(input: unknown): number | null;
  validateInput(input: unknown): Array<Record<string, unknown>>;
}
```

## Idempotency and Output Attachment

Generation and handoff actions must be idempotent by:

- productionRunId,
- shotId,
- nodeId,
- config snapshot hash,
- target surface,
- requested action.

If the same node config is generated twice by retry, the system should attach the existing result or create a clear new attempt record instead of losing outputs.

Action attempts should be persisted with a minimal idempotency contract:

```ts
interface ProductionActionAttempt {
  id: string;
  idempotencyKey: string;
  productionRunId: string;
  shotId?: string;
  nodeId?: string;
  configSnapshotId?: string;
  configHash?: string;
  surface: ProductionSurface;
  action: "plan" | "verify" | "configure" | "generate" | "handoff" | "render" | "export";
  status: "pending" | "running" | "succeeded" | "failed" | "cancelled" | "deduped";
  providerTaskId?: string;
  downstreamProjectId?: string;
  outputRefIds: string[];
  errorCode?: string;
  createdAt: string;
  updatedAt: string;
}
```

The unique key should include tenant/user scope, productionRunId, optional shotId/nodeId, config hash, target surface, action, and explicit retry group. Duplicate retries with the same key should return the existing running/succeeded attempt or create a new attempt only when the user chooses a new retry group.

Output refs must preserve:

- task ID,
- provider task ID,
- library item ID if saved,
- public URL when required by provider,
- thumbnail URL,
- prompt/config snapshot hash,
- generated-at timestamp,
- QA status.

## Failure Recovery

Failure should be scoped as narrowly as possible:

- a failed child node should not fail the whole project;
- a failed shot should not invalidate completed independent shots;
- a failed handoff should be retryable without rerunning generation;
- stale/missing output URLs should show repair/relink actions;
- provider-specific failures should attach to the node and keep the graph editable.

## Security, Tenant, and Permission Rules

All ProductionSpace operations must enforce:

- tenant isolation,
- user ownership or shared project permission,
- library/provider asset access checks,
- no raw provider keys in normal UI,
- no cross-tenant public URL leakage,
- audit logging for credit-spending actions,
- policy guardrails for unsupported product claims or risky content.

## Performance and Large Project Handling

The UI should stay usable for long projects:

- virtualize long shot lists,
- collapse child nodes by default,
- lazy-load node config details,
- persist canvas layout incrementally,
- debounce autosave,
- avoid sending raw huge marketplace/OCR payloads to LLM unless necessary,
- summarize context before planner calls when the model context budget is tight.

## Acceptance

- Conflicting saves do not silently overwrite user edits.
- `saveSpace`, `saveShot`, `saveNodeConfig`, and `saveCanvasLayout` reject stale expected versions with typed conflicts.
- Version ownership is deterministic for space, brief, shot, node config, canvas layout, planner/verifier, and approval layers.
- Planner cannot output unsupported executable node/tool combinations without verifier warnings.
- Approval is invalidated only by material changes, not canvas layout movement.
- Retried node generation does not duplicate or lose output refs unexpectedly.
- Duplicate action attempts are idempotent and preserve output attachment history.
- Failed nodes can be retried without rerunning the full project.
- Large projects remain usable through collapsed shots, lazy loading, and list fallback.
