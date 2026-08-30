# Section 04 — Storyboard Shot Inspector

## Goal

Expose generated-shot intent and real Worker dispatch in the existing compact
nine-shot storyboard without duplicating the old provider video route.

## Owned files

- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx`
- new focused Shot Inspector component and state helpers
- episode workspace callback/query integration
- component tests and localization copy

## Implementation

Add a per-shot drawer/sheet that shows mode, policy summary, compatible workflow
choice, immutable resolution state, start frame, ordered references, duration,
GPU/MCP readiness, generated-shot status, QC, retry, cancel, and stale/revoked
states. Dispatch the new typed mutation. Keep `onGenerateVideoClip` as a
separate provider action and label artifact types independently.

## UI acceptance

Loading/empty/blocked/stale/processing/QC/ready/retry/revoked states, keyboard
focus, accessible names, reduced motion, and responsive card/drawer layout pass.

## UI/UX Contract

### Target User / JTBD

Drama editor needs to review and dispatch one of nine storyboard shots without
leaving the episode workspace or confusing a provider clip with a Worker shot.

### Surface Inventory

Shot card action, Shot Inspector drawer, workflow override, start/reference
frame list, duration, job status, QC result, retry/cancel, and artifact link.

### Component Map

Keep the nine-shot storyboard as the parent surface; mount a focused inspector
and use typed callbacks for dispatch/status rather than embedding server logic.

### State Matrix

Empty, loading, policy blocked, workflow unavailable, queued, processing,
failed, QC rejected, ready, stale, and revoked states each have a clear action.

### Responsive Matrix

Use a drawer on desktop and full-height sheet on narrow screens; preserve the
shot identity and primary action while scrolling details.

### Accessibility Acceptance

Drawer focus is trapped and restored, frame thumbnails have meaningful labels,
and status/error text is available without relying on icons or color.

### Copy Contract

Label actions as “สร้าง Shot ด้วย Worker”, “ใช้ workflow อื่น”, “ยกเลิกงาน”,
and “ลองใหม่”; distinguish generated shot, prepared B-roll, and provider clip.

### Browser Evidence Required

Verify one complete ready flow plus blocked, failed, retry, and revoked states
in the nine-shot episode workspace.
