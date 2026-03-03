# Interview Notes

## Q1. Overflow policy priority for auto-layout when capacity is exceeded

Use a degrade-first, drop-last policy.

Pre-drop first: hidden layers, zero-opacity layers, zero-size layers, and off-canvas decorative elements.

Then degrade before dropping: remove heavy effects (blur/shadow/filter), flatten groups, rasterize SVG/icons.

Keep priority (highest -> lowest):
1. text layers (title/body/callouts)
2. pinned/locked "hero" media
3. raster images
4. SVG/icons (rasterized if needed)
5. basic shapes/lines
6. decorative/background ornaments

Drop order is reverse of keep priority.

Video is out of scope for Phase 1; when added later, treat pinned video at same priority as pinned hero media.

## Q2. SVG failure UX in Play/Export status and fallback behavior

SVG failures must not fail whole slide/export unless slide becomes structurally invalid.

Primary fallback:
- rasterize SVG to PNG at object target bounds (2x scale).

If raster fallback fails:
- render fixed placeholder in same bounds (no layout shift) with neutral "asset unavailable" tile.

Play/Export status:
- show "Completed with warnings" (yellow), not "Failed", when fallback/placeholder is used.

Warning codes/messages:
- `W_SVG_LOAD_FAILED` - "SVG source could not be loaded; using fallback."
- `W_SVG_PARSE_FAILED` - "SVG could not be parsed; using fallback."
- `W_SVG_RASTERIZED` - "SVG was rasterized to preserve output fidelity."
- `W_SVG_PLACEHOLDER` - "SVG could not be rendered; placeholder inserted."

Only show Failed if slide cannot be rendered at all (invalid slide structure, fatal export error).

## Q3. Export readiness contract for `__slideReady`

MVP readiness criteria:
- text/layout mounted and measured
- fonts resolved (or timed out)
- non-text assets loaded or explicitly marked degraded
- slide stable for 2 consecutive animation frames

Timeout budget:
- poll every 200ms
- soft wait until 5000ms
- then 2 retries, each after 750ms
- hard degrade at 8000ms total per slide

Final degrade condition:
- if base layout + text present, export current state and degrade unresolved non-critical assets via fallback/placeholder.

Hard fail only if base layout/text never mounts or `slideContent` is invalid.
- hard-fail code: `E_SLIDE_READY_TIMEOUT`

## Q4. Rollout guardrails and rollback authority

Progressive rollout stages:
- internal dogfood -> 1% -> 5% -> 25% -> 50% -> 100%
- hold each stage for at least 24 hours or 500+ exports (whichever is later)

Must-watch metrics:
- export success rate
- `E_SLIDE_READY_TIMEOUT` rate
- `W_SVG_PLACEHOLDER` rate
- p95 export latency
- browser crash/OOM rate
- warning-only export rate

Immediate stop/rollback thresholds:
- export success rate drops >1.0% vs control
- `E_SLIDE_READY_TIMEOUT` exceeds 0.3% of slides
- `W_SVG_PLACEHOLDER` exceeds 0.5% of slides
- p95 export latency regresses >15%
- crash/OOM rate increases >0.1% absolute

Rollback owner:
- primary: Canvas Edit FE on-call
- secondary: Export pipeline on-call
- PM may request rollback; engineering on-call has final push-button authority
