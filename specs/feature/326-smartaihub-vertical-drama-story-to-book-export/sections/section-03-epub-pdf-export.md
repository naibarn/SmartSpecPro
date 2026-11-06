# Section 03 — EPUB and PDF export

## Requirement IDs

All ledger requirements for EPUB3.3, PDF selectable Thai text, cover and text/images, all-shot ordering, navigation/contents, validation, profiles, checksums/read-back, private artifacts, independent formats/retry, safe escaping/path handling, bounded memory and sanitized failures.

## Objective and deliverable

Generate independent EPUB and PDF artifacts from one approved immutable Book revision, validate each before availability, store privately and expose authorized downloads. EPUB is reflowable; PDF is stable A5 digital-reading output.

## Owned scope

- Renderer/profile modules and tests under `apps/web/server/services/verticalDramaBook*`.
- Export job registrations and artifact handling.
- Avoid UI ownership (section 04).

## Prerequisites

Section 01 and 02 integrated; confirm Playwright/Chromium/Thai-font and EPUBCheck availability in canonical worker runtime before claiming either renderer production-ready.

## Design constraints

- Renderer accepts validated typed document and server-resolved local bytes only.
- Escape all text; no remote resources, arbitrary HTML, user paths, network navigation, or archive traversal.
- EPUBCheck required; PDF checks include pages, metadata and extractable Unicode text. Write object privately, checksum and read back before `available`.
- Keep per-format operation IDs and idempotency independent; preserve successful counterpart on failure.
- Bounded chapter/image batches; enforce configured limits before unbounded allocations.

## Completion predicate and evidence

Focused fixtures prove cover/text/each selected image exactly once, Thai Unicode remains selectable/extractable, correct order/navigation, alt-text warning, safe failure on missing art, no remote resource, valid EPUBCheck output, private storage read-back and isolated retry behavior.

## Fallback / blocker strategy

Do not bundle/install Chromium or fonts without repository/runtime support. If a runtime executable is absent, finish renderer interfaces and EPUB path where possible, represent exact capability as unavailable, and keep PDF requirements open rather than producing invalid files.

## UI/UX Contract

### Target User / JTBD
N/A — renderer and artifact pipeline only; download presentation is covered by section 04.

### Existing Pattern Reference
N/A — no visible surface is changed in this section.

### Surface Inventory
N/A — no route or component is changed.

### Component Map
N/A — server-side renderer modules only.

### State Matrix
N/A — no UI state is changed.

### Responsive Matrix
N/A — no UI surface is changed.

### Accessibility Acceptance
N/A — no UI surface is changed.

### Copy Contract
N/A — no user-facing copy is added.

### Browser Evidence Required
N/A — no UI surface is changed.
