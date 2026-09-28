# Section 03 — Production Episode UI

## UI/UX Contract

### Target User / JTBD
- Role: Vertical Drama creator/producer.
- Goal: choose a Sub-EP range, create publishable Production Episodes, and inspect/download the results.
- Entry point: Series detail → ตอนเต็ม (Production).
- Success outcome: each EP has a clear range/status and a playable downloadable artifact.

### Existing Pattern Reference
- Search: `rg -n "productionEpisodes|assembleProductionEpisodes|compiled-video|requestFullscreen|download" apps/web/client/src/pages apps/web/client/src/components/verticalDramaSeries`.
- Found: `VerticalDramaProductionEpisodesPanel.tsx`, `VerticalDramaSeriesDetailPage.tsx` player, `VerticalDramaSeriesTrailerPanel.tsx` polling.
- Decision: reuse existing panel, Radix controls, polling, and player; extend rather than create a new page.

### Surface Inventory
| Surface | File/route | Change |
|---|---|---|
| Production tab | `VerticalDramaSeriesDetailPage.tsx` | keep existing entry |
| Assemble form | `VerticalDramaProductionEpisodesPanel.tsx` | range, grouping, source, overlay options |
| EP result cards | same | status, summary, player/actions |

### Component Map
| Component | File | Owns | Consumes |
|---|---|---|---|
| Production panel | existing file | form/query/mutation/states | series manifest, tRPC |
| Player | existing/local helper | play/fullscreen/download | completed video URL |

### State Matrix
| State | Expected UI | Verification |
|---|---|---|
| loading | skeleton | component test/manual |
| empty | explain source prerequisite | component test |
| invalid | inline range/group error | component test |
| pending | queued/rendering badge and disabled duplicate submit | component test |
| partial | completed cards plus failed/skipped details | component test |
| success | range/status/duration/player/actions | component test |
| error | cached prior data retained with retry/toast | component test |
| focus/disabled | visible focus and disabled controls | browser/manual |

### Responsive Matrix
| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | controls stack, cards remain scrollable, primary action reachable | screenshot/manual |
| tablet 768x1024 | two-column controls where safe | screenshot/manual |
| desktop 1440x900 | compact form plus full result cards | screenshot/manual |
| small-mobile 360x800 | no horizontal overflow | extended if tooling available |

### Accessibility Acceptance
- Every number/select/checkbox has a visible label and accessible name.
- Keyboard order follows range → grouping → source → overlays → submit → result actions.
- Focus ring remains visible; icon-only actions have labels.
- Async buttons expose disabled/busy state; motion is restrained.

### Copy Contract
- Thai primary copy with existing English fallback via `lang`.
- Explicitly distinguish “ตอนย่อย” and “ตอนเต็ม (Production)”.
- Validation: minimum 3; invalid range; missing source; short remainder decision.
- Status copy: รอคิว, กำลัง Render, สำเร็จ, ล้มเหลว, ข้าม.

### Browser Evidence Required
Follow `orchestra/references/ui-browser-verification.md`; capture mobile/tablet/desktop or record tooling blockers.

## Acceptance

Existing player behavior remains intact. New controls cannot submit invalid ranges, and refresh/refetch does not erase completed or pending cards.
