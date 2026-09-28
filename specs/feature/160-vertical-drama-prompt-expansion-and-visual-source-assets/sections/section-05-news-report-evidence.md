# Section 05 — News Report Evidence

## Objective

Implement the separate news_report profile with claim/evidence ledger, freshness/as-of/attribution, correction staleness, Nan fixture, and publish readiness while reusing shared source/media/snapshot infrastructure.

## Dependencies

- Sections 01–04.
- Existing profile registries, skill/web research path, story-generation contract, source-pack service, and quality/QC patterns.

## Ownership

- Add apps/web/server/services/verticalDramaNewsReportService.ts.
- Extend verticalDramaSeries.ts or add a focused verticalDramaNewsReport router module with claim ledger, evidence verification, correction, and readiness procedures.
- Extend profile registries/seed data and shared profile types with news_report and modes breaking, developing, explainer, retrospective.
- Add apps/web/client/src/components/verticalDramaSeries/VerticalDramaNewsEvidencePanel.tsx and integrate it into the planning/story review route.
- Add server/client tests and a Nan flood/landslide fixture with dates, numbers, geography, station N.1 history, source links, and correction revision.

## Server behavior

Profile recommendation is advisory until the user selects the profile. Every current/numerical/material claim starts as needs_verification. Research evidence must carry URL/title/publisher/published/accessed time and the claim scope it supports. Partial and contradictory sources remain visible.

Current reports require asOf and validity. Freshness is computed from claim type and source timestamps, with an explicit stale result when the evidence window expires. Archive/file footage requires disclosure. AI visuals remain illustrative and cannot verify claims.

Corrections create a new immutable evidence revision and stale dependent claims, narration, subtitles, lower-thirds, story outputs, visual bindings, and assembly projections without deleting audit history. Readiness blocks when required claims lack current evidence or visual coverage.

The Nan fixture extracts and maps claims such as 7 districts/34 subdistricts/223 villages, more than 20,000 families, 19–21 August monitoring, N.1 history, 8.40–8.50m wall capacity, 8.72m water level, and 22–32cm overflow. It must prove supplied text is not silently treated as verified fact.

## UI/UX Contract

### Target User / JTBD

- Role: editor/reporter.
- Goal: decide whether a report is factually supported and whether every claim has an appropriate visual source.
- Entry point: news_report planning/review surface.
- Success outcome: publish readiness explains verified, partial, stale, contradictory, and missing claims.

### Existing Pattern Reference

- Reuse AIDraftModal research/source cards, marketplace insight/source displays, and Vertical Drama run/QC finding views. Targeted search covered evidence, source, research, claim, and run-detail components under apps/web/client/src.
- Decision: reuse badges, warning cards, source links, and QC finding presentation; add claim-row/correction controls because no current surface combines claim scope and visual binding.

### Surface Inventory

| Surface | Change |
|---|---|
| profile selector | add news_report and mode |
| claim ledger | claim rows, sources, as-of/freshness |
| visual mapping | attach source slot/segment within evidence scope |
| correction panel | create revision and show stale cascade |
| readiness gate | block/allow with actionable findings |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| VerticalDramaNewsEvidencePanel | client/src/components/verticalDramaSeries/VerticalDramaNewsEvidencePanel.tsx | claim/evidence rows, correction, readiness | claim ledger/readiness queries |
| NewsClaimRow | same or extracted child | one claim status, sources, visual refs | NewsClaim projection |
| profile/review integration | existing series detail surface | profile selection and placement | news profile state |

### State Matrix

Cover loading, empty, needs verification, verified, partial, contradictory, stale/corrected, archive/file-footage, blocked publish, correction pending, and successful readiness. Every blocked state has a corrective action.

### Responsive Matrix

Use mobile 390x844 stacked claim disclosure panels, tablet 768x1024 collapsible columns, desktop 1440x900 claim/evidence table-like layout, and extended small-mobile 360x800/laptop 1024x768/wide-desktop 1280x800 checks for long source titles and correction history.

### Accessibility Acceptance

Semantic headings and labelled claim rows, keyboard source links/correction controls, non-color status text, focus-visible controls, screen-reader descriptions for stale/verified states, reduced-motion-safe transitions.

### Visual/token direction

Reuse existing semantic status tokens, badges, warning cards, links, typography, spacing, and QC/readiness density. Do not create a separate visual language.

### Copy Contract

Thai-first with English fallback: “ข้อเท็จจริง/Claim”, “แหล่งข้อมูล”, “ณ วันที่”, “ยืนยันแล้ว”, “รอตรวจสอบ”, “ข้อมูลล้าสมัย”, “ข้อมูลขัดแย้ง”, “สร้างฉบับแก้ไข”. Never call an AI illustration verified.

### Browser Evidence Required

Capture Nan needs-verification, verified, stale correction, contradictory, archive label, and blocked publish states at required viewports.

## Tests-first requirements

Test profile/mode registration, claim normalization, as-of/freshness, source scope, evidence transitions, AI illustration non-verification, correction stale cascade, archive disclosure, Nan fixture, tenant scope, and all client states.

## Acceptance

- News is a separate editorial profile with stricter evidence rules but shared infrastructure.
- Every material claim has visible evidence state and attribution/as-of.
- Corrections cannot leave stale downstream story or assembly output publishable.

## Implementation record

- Added `verticalDramaNewsReportService.ts` with claim freshness, readiness, immutable correction revision, archive disclosure, and AI-illustration policy checks.
- Added `evaluateNewsReport` and `previewNewsCorrection` procedures with explicit `needs_verification`, `stale`, and contradiction-preserving behavior.
- Added `VerticalDramaNewsEvidencePanel.tsx` with Thai/English claim rows, status text, visual-coverage indication, and actionable freshness evaluation.
- Focused proof covers current/stale claims, correction invalidation, visual coverage blocking, and non-verified AI/media semantics.
