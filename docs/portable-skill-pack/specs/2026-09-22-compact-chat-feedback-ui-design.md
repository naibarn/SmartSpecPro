# Compact AI Chat & Feedback UI Design

## Goal

ปรับปรุงเฉพาะหน้า AI Chat & Feedback ฉบับย่อให้ดูหรูหรา ใช้พื้นที่กระชับขึ้น
แต่ยังคงองค์ประกอบและความสามารถเดิมทั้งหมด โดยให้ composer และปุ่มส่งข้อความ
เป็นจุดเด่น และรองรับ desktop, tablet และ mobile อย่างเหมาะสม

งานนี้ต้องทำงานร่วมกับ notification stack เดิมอย่างสมบูรณ์ โดยไม่สร้างระบบ
แจ้งเตือนซ้ำหรือบังการแจ้งเตือนที่มี priority สูงกว่า

## Scope and Non-goals

- เปลี่ยนเฉพาะ presentation ของ `FeedbackButton` dialog และ `ChatView` เมื่อถูกใช้
  ใน dialog นี้
- คงการสร้าง conversation, model selection, task control, feedback submission,
  attachment, media generation และ send handlers เดิม
- ไม่เปลี่ยน API, schema, routing, worker flow หรือเพิ่ม dependency
- ไม่ปรับหน้าหลัก `/chat` ให้ได้รับผลกระทบจาก compact mode
- ไม่แทนที่หรือย้าย ownership ของ `GlobalAlerts`, notification bell, urgent
  center modal, SSE notification stream หรือ `/notifications`

## UI/UX Contract

### Target User / JTBD

- Role: ผู้ใช้ทั่วไปที่เปิด AI Chat จากปุ่มลอยทั่วระบบ
- Goal: พิมพ์และส่ง prompt ได้เร็ว พร้อมเข้าถึง model, task control, media actions
  และ feedback ได้โดยไม่เสียพื้นที่หน้าจอ
- Entry point: ปุ่ม `Open AI Chat and Feedback`
- Success outcome: ช่องพิมพ์และปุ่มส่งเห็นชัด ใช้งานด้วย touch ได้จริง และไม่มีการ
  ตัด/ล้นของ controls ใน viewport หลัก

### Existing Pattern Reference

- Searched: `apps/web/client/src/components/guardian/FeedbackButton.tsx`,
  `apps/web/client/src/components/chat/ChatView.tsx`, related Chat tests, and
  Astryx build kit for `compact AI chat and feedback modal with responsive composer`.
- Found patterns: existing `FeedbackButton` combined dialog; existing `ChatView`
  composer with tooltip-wrapped icon actions; Astryx `ChatLayoutPanelChat` and
  `ChatComposerDrawer` reference patterns.
- Decision: reuse.
- Reason: retain existing behavior and state handling; use compact mode only for
  presentation differences in the embedded surface.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Floating entry button | `components/guardian/FeedbackButton.tsx` | Preserve behavior; refine compact visual density and touch target |
| Combined dialog shell | `components/guardian/FeedbackButton.tsx` | Responsive width/height, full-screen mobile, refined header/tabs |
| Embedded AI chat | `components/chat/ChatView.tsx` | Add presentation-only compact density |
| Task Control tab | `components/chat/UniversalControlPlanePanel.tsx` | No behavior change; inherit improved shell |
| Feedback tab | `components/guardian/FeedbackButton.tsx` | Preserve form and attachment behavior; responsive spacing only |
| Global alert stack | `components/GlobalAlerts.tsx` / `App.tsx` | Compatibility only; no duplicate notification owner |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| `FeedbackButton` | `components/guardian/FeedbackButton.tsx` | Dialog shell, tabs, feedback form, open/close state | Existing `ChatView`, `UniversalControlPlanePanel` |
| `ChatView` | `components/chat/ChatView.tsx` | Chat data flow and composer | New optional `density="compact"` presentation prop |
| `UniversalControlPlanePanel` | existing file | Task control behavior | Existing dialog content area |

### Notification Compatibility Contract

- `GlobalAlerts` remains the single global owner for notifications across the app.
- The compact Chat dialog must remain below the existing global alert layers:
  - notification bell: z-index `9990`
  - urgent reminder modal: z-index `9998`
  - urgent message modal: z-index `9999`
- Opening Chat must not unmount, replace, or intercept the notification bell,
  SSE stream, notification polling, toast actions, or urgent modal dismissal/view
  actions.
- An urgent modal must be able to appear above the Chat dialog while the Chat dialog
  is open. Its action must still navigate to the original target and mark/read or
  dismiss using the existing flow.
- The bell must still open its dropdown, show unread count/history, and route to
  `/notifications` or existing action URLs. The compact Chat redesign must not add a
  second bell or a competing notification center.
- Existing escalation paths remain intact: SSE event -> cache invalidation -> toast/
  urgent surface -> notification history/deep link where the backend provides it.
