# Section 03 — player modes and Marks

Update `MediaVideoEditorPlayer.tsx` to make automatic mode Face + Activity,
retain Mark controls/persistence, and expose Quick versus Full Scan state.
Quick uses current sampled detection and remains usable without a server job.
Full Scan displays scanning/checkpoint/degraded/stale states and applies only
an approved plan. Preview evaluates the shared plan and sends that exact plan
to render. Mark edits increment the local revision and invalidate stale scan
results.

Proof: focused component tests cover mode changes, Mark preservation, stale
result rejection, and truthful loading/error/accessibility labels.

Status: IMPLEMENTED locally in `MediaVideoEditorPlayer.tsx`; existing Mark
storage and controls remain active.
