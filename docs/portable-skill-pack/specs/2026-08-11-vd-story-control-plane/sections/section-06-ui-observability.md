# Section 06 — UI and Observability

## Scope

ขยาย memory/state surfaces เดิมให้ผู้สร้างตรวจ thread lifecycle, evidence, legacy status, romance rhythm และ advantage curve ได้ โดยไม่สร้าง mutation path ใหม่ที่ขัดกับ append-only/event-log design

## Owned files/modules

- `apps/web/client/src/pages/VerticalDramaSeriesDetailPage.tsx`
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaSeriesMemoryStateTab.tsx`
- `VerticalDramaSeriesMemoryTab.tsx`, `VerticalDramaMemoryTimeline.tsx` as existing references
- new focused `VerticalDramaStoryControlSummary.tsx`, `VerticalDramaStoryRhythmTimeline.tsx`, `VerticalDramaLegacyThreadAuditPanel.tsx`
- copy, component tests and browser evidence artifact

## UI/UX Contract

### Target User / JTBD

- Role: ผู้สร้าง/ผู้ตรวจซีรีย์และผู้ดูแลคุณภาพ
- Goal: รู้รหัสปม สถานะ อายุ ช่วงเฉลย หลักฐาน และ rhythm ที่ตอนถัดไปต้องรักษา
- Entry: `/drama-series/:seriesId?tab=seriesMemory`, event-log tab and links from quality findings
- Success: ผู้ใช้แยก open, resolved-with-evidence, overdue, needs-review และ legacy-unknown ได้ทันที

### Existing Pattern Reference

Search existing `VerticalDramaSeriesMemoryStateTab`, `VerticalDramaSeriesMemoryTab`, `VerticalDramaMemoryTimeline` and `/drama-series/:seriesId` route with `rg`. Decision: reuse the current cards, tabs, skeletons, alerts, accordion, query/mutation and read-only patterns. Do not create a second thread list.

### Surface Inventory

| Surface | Owner | Contract |
|---|---|---|
| series memory state | existing state tab | materialized projection and safe inspection/edit boundary |
| event log | existing memory tab | append-only evidence/history; no plan mutation |
| summary | `VerticalDramaStoryControlSummary.tsx` | counts and warnings from deterministic projection |
| rhythm | `VerticalDramaStoryRhythmTimeline.tsx` | read-only romance/advantage intent and findings |
| legacy audit | `VerticalDramaLegacyThreadAuditPanel.tsx` | classifications and source links |

### Component Map

The existing state tab owns query state and safe inspection/edit boundaries. The event-log tab remains append-only. The summary, rhythm timeline and legacy audit panel are focused read-only consumers of the projection; none may mark a produced episode or thread resolved.

Thread card must show `รหัสปม`, scope, owner characters, opened/last moved episode, payoff window, evidence episode/beat, resolved episode/time and status reason. It cannot directly mark a produced episode or thread resolved.

The same read-only control surface must show the selected duration profile, 9 logical shots, derived runtime and `duration_pending`/`legacy_compat` status. It must not imply that every episode is 60 seconds, and it must distinguish logical shot count from provider clip/frame count when the assembly profile uses a bridge mapping.

### State Matrix

| State | Expected UI | Proof |
|---|---|---|
| loading | existing skeleton, never zero counts | component/browser |
| empty/no plan | explain not generated; show legacy memory if available | component |
| audit-only | visible badge; warnings/unknown; no enforced claim | component/browser |
| success/enforced | counts, IDs, filters, evidence | component |
| partial/needs review | explicit incomplete label, never “closed” | component |
| error | cached data if available + retry | component |
| read-only/disabled | no mutation controls, inspection links remain | component |
| selected/focus/hover | visible selection/focus ring | browser |

### Responsive Matrix

| Viewport | Requirement |
|---|---|
| mobile 390x844 | stacked cards, visible ID/status, compact or scrollable timeline |
| tablet 768x1024 | wrapped filters, columns only when readable |
| desktop 1440x900 | existing density with summary/filter/card hierarchy |
| small-mobile 360x800 | full accessible ID via wrap/label, no clipped actions |
| laptop 1024x768 | sidebar/content remains usable, no page overflow |
| wide-desktop 1280x800 | evidence metadata not clipped in dense cards |

### Accessibility Acceptance

Keyboard order covers filters, cards, evidence links and accordions. Status uses text/icon plus color, not color alone. IDs are selectable text with accessible labels. Expandable panels expose semantic heading/expanded state. Contrast, focus rings, dark/light readability and reduced-motion behavior follow existing tokens/primitives.

### Visual direction and tokens

Reuse existing Card, Badge, Alert, Accordion, Separator, Skeleton, Button and theme semantic tokens. Preserve Thai typography, current density and monospace ID treatment; no raw hex/px tokens or new global reset. Motion is limited to existing expand/collapse behavior.

### Copy Contract

Thai-first with existing English fallback. Required distinctions include `ยังไม่พบหลักฐานการเฉลย`, `ปมยังเปิดอยู่`, `ปมเก่าที่ยังไม่ทราบสถานะ`, `พักปม`, `ปมสำหรับภาคต่อ`, `ค้างเกินกำหนด` and `ปิดในตอน`. Never label audit-only or unresolved data as closed.

### Browser Evidence Required

Record `implementation/ui-browser-evidence.md` for the route at required 390x844, 768x1024 and 1440x900, plus the extended dense-layout viewports. Check console, overflow, keyboard, accessible names, loading/empty/error/read-only/audit-only states and light/dark readability. Skipped checks remain skipped.

## TDD stubs

- status/evidence fields render and do not disappear on narrow viewports
- resolved history and event-log data remain separate
- every loading/empty/error/partial/read-only state has truthful copy
- filters, links, keyboard focus, accessible names and non-color status pass
- Thai/English copy completeness
- browser screenshots show no new console errors or unintended overflow

## Acceptance

ผู้ใช้เปิด tab เดิมแล้วตรวจสอบได้ว่าปมถูกเปิดเมื่อไร ขยับเมื่อไร ปิดเมื่อไร และปิดด้วยหลักฐานอะไร โดย legacy unknown และ needs review ยังมองเห็นชัดเจน
