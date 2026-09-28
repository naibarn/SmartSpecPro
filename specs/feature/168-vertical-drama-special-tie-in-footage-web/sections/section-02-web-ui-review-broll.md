# Section 02 — Special Tie-in UI, review gate and B-roll timeline

## UI/UX Contract

### Target User / JTBD
- Role: drama creator
- Goal: turn real footage into a natural series tie-in with optional AI B-roll
- Entry point: existing Special Tie-in dialog
- Success outcome: protected prepared video, reviewed human-readable story, exact nine-shot plan and renderable B-roll timeline

### Existing Pattern Reference
- Searched: `apps/web/client/src/components/verticalDramaSeries/SpecialTieInEpisodeDialog.tsx`, media preview/fullscreen components, model-selection tests and existing upload/media history surfaces
- Found patterns: existing Special Tie-in dialog, protected media preview and searchable model selector
- Decision: reuse
- Reason: preserve established auth, selection and media behavior; add only footage-first stages

### Surface Inventory
| Surface | File/route | Change |
|---|---|---|
| Special Tie-in dialog | `SpecialTieInEpisodeDialog.tsx` | add Footage/Story/B-roll stages |
| protected preview | existing media preview seam | add fullscreen and Range-safe playback |
| history | existing idea history seam | explicit expand/select, never auto-current after F5 |
| Character/Scene tabs | existing vertical drama tabs | pending look/scene slot links |

### Component Map
| Component | File | Owns | Consumes |
|---|---|---|---|
| Footage intake | existing/new vertical drama component | upload/select, status, preview | upload/status queries |
| Guide disclosure | same feature area | markers, warning acknowledgment | `vd-footage-guide-v1` |
| Story review editor | same feature area | prose and action/dialogue edits | three ideas/story revision |
| Model selectors | existing selector primitive | LLM/image/video search/default | current catalog |
| B-roll timeline | same feature area | millisecond placement/conflict | prepared artifact/shot plan |

### State Matrix
| State | Expected UI | Verification |
|---|---|---|
| loading | progress and close-safe notice | component/browser |
| empty | upload/select explanation | component |
| error | typed message, trace, retry | component/browser |
| success | protected preview, guide or cards | component/browser |
| partial success | warning + acknowledgment before story generation | component/browser |
| disabled | model/action disabled with reason | component |
| selected | one character/card/model visibly selected | component/browser |
| hover/focus | visible non-color-only affordance | browser/a11y |

### Responsive Matrix
| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | stacked stages, bottom-sheet fullscreen preview, horizontal timeline | screenshot/E2E |
| tablet 768x1024 | stacked controls, readable guide/editor | screenshot/E2E |
| desktop 1440x900 | two-column controls, full-width timeline | screenshot/E2E |
| small-mobile 360x800 | no clipped primary actions; scroll dialog | screenshot/manual |
| laptop 1024x768 | no overlap between selectors and guide | screenshot/manual |
| wide-desktop 1280x800 | timeline remains usable without hidden controls | screenshot/manual |

### Accessibility Acceptance
- Keyboard path: upload/select → model selectors → character cards → idea/history → story editor → nine-shot → timeline → render
- Focus visibility: visible focus ring and focus restore after fullscreen/history dialogs
- Labels/semantics: labelled file input, time fields in milliseconds/seconds display, `role=status`, buttons not icon-only
- Contrast: status and selected states remain understandable without color alone
- Reduced motion: disable animated preview transitions when `prefers-reduced-motion` is enabled

### Copy Contract
- Tone: clear, human, series-production oriented; no direct-sales wording
- Primary language(s): Thai, with English fallback
- Required labels: `อัปโหลด Footage จริง`, `วิเคราะห์ Footage`, `สร้าง Footage พร้อมใช้`, `สร้างไอเดีย 3 ใบ`, `ตรวจสอบเรื่อง`, `สร้าง 9 ช็อต`, `วาง AI B-roll`, `ไม่มีบทพูดใหม่`
- Validation/error copy: explain missing model, incomplete upload, partial guide, stale revision, overflow and retry action
- Empty/loading/success copy: distinguish `ยังไม่มี footage`, `กำลังวิเคราะห์`, `พร้อมตรวจสอบ`, `สร้างเรื่องแล้ว`, `กำลัง render`
- Localization/fallback notes: preserve dialogue/no-dialogue and original-audio distinction in English

### Browser Evidence Required
- Follow `skills/orchestra/references/ui-browser-verification.md`.
- Capture mobile/tablet/desktop plus extended dense-layout viewports; prove no console errors, no unintended horizontal overflow, keyboard/focus, fullscreen, F5/history, model search, individual character selection, partial-guide acknowledgment and timeline bounds.

## Ownership

Own `SpecialTieInEpisodeDialog`, supporting preview/guide/story/timeline components and Character/Scene pending slot links. Do not render video or infer authoritative DNA/Scene Visual State in the client.

## TDD and acceptance

Component tests must prove one-character click selects one character, preview opens fullscreen, old ideas stay in history after refresh, no-dialogue hides/rejects lines, and timeline rejects overflow. Browser test must cover the complete staged flow.
