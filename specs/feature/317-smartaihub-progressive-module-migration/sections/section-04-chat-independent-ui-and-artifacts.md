# Section 04 — Independently built Chat UI and artifacts

## Requirement IDs

`REQ-2B7D77E6D086`, `REQ-2E717B8BD3E7`, `REQ-32CAB23B7018`, `REQ-295AD937395C`, SPEC-317 R1.2 and R1.6/R1.7.

## Objective

Build the Chat experience fresh as an independently versioned React/Vite module. The Shell loads the Chat manifest and hashed module asset only when `/chat` is selected. Add basic conversation history/composer/streaming, one safe structured response block and a persistent artifact panel without the Legacy dashboard or chat runtime.

## Owned paths

In `/mnt/SmartSpecDev/projects/smartaihub-platform`: `modules/chat/src/ui/**`, Chat Vite config/styles/assets and tests; minimal Shell module-loader integration owned with section 02 must be coordinated before editing shared loader files.

## Prerequisites

Sections 01–03 define package manifest, Shell module-loader contract and Chat API DTO/stream protocol.

## UI/UX Contract

### Target User / JTBD
- Role: signed-in SmartAIHub user.
- Goal: continue/create a conversation, receive streamed results and inspect generated artifacts.
- Entry point: `/chat` after login or a Chat deep link.
- Success outcome: Chat is the actual primary workspace and retains conversation/artifact references across reloads.

### Existing Pattern Reference
- Searched (rg query): `rg -n "conversation|artifact|stream|ChatSidebar|ChatView" apps/web/client/src/pages apps/web/client/src/components/chat`.
- Found: Legacy `UnifiedWorkspace.tsx`, `Chat.tsx`, `ChatView.tsx`, `ChatSidebar.tsx`, and artifact rendering references.
- Decision: diverge in code/package and simplify navigation; retain feature behavior/state expectations only.
- Reason: the old monolithic UI is expressly a reference, not a runtime or visual package dependency. The requested product has Chat as the front door and no Legacy Dashboard.

### Surface Inventory
| Surface | File/route | Change |
|---|---|---|
| Conversation history | `/chat` left rail/panel | New compact list with empty and selected states |
| Message canvas | `/chat` main panel | New user/assistant messages and stream state |
| Composer | `/chat` lower panel | Keyboard-friendly prompt and send/cancel |
| Structured message | Message renderer | Typed code/diagram/choice block; text fallback |
| Artifact panel | `/chat` side panel | Persistent selected artifact/version reference |

### Component Map
| Component | File | Owns | Consumes |
|---|---|---|---|
| ChatModuleElement | `modules/chat/src/ui/entry.tsx` | Independent mount/unmount and module lifecycle | Shell host element |
| ConversationList | `modules/chat/src/ui/ConversationList.tsx` | Recent sessions/selection | Chat API |
| MessageTimeline | `modules/chat/src/ui/MessageTimeline.tsx` | Text stream and typed blocks | Chat API event contract |
| Composer | `modules/chat/src/ui/Composer.tsx` | Draft/send/cancel states | Chat API |
| ArtifactPanel | `modules/chat/src/ui/ArtifactPanel.tsx` | Persisted artifact selection/preview | canonical artifact references |

### State Matrix
| State | Expected UI | Verification |
|---|---|---|
| loading | Small skeleton or status line | UI test |
| empty | Clear start-chat prompt | UI test |
| error | Recoverable error and retry; no raw server details | UI test |
| success | Messages and streamed response in order | SSE/client test |
| partial success | Partial stream labeled and retained only if API confirms persistence | contract test |
| disabled/focus/hover | Disabled send during request; visible keyboard focus | accessibility/browser check |

### Responsive Matrix
| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | Conversation list and artifact panel become dismissible sheets | Browser check |
| tablet 768x1024 | Collapsible history; artifact panel overlays or docks | Browser check |
| desktop 1440x900 | History, conversation, artifact panel in three columns where space permits | Browser check |
| small-mobile 360x800 | Composer and message actions remain usable | Extended because dense chat controls |
| laptop 1024x768 | Artifact panel collapses without hiding composer | Extended because multi-panel boundary |
| wide-desktop 1280x800 | No oversized blank dashboard/card grid | Extended if layout risk |

### Accessibility Acceptance
- Keyboard path: history → message list → composer → artifact panel; send/cancel/close are keyboard operable.
- Focus visibility: focus remains in composer after sending; announce stream status without stealing focus.
- Labels/semantics: messages and artifacts have labeled regions, timestamps are readable, structured blocks expose copy/selection semantics.
- Contrast: semantic theme tokens preserve text/control contrast in Light, Dark, Balance.
- Reduced motion: streaming and panel transitions respect reduced motion.

### Copy Contract
- Tone: concise and helpful, no fake operational success.
- Primary language(s): Thai/English; preserve user prompt/assistant language.
- Required labels: `แชต` / `Chat`, `ข้อความ` / `Message`, `ส่ง` / `Send`, `หยุด` / `Stop`, `ไฟล์ที่สร้าง` / `Artifacts`.
- Validation/error copy: indicate unavailable provider, expired session, rate limit, network failure and retry separately.
- Empty/loading/success copy: show an honest ready/typing/complete state from API events only.
- Localization/fallback notes: system labels use saved locale; generated output is never silently translated.

### Browser Evidence Required
- Follow `skills/orchestra/references/ui-browser-verification.md`; mobile 390x844, tablet 768x1024, desktop 1440x900. Browser evidence for a live provider requires approved credentials; UI states can be contract-stubbed separately and clearly labeled.

## Completion predicate

Chat UI and assets build separately from Shell/Core; Shell lazy-loads a versioned artifact. It supports empty/history/stream/error states, one typed structured block and a persistent artifact panel. No old dashboard or cross-module implementation import exists.

## Verification/evidence

Chat-only Vite/Wrangler builds; component/API tests; package dependency closure; screenshots/routes with browser checks when available. Report JS/CSS sizes and initial route asset bytes.

## Fallback and gap strategy

Use a plain text fallback when a structured renderer is unknown. Hide browser-dependent actions when no authorized browser adapter exists. Keep the Shell and text Chat usable when the artifact service or optional provider is unavailable.