- Feedback notifications must continue to use the existing `resolveNotificationActionUrl`
  compatibility path, including `/admin/feedback-hub?ticketId=...` for recognized
  feedback/job failure notifications.

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading | Compact centered spinner and readable status | Existing loading test plus visual inspection |
| empty | Existing start-conversation message remains centered | Existing ChatView empty state |
| error | Existing error message and retry action remain reachable | Existing error branch and focused test |
| success | Chat history and composer fit without horizontal overflow | Browser viewport checks |
| selected tab | Active tab has clear fill/contrast and `aria-selected` | Focused component test |
| disabled/streaming | Send/media controls retain disabled state and visible affordance | Existing ChatView behavior plus visual inspection |
| focus/hover | Keyboard focus ring and compact icon tooltips remain visible | Browser/manual keyboard check |
| feedback partial success | Upload retry/skip banner remains usable | Existing FeedbackButton branch |
| notification bell | Bell/count/dropdown remain available on the page | Existing `GlobalAlerts` tests plus browser check |
| urgent notification while Chat is open | Center modal renders above Chat; view/dismiss actions remain usable | Integration/browser check |
| SSE notification while Chat is open | Existing toast/action appears without breaking Chat state | `GlobalAlerts.notificationBell` focused test |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | Dialog uses full viewport, safe-area padding, tabs stay tappable, labels may collapse to icon plus tooltip, composer keeps input and send action visible | Browser screenshot/manual check |
| tablet 768x1024 | Dialog nearly fills viewport with bounded rounded surface; tabs and controls retain labels where space allows | Browser screenshot/manual check |
| desktop 1440x900 | Dialog centered with a wide bounded surface; chat content receives maximum usable height; composer input is dominant | Browser screenshot/manual check |
| small-mobile 360x800 | No horizontal overflow; action row wraps predictably; send button remains reachable | Extended browser check |
| laptop 1024x768 | Dialog height remains within viewport and scroll ownership stays inside chat/feedback content | Extended browser check |
| wide-desktop 1280x800 | Surface remains visually balanced and does not stretch controls excessively | Extended browser check |

Notification overlay behavior is invariant across all viewports: compact Chat may use
the full mobile viewport, but urgent center overlays must still render above it and the
bell/history path must remain owned by `GlobalAlerts`.

### Accessibility Acceptance

- Preserve semantic dialog, tablist/tab roles, `aria-selected`, and existing labels.
- Icon-only controls keep accessible names through existing tooltip/aria patterns.
- Every primary touch target remains at least 44px where practical.
- Keyboard order: close → tabs → chat controls → composer actions → input → send.
- Focus must remain visible against light and dark theme surfaces.
- Respect `prefers-reduced-motion` by avoiding new mandatory animation.
- Compact labels may be visually hidden only when an accessible name remains.
- Urgent alert dialogs must retain their existing dialog semantics, Escape/dismiss
  behavior, and focus movement when they appear above Chat.

### Visual Direction

- Tone: quiet luxury — warm neutral surface, restrained blue primary action, subtle
  borders, shallow elevation, and clear hierarchy.
- Density: reduce chrome and icon footprint, not touch target size.
- Header: concise title and close action; tab row uses a stronger active state.
- Chat controls: compact pills/badges with truncation and no forced horizontal scroll.
- Composer: message input is the largest interactive region; send button is a
  high-contrast, visually isolated action; secondary actions use compact icon buttons.
- Motion: existing transitions only; no decorative animation.

### Copy Contract

- Preserve all existing user-facing copy and localization behavior.
- Do not remove `AI Chat`, `Task Control`, `Send Feedback`, media action labels,
  loading/error text, or feedback form labels.
- When labels collapse visually on mobile, use existing text as accessible names and
  tooltips rather than replacing copy.

### Browser Evidence Required

- Follow `orchestra/references/ui-browser-verification.md`.
- Verify mobile 390x844, tablet 768x1024, desktop 1440x900 at minimum.
- Add extended 360x800 and 1024x768 checks because this is a dense modal/composer.
- Record screenshot/manual evidence in `orchestra/ui-browser-evidence.md` if browser
  tooling is available; otherwise record skipped checks and the blocker.

## Implementation Shape

1. Add an optional `density` prop to `ChatView`, defaulting to the current behavior.
2. Apply compact-only classes to the embedded header, control row, quick actions,
   and composer while leaving event handlers and data flow unchanged.
3. Refine `FeedbackButton` dialog sizing and tab/header classes, using full-screen
   mobile behavior and bounded desktop/tablet dimensions.
4. Verify notification layering and routing compatibility without moving notification
   ownership out of `GlobalAlerts`.
5. Add focused assertions for compact rendering/accessibility where the current test
   harness can cover them.
6. Run focused tests, `git diff --check`, and browser evidence at the required viewports.

## Trade-offs

- Reusing `ChatView` avoids duplicated chat logic and keeps the main Chat page stable,
  but requires compact class branches inside a large component.
- CSS/Tailwind changes are intentionally localized to the dialog and optional density
  path; this keeps rollback simple and avoids a new design system dependency.
- Browser proof is a separate gate from unit tests; tests cannot certify real viewport
  wrapping, safe-area behavior, or visual hierarchy.
- Notification compatibility is a separate proof gate: a passing Chat test alone does
  not prove that an urgent modal can break through the Chat portal or that SSE/bell
  history remains functional.
