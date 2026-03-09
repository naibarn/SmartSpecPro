# Request

## Original User Request

วางแผนปรับปรุงตามที่แนะนำทั้งหมด

## Normalized Brief

Plan the next follow-up round for Presentation media motion based on the latest implementation review.

This package must cover all recommended improvements:

- make `inline SVG` image elements honor motion effects in all playback/export surfaces
- harden `mediaMotion` normalization so invalid presets do not behave like active motion
- strengthen runtime verification beyond today's prop/string checks, especially for `PlayMode` and `slideRender` record mode
- surface static-export motion warnings earlier and more clearly in export UX

## Required Surfaces

- `Play Slideshow` in the editor
- `PlayMode`
- `export mp4`
- static export UX for `png/jpg/pdf`

## Assumptions

- The next round is still incremental hardening on top of packages `001` and `002`, not a rewrite
- Current test stack remains `vitest`-first; any stronger runtime smoke should fit the existing repo unless a clear browser harness already exists
- Product intent is already clear enough to plan without new user questions

## Non-Goals

- No new effect families beyond the current zoom/pan motion system unless required to support parity
- No database or infrastructure changes
