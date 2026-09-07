# Section 04 — Production UI and UX

## Goal

Make group-native sound planning discoverable on the Production tab and keep
member plans visible only as clearly labelled source context.

## Ownership paths

- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaProductionEpisodesPanel.tsx`
- new `apps/web/client/src/components/verticalDramaSeries/VerticalDramaProductionGroupAudioPanel.tsx`
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaEmotionScorePanel.tsx` only for episode/read-only compatibility behavior
- `apps/web/client/src/pages/VerticalDramaSeriesDetailPage.tsx` route wiring verification
- focused UI tests beside the existing Production panel tests

## UI/UX Contract

### Target User / JTBD

The user is a Vertical Drama producer/editor. Entry is
`/drama-series/:seriesId?tab=production`. Their job is to understand readiness,
approve a coherent Production EP plan, generate genuine Music 3 takes and
publish a QC-backed mix.

### Surface Inventory

1. Render an always-visible card after the Production Episode creation form and
   before the group list, independent of `groups.length`.
2. Use heading `เพลงและเสียงประกอบระดับ Production EP` / `Production Episode
   Sound & Music Score` in the empty/readiness card.
3. In a valid card, use the primary heading `วิเคราะห์อารมณ์และวางแผนเพลงระดับ
   Production EP`, final-cut row, stage rail (plan → rights → ASR/edit-map →
   Music 3 → takes → score mix/QC), current action, takes/provenance and a
   collapsed `แผนระดับตอนย่อย (Source)` disclosure.
4. Never call a member plan a Production Episode plan and never select the first
   member as a group source.

### State Matrix

Cover loading, no group, assembly pending, missing final-cut artifact, ready,
analysis running, needs review/stale, rights pending, generating, takes
published, QC failed, published, read-only and feature-flag-off. Every blocked
state shows a visible reason and next action; disabled controls are not
tooltip-only. The heading remains visible when the flag is off, while mutation
actions stay disabled.

### Responsive Matrix

Verify 390x844, 768x1024, 1440x900, 360x800, 1024x768 and 1280x800. Cards are
single-column on narrow screens, stage rail wraps or scrolls without page-level
horizontal overflow, take rows wrap, and blocked reasons/primary CTAs remain
reachable.

### Accessibility Acceptance

Use semantic headings/sections/lists/buttons and native details/summary where
appropriate. Maintain keyboard order readiness → plan → action → details →
takes → provenance → source plans. Give icon controls names, retain visible
focus, pair status text/icon with color, use polite live updates for polling and
respect reduced motion.

### Copy Contract

Reuse existing Card/Badge/Button/Skeleton/tokens and status conventions. Keep the
readiness card compact. Required copy distinguishes `Production EP` and `ตอนย่อย`;
empty copy states that a Production Episode must be created before final-cut
analysis. Preserve deterministic server/Worker error reasons.

### Component Map

`VerticalDramaProductionEpisodesPanel` owns readiness and group placement;
`VerticalDramaProductionGroupAudioPanel` owns group stage actions; the existing
`VerticalDramaEmotionScorePanel` remains member/episode scoped.

### Browser Evidence Required

Capture authenticated empty, pending, blocked, published and read-only states
at the six required viewports. A hosted app shell without authenticated state is
not completion evidence.

## TDD and browser evidence stubs

- Heading renders with zero groups and CTA is disabled with explanation.
- Valid group renders group panel; member panels are under source disclosure.
- All state/read-only/accessibility cases have component tests.
- Browser screenshots/evidence cover the six viewports and authenticated empty,
  pending, blocked, published and read-only states. If auth/deployment/Worker is
  unavailable, record the skipped evidence explicitly.

## Exit criteria

The supplied screenshot state visibly contains the new Production EP sound/music
heading before any Production Episode is created, while completed groups expose
the true group-native workflow without changing the existing member workflow.
