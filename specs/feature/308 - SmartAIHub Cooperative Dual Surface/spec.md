---
spec_id: 308
title: SmartAIHub Cooperative Dual Surface — Living Chat Mascot, Notification Bell & Reminder Balloon
revision: R1.2
status: PROPOSED_IMPLEMENTATION_READY_PENDING_CANONICAL_IMPORT_AND_RUNTIME_GATES
prepared: 2026-10-09
document_kind: NEW_SHARED_CORE_FEATURE_SPEC_CUMULATIVE_REVISION
ownership: SmartAIHub shared/core UI and interaction coordination
canonical_registry_gate: REQUIRED
miniapp_numbering: NOT_APPLICABLE
related_specs:
  - 049
  - 269
  - 270
  - 277
  - 287
  - 279
  - 224
  - 267
reference_assets:
  - references/mockup-responsive-and-interactions.png
  - references/mockup-system-overview.png
  - references/01-droplet.png
  - references/02-star.png
  - references/03-shield.png
  - references/04-chat-bot.png
  - references/05-orbit.png
---

# SPEC-308 R1.2 — SmartAIHub Cooperative Dual Surface

**Decision (normative):** Preserve the existing **Notification Bell at the top** as the notification entry and authoritative unread count. Turn the **existing AI Chat & Feedback launcher at the bottom** into one of **five selectable original cartoon mascots**. On desktop/tablet show a persistent, unmistakable label **“AI Chat & Feedback”**. On mobile show a compact recognizable mascot/chat icon, an accessible label, and bounded contextual onboarding. When a *new, confirmed, authorized* notification arrives, the bell briefly animates and increments its genuine unread badge; the bottom mascot may show a small **notification reminder balloon** (“มีแจ้งเตือนใหม่ อย่าลืมเข้าดู”) that opens the **existing Notification Center/Bell**, not Chat. Clicking the **mascot itself** opens the **existing AI Chat & Feedback dialog**. Do **not** merge these into one ambiguous click target.

**Authority:** This feature owns **presentation, interaction coordination, character selection, and attention policy only**. It does not own notification storage, delivery, filtering, escalation, message classification by LLM, chat routing, task execution or credentials. **Feature 049** continues to own notifications; **SPEC-269** Assistant; **SPEC-277** Task Control; **SPEC-287** UI governance; **SPEC-270** UI visual references. This is a shared SmartAIHub capability, **not a detached Mini App**.

**Revision precedence:** This R1.2 supersedes the R1.1 idea that replaced the bell with the mascot. Preserve the R1.1 source authorization, de-duplication, performance, accessibility, five-style selection, flags, and QA hardening, but **relocate the mascot to FeedbackButton**. The top bell stays visually identifiable as a bell, optionally moving lightly. A disabled feature MUST restore both original components and all existing behavior.

**Status honesty:** Source inspection of `naibarn/SmartSpecPro` on 2026-10-09 showed `GlobalAlerts.tsx` (notification bell + SSE + queries) and `components/guardian/FeedbackButton.tsx` (ChatView + Task Control + Feedback). This spec and mockups do not establish a working production implementation or verified browser tests. `308` appeared in the canonical registry's next-safe list when checked, but **Codex MUST recheck live origin/main, registry, current SPEC-308 ownership, index, handoff, and source files** before modifying or importing. Never overwrite newer canonical work or seize an occupied ID. If a legitimate collision exists, stop identity mutation and reconcile through the canonical allocator/owner.

## 1. Why the change is needed

1. The existing top-right bell may be missed even when new notifications arrive; a static badge does not always attract attention.
2. The existing bottom “AI Chat & Feedback” button is often not discovered, especially on mobile where its text disappears; people assume Chat must be reached from the main menu.
3. Rendering two constantly animated floating entry points would become distracting; merging both functions into one target would make notifications less discoverable and muddy user intent.
4. On small screens floating controls, keyboard, bottom nav, maps/editors and chat dialogs can collide.

**User outcomes:** users can (a) detect genuinely new information, (b) find AI Chat/Feedback from every eligible app surface, (c) immediately tell where a tap leads, (d) retain urgent alert delivery and all legacy actions, (e) choose a mascot and turn motion/hints off, (f) use an accessible 320px mobile layout, and (g) fall back safely if a visual layer fails.

**Non-goals:** reimplementing a notification system; copying OpenAI Dots artwork/trademarks; inventing a new chat thread or LLM request just because a tooltip appears; auto-opening the chat or notification panel; adding sound, vibration, push permissions, new event broker, worker, polling or SSE connection; exposing notification private text in a balloon; creating new personas or binding to legacy `personaId`/memory schema; building a separate mascot API, marketplace Mini App, or a new complex global overlay framework without evidence.

## 2. Source-of-truth map and inspected integration points

| Domain | Existing authoritative owner / required integration behavior |
| --- | --- |
| Bell/dropdown | `apps/web/client/src/components/GlobalAlerts.tsx` contains `GlobalNotificationBell`, unread badge, `Recent` behavior, fixed positioning/drag, read actions, action URLs, notification details and list. No second bell. |
| Notification data | Existing `trpc.scheduledMessages.getNotificationCount`; `getNotifications({limit:10})` recent polling; `{limit:20}` dropdown-on-open; `/api/notifications/stream` through `useSSEReconnect`. Preserve them and the existing job-completion toast dedup. No extra fetch solely to animate. |
| Chat/Feedback launcher | `apps/web/client/src/components/guardian/FeedbackButton.tsx`, currently rendered by `App.tsx`; opens `Dialog` with `ChatView`, `UniversalControlPlanePanel`, and existing Feedback form. It docks bottom-right on desktop and bottom-left on mobile (`viewportWidth < 640`), supports drag in-session, and hides the text on mobile. Preserve these functional flows. |
| Global composition | `apps/web/client/src/App.tsx` mounts `GlobalAlerts` and `FeedbackButton` as sibling UI; this is an appropriate place for a **small shared coordinator/provider** if no existing equivalent exists. Avoid duplicate renderers or DOM synthetic clicks. |
| Existing settings | `apps/web/client/src/components/settings/NotificationPreferencesPanel.tsx` has categories, channels, mute and snooze. Presentation settings may be linked from this surface but must not alter notification delivery preferences. |
| Feature flags | `apps/web/shared/featureFlags.ts`; documentation notes that most existing tenant flags default true. **NEW SPEC-308 flag must explicitly require `=== true`** and a global allow/killswitch, unknown/error = off. |
| Critical alerts | Feature 049 escalation/urgent banner and existing emergency integrations retain their priority. Balloon is a secondary convenience only. |
| Design/conformance | SPEC-287; responsiveness, accessibility, design tokens and text use approved components. SPEC-270 conceptual mockups are *not* code, data or authoritative literal wording. |
| Assistant/Task/Command | SPEC-269/277/279 define semantics/authorization. SPEC-308 invokes established commands only after a real user action; it adds no execution authority. |

**WP0 verification requirement:** Codex must inspect fresh source rather than assuming any file/function stays at these locations. Capture exact git SHA, current behavior, event payload schema, tenant-scoping guarantees, route visibility, layer ordering, mobile placement, auth/guest behavior, and existing tests. If verified source differs, record the delta and semantically adapt this spec without undoing recent fixes.

## 3. Interaction model — two functions, one coordinated experience

### 3.1 Primary surfaces

| Surface | Desktop/tablet | Mobile | Tap/click effect | Must never do |
| --- | --- | --- | --- | --- |
| `NotificationBell` (top) | Small recognizable bell + authentic unread badge | Bell in header/top-right reserved safe area; ≥44px practical touch target | Opens current notifications popover or canonical center; preserves existing read/actions | Open AI Chat, fabricate unread count, turn into a mascot |
| `AssistantMascotLauncher` (bottom) | One of 5 mascots **with persistent label** `AI Chat & Feedback` | Compact single mascot/chat icon, no permanent long label; onboarding hint teaches “ถาม AI / แจ้งปัญหา” | Opens EXISTING AI Chat & Feedback dialog; Chat tab defaults on ordinary click | Open notification panel merely because unread exists; create extra chat provider |
| `ReminderBalloon` above/alongside mascot | Compact short tooltip with bell icon and direct action `ดูแจ้งเตือน` | Max 2 short lines, optional bell glyph, dismiss; never hides main content | Opens current notification surface (popover if available; otherwise canonical `/notifications` route) | Open Chat, mirror unread badge/count, imply someone chatted, reveal raw alert text |
| `AssistantHint` (a different typed message) | Offers AI contextual help, only when legitimately available | Short one-off onboarding/help nudge | Opens Chat or intended existing panel with user action | Pretend to be a notification, silently submit prompt or disclose hidden context |

**Hard interaction invariant:** Clicking **mascot = Chat**. Clicking **notification balloon = Notifications**. Clicking **bell = Notifications**. Clicking **assistant hint = Chat**. A decorative icon is never an independently interactive child inside the DialogTrigger. Every balloon is a separately focusable, labeled button/link where actionable, with event propagation correctly controlled. Its dismiss button is separate and does not activate either launcher. For a screen reader, these targets need unambiguous TH/EN accessible names; do not require reading a picture.

### 3.2 Notification language and examples

**Approved generic notification reminder:** `มีแจ้งเตือนใหม่ อย่าลืมเข้าดู` / `You have a new notification — take a look.`; CTA `ดูแจ้งเตือน` / `View notifications`. For a group of confirmed arrivals, can say `มีการแจ้งเตือนใหม่หลายรายการ` without echoing unread count. For a verified approval category: `มีรายการรอให้คุณตรวจสอบ` / `You have an item to review`. For a trusted authorized critical event, use a **serious** short label `มีแจ้งเตือนสำคัญ` and depend on the existing urgent surfaces; don't call ordinary events critical.

**Assistant-only hint:** `ถาม AI หรือแจ้งปัญหาได้ตรงนี้` / `Ask AI or send feedback here.`; contextual (not automatic LLM): `ให้ AI ช่วยดูปัญหานี้ไหม` / `Ask AI to help investigate?` is allowed only with explicitly available, authorized context and truthful routing.

**Never say** just `มีข้อความใหม่`, `มีคนทัก`, `new chat message` or imply an inbound human chat when a generic notification arrived. Do not copy notification titles/content/error traces into bubbles, analytics, logs or aria labels. Language MUST come from versioned i18n templates; mocked images' Thai typography is not normative.

### 3.3 Desktop/tablet/mobile baseline

- **Desktop ≥1024px**: bell stays in top notification zone and does light motion *only on new eligible arrival*. Bottom launcher is a cute mascot alongside a **non-hidden** `AI Chat & Feedback` text pill (or approved localized equivalent) at normal/comfortable hit size. Balloon anchors above launcher, not off-screen; max one.
- **Tablet 768–1023px**: same dual entry; keep the **full visible** `AI Chat & Feedback` label as required, using a compact pill or safe dock position; do **not** silently shorten it to `AI Chat` or hide the Feedback word. If a true exceptionally constrained tablet/split viewport cannot display the full pill without blocking controls, invoke the documented narrow/compact breakpoint based on **available width**, with an onboarding accessible explanation and QA evidence, not an unexplained loss of functionality.
- **Mobile <768px**: top bell compact in header/top-safe-area. Bottom mascot/chat icon compact but touch target ≥44x44 CSS px (prefer 48x48); no persistent long text. During first eligible visits a single short onboarding tooltip may explain the action, subject to dismissal. Balloon width bounded by viewport (illustrative target ≤220px, always ≤ available safe width) and max two lines, with safe-area/keyboard rules. Use an actual dialog/chat full screen when opened, rather than piling new mini-panels under the keyboard. No accidental horizontal scrollbar at 320px.
- **Mobile placement decision:** because current code places the Feedback button bottom-left on screens below 640px whereas mockups illustrate bottom-right, rollout must test both; the implementation may use *bottom-right in flag-on mode only when collision audit permits* and must document final chosen baseline. In flag-off mode preserve the old mobile bottom-left behavior. Drag/dock, recovery after resize/rotation, main bottom navigation and safe areas are regression tests. Never move into a non-visible area.
- **Critical/emergency/video-editor/map/immersive surfaces**: the coordinator must respect existing fixed controls, modal layers, keyboard and safety UI. Hide *nonessential balloon* during keyboard/chat dialogs, drag, focused editor controls or an urgent full-screen modal; do not make the bell/launcher unreachable without another equivalent entry. Do not hard-code z-index higher than all dialogs and system/critical overlays.

### 3.4 Lifecycle and affordance priority

Priority of *visual interruption* after authorization: existing critical/urgent UI > open dialog/keyboard/focused task > intentional user action > new high-priority notification hint > normal notification hint > first-run Chat onboarding > idle expression. Existing notification delivery/action is independent of this ranking. Hints must not compete: `onboarding` and `notification` balloon cannot coexist. If a new priority event supersedes an open optional hint, dismiss/replace without stacking.

## 4. Exactly five original selectable mascots

| Stable ID | Thai / English name | Visual idea | Idle | New notification | Chat discovery |
| --- | --- | --- | --- | --- | --- |
| `droplet` | หยดน้ำ / Smart Drop | soft blue water-drop, large eyes | mostly still, optional small blink | polite one-shot bounce/eyebrow | tiny wave beside `AI Chat & Feedback` |
| `star` | ดาวน้อย / Smart Spark | original 5-point star, not product trademark | calm | single short tilt + sparkle | smile |
| `shield` | โล่น้อย / Smart Shield | rounded blue shield face | calm | concerned nod, no joking on critical | small wave |
| `chat` | เพื่อนแชต / Smart Chat | friendly speech-bubble robot (distinct from OpenAI design) | calm | small ear movement | wave near chat glyph |
| `orbit` | ดาวโคจร / Smart Orbit | purple-blue planet with ring | calm | one arc/tilt, never continuous spin | soft smile |

All five use a **single renderer/state/interaction contract**, not five copies of business logic. Shapes must read at 24–40px; live icon may be 28–36px *inside* a ≥44px touch target. Render original optimized SVG + CSS transform/opacity animation; mockup PNG is **not** production UI or font asset. No external scripts/fonts/images in SVG; no watermark or lifted mascot art. Maintain consistent art bounds, color contrast, neutral expressions for sensitive events and a conventional mini chat visual affordance on mobile (e.g., small chat outline attached to the icon) if needed to convey function.

**Settings:** add `Assistant mascot` appearance control in an appropriate existing Settings/Personalization area and link to it from Notification Preferences if discoverability benefits. Provide five radio-style previews with accessible names, live local preview and deterministic fake `Demo` button (never sends an actual event). Controls: style (5), animation (`off|subtle|normal`), reminder balloons (`on|off`), onboarding hints (`on|off`), launcher mascot (`on|off`, reverting to current labeled/icon Feedback button). **Disabling mascot must not disable Chat or notifications.** If tenant disables mascot, preserve the legacy Chat & Feedback launcher; if motion off, show static chosen mascot. Do not turn the plain bell into a sixth mascot choice.

**White label:** honor approved tenant palette and ability to disable cosmetic mascot; explicit permitted user choice overrides tenant default; accessibility (reduced motion) overrides both. Do not bind selection to AI persona/memory. Users cannot learn other users' choices. No cross-tenant persistence or analytics content leakage.

## 5. Bell motion (top), separately from mascot

| Bell mode | Trigger | Motion | Badge |
| --- | --- | --- | --- |
| `quiet` | no new confirmed eligible arrival; even if historical unread remains | static | authentic unread count or existing `Recent` fallback |
| `new` | newly verified authorized general notification | one short gentle ring/tilt ≤800ms; no continual oscillation | count from existing query, **not** optimistic invented count |
| `review` | verified new approval | one gentle ring ≤900ms | authentic count only |
| `critical` | new trusted authorized critical alert | one strong-but-controlled emphasis ≤1s; existing critical alert system remains responsible | authentic count only |
| `off/reduced_motion` | user/policy motion off | **no motion** | full normal badge and textual accessibility |

Count change by itself is **never** sufficient to animate, because hydration, mark-read, grouping, reconnect and stale caches can change counts. No pulse loop every time unread remains >0; no audio/haptic effects, auto-open or duplicate toast. If the source cannot prove a new event, leave the bell static and rely on authentic count.

## 6. Reminder balloon state machine and timing

### 6.1 Confirmed event → presentation, not a second notification

The helper balloon is a **non-authoritative secondary attention surface**. Notification badge/list/toast/critical overlay must update without waiting for any coalescing/animation. The balloon cannot modify unread status, push history, mark a notification read, auto-approve, or auto-open anything. The *same* verified event may legitimately drive both a bell ring and one balloon presentation episode without launching another SSE subscription, query or delivery record.

**Presentation states:** `INITIALIZING`, `QUIET`, `COALESCING`, `BALLOON_VISIBLE`, `COOLDOWN`, `SUSPENDED`, `DISABLED`. Transition only on authorized, stable new event IDs and user/page visibility; timer effects isolated in one hook/reducer, not five characters. Changing mascot style or re-rendering must not restart balloon.

**MVP default timing (tunable through tested constants, not remote arbitrary HTML):**
- initial baseline: **silence** (historical 9+ never animates as new on mount);
- coalescing: 2 seconds for multiple arrivals (not a delivery delay);
- balloon: 5 seconds desktop/tablet, 3 seconds mobile; never auto-dismiss while focus is **inside** the actionable bubble; user can dismiss immediately;
- normal attention cooldown: 60 seconds across the coordinated surfaces (one bubble even if multiple normal arrivals); critical visual attention: 15 seconds *for distinct trusted critical arrivals*; existing urgency delivery continues regardless;
- bell one-shot ≤1 second; mascot one-shot ≤1 second; avoid simultaneous repeated movement (stagger brief episodes, no permanent bouncing);
- dismiss a balloon for that eligible episode on CTA, `X`, dialog/open notification, tab hide, route transition as appropriate; do not replay on refocus or on re-render;
- do not persist notification IDs, titles or bodies to localStorage. A bounded in-memory seen/episode map (example 200) and monotonic session clock suffice; read/decrement/reconnect must not backfill.

### 6.2 Exact source/identity trust gate

At WP0 inspect existing `getNotificationCount`, background `getNotifications({limit:10})`, on-demand `{limit:20}`, parsed SSE payload and grouping (`occurrenceCount`, `updatedAt` or known revision) to document verified `newAuthorizedVisibleNotification` semantics. An SSE parser validating JSON **does not authorize the payload**. Only use a payload directly if source ownership/tenant/user authorization is independently proven in current code; otherwise confirm against the **existing authorized query data** without adding a second query for mascot. Where 10-item truncation means existence/identity cannot be proven, suppress cosmetic attention; never show a fake “new” event merely because count rose. Only map `critical`, `approval`, `success`, `error` from documented trusted **typed** fields—not regex guesses based on title. Historical/delayed/duplicated SSE, reconnect, stale query, grouped duplicate occurrence, account switch, tenant switch, logout, background restore, mark-read, error, data gaps and unmapped categories must not produce false attention. A grouped item requires verified monotonic occurrence revision to produce a *new* attention episode. If exact source proof is absent, ship static bell and static mascot with working Chat, and log the block as an unresolved runtime capability (do not claim animated arrival works).

**Information minimization:** coordinator receives only a short sanitized signal `{opaqueStableKey, trustedCategory, trustedSeverity, version}`, after authorization. Never pass raw notification title, body, token, resource URL, error payload or tenant-private metadata into the mascot. Never infer urgent importance from an untrusted source. Cancel candidate/timers on scope change before applying results from the old scope.

### 6.3 Input/priority matrix

| Situation | Bell | Mascot | Balloon | Click balloon |
| --- | --- | --- | --- | --- |
| Old unread on first render | authentic badge, no new ring | idle | none | N/A |
| Confirmed normal new alert | one bell ring if motion permitted | may make one greeting micro-motion | generic `มีแจ้งเตือนใหม่ อย่าลืมเข้าดู` if eligible | Notification Center |
| Multiple arrivals in 2s | one episode, authentic total | at most one motion | one grouped message; never stack | Notification Center |
| Confirmed approval/review | ring if permitted | attentive face | `มีรายการรอให้คุณตรวจสอบ` | Notification Center or existing authorized review route only if UX explicitly labels it |
| Confirmed job succeeded | generic ring if user-visible | short cheerful face | generic notification unless approved typed copy | Notification Center |
| Confirmed job failed | ring and existing system toast | concern, not panic | generic alert; possible separate optional contextual AI help only on user request | Notification Center |
| Trusted critical | bell/urgent UI; critical present | serious expression; no cheerful bounce | short critical text only if does not obscure safety UI | existing notification/critical details |
| Reconnect, refresh, count only | never treat as new | idle | none | N/A |
| During chat/modal/keyboard | bell continues functional | launcher may defer UI | suppress/close balloon | N/A |
| User disabled/reduced motion | still full badge/notification | static icon | text-only balloon if hints allowed, **no motion** | Notification Center |

### 6.4 Balloon vs “new chat” conflict prevention

There is no user-inbound chat message here unless Chat itself provides an independently authorized chat-specific event; generic Feature-049 notification is **not** a chat message. Never put an unread count bubble on the bottom mascot that duplicates the top bell number. Use a distinct **bell glyph** and notification wording inside a reminder balloon. Assistant-focused onboarding/hints use a **chat glyph** and different copy; never present both hints simultaneously. Balloon click does not create a conversation. Screen readers can identify each category and control purpose without relying on color.

## 7. Cross-surface architecture and event dispatch

**Preferred minimal architecture (adjust to actual repo only after inspection):**

```text
App.tsx  [existing siblings]
  NotificationAttentionCoordinator (small shared state/context, UI only)
    GlobalAlerts -> GlobalNotificationBell [old source of truth]
        ├─ existing notification SSE/query/toast/read/navigation
        ├─ BellMotionDecorator (CSS, one-shot, no new fetch)
        └─ expose openNotifications() action to shared coordinator
    FeedbackButton [existing ChatView / Control Plane / Feedback]
        ├─ AssistantMascotLauncher (five SVGs; label responsive)
        ├─ ReminderBalloon (one active item, separate accessible CTA)
        └─ existing Dialog and all existing event-driven openings

On verified authorized new UI event from existing bell:
  existing source -> normalized UI-only event -> attention reducer
       -> bell may ring once
       -> mascot may show bounded reminder balloon
Click bell / balloon -> existing Notification panel or /notifications
Click mascot -> existing AI Chat & Feedback dialog
```

**No duplicate transport:** Ideally refactor the existing Bell notification state to publish **authorized projection signals** to a tiny coordinator context, keeping the original single subscription and queries. Because `GlobalAlerts` and `FeedbackButton` are siblings today, share presentation events via one narrowly scoped context or an existing equivalent; do not scrape DOM, call `.click()`, expose a global custom event containing private data, create a second `EventSource`, duplicate `getNotifications`, wire a new poller, or mount Bell twice.

**Open notification command:** Use an explicit `openNotifications()` intent handled by the existing bell instance and existing popover state. When the bell is absent or inaccessible on the current route, navigate to the **existing** Notification Center (`/notifications`, verified by WP0) rather than fabricating a hidden bell. On 320px view, the popover must clamp width and remain usable; fallback to the full notification page when better for mobile. Do not mark read automatically when tapping the balloon; any current bell behavior on row-open remains unchanged. Every action respects existing routing and authentication.

**Dialog:** Keep the existing `FeedbackButton`'s `<Dialog>` and its `chat`, `control-plane`, `feedback` tabs. Existing `REPORT_ERROR_EVENT`, emergency-map Chat handoff, `createConversation` guard, file upload/retry, drag, confirm for urgent Feedback, keyboard/paste and all guest authentication behavior remain functional. In particular, clicking a *notification balloon* must never call the Chat dialog's `onOpenChange` or `ensureChatConversation`; ordinary mascot click retains the existing Chat default (subject to current login gate). A feedback form with unsent text/files must not be reset because a balloon appears/disappears.

**Animation UI implementation:** `BellMotionDecorator` is a lightweight `transform` animation around the existing Bell icon without changing its button event handlers/ARIA. `AssistantMascotLauncher` changes the **existing FeedbackButton trigger's visuals only**, keeping its DialogTrigger click semantics and drag threshold. Balloon is a separate sibling surface, not a descendant of the trigger button. The decorator/renderer exception boundary must not unmount the existing bell/feedback services; fall back to original plain button or static mascot. On flag OFF, legacy DOM behavior remains as close to baseline as practical.

### 7.1 Suggested components (not mandated filenames)

| Module (suggested) | Responsibility | No access to |
| --- | --- | --- |
| `NotificationAttentionCoordinator` | state/commands between existing siblings, scope reset | raw DB/LLM/worker secrets |
| `deriveAuthorizedAttentionEvent` | pure, typed, scope-proven event normalization | arbitrary title regex |
| `useAttentionEpisode` | coalescing/cooldown/bubble timers with cleanup | extra SSE and network |
| `BellMotionDecorator` | original Bell's modest, one-time motion | read/markRead mutation |
| `AssistantMascotLauncher` | five styles, responsive label, existing trigger | notification data mutation |
| `ReminderBalloon` | i18n text-only hints, distinct target and dismiss | chat conversation creation |
| `FloatingSurfacePolicy` | viewport/keyboard/dialog/safe-area constraints, only as complex as needed | overriding critical overlay priority |
| `MascotAppearanceSettings` | five radio-tile choices, motion/hint/off settings | changing notification delivery preferences |

Do not overbuild a new framework, provider stack or animation dependency for two components. Prefer existing app event/action/context conventions after checking them. Keep pure reducer independent from React for deterministic tests. One integration owner must own shared files; WP1 assets and WP2 reducer can run in separate worktrees.

## 8. Feature flags, rollout and preference contract

**Flag ON only when explicitly approved:** `livingMascotDualSurface === true` (exact key can follow repo convention once located) **AND global visual-experience allow/safe kill switch true**; all `undefined`, error, stale/unknown tenant, unresolved auth, malformed configuration, and missing allow mean **OFF**. Existing tenant flag convention is often default-true; DO NOT reuse a default-on helper for this new feature. If an earlier prototype ever exposed `livingNotificationMascot` or an R1.1 bell-mascot preference, do not automatically treat that flag as the new dual-surface opt-in; reconcile/deprecate it explicitly and migrate *style choice only* after consent/scope validation, never the placement or attention authority. Feature flag OFF => **original bell + original FeedbackButton + original Dialog**, with no attention timers, no pref reads for another identity and no data loss. Do not hide global access because the feature is unconfigured.

**MVP preferences** (local browser scope only; no DB migration):

```ts
type MascotStyle = "droplet" | "star" | "shield" | "chat" | "orbit";
type MotionLevel = "off" | "subtle" | "normal";
interface DualSurfacePreferencesV2 {
  version: 2;
  mascotEnabled: boolean;
  mascotStyle: MascotStyle;
  motion: MotionLevel;
  notificationReminders: boolean;
  chatOnboarding: boolean;
}
```

Default `mascotEnabled=true`, `mascotStyle=droplet`, `motion=subtle`, `notificationReminders=true`, `chatOnboarding=true` **only after feature is explicitly ON**. `prefers-reduced-motion:reduce` overrides motion to OFF. Tenant may disable visual effects; notification backend delivery preferences continue separately. Settings should accurately state that MVP choice is **local to current browser/device**; never pretend it syncs. Keep brand preference compatible with future user-scoped settings without coupling to old persona/memory.

Store only validated small preferences under a stable authorized user+tenant namespace and version, with opacity where available, not a global browser key; never store notification IDs/bodies/guest auth secrets. Reject malformed/overlarge/unknown versions, reset in-memory state on login/logout/tenant switch; ensure cross-tab `storage` events don't create false events. If storage unavailable, behave as memory-only defaults. Guest gets public-allowed launcher behavior but no cross-identity preference fetch. Cross-device sync is *optional next phase* only by reusing existing user preferences with permission and migration review; no new mascot table/API during MVP.

**Rollout:** flag OFF baseline -> internal preview -> authorized beta cohort -> production approval -> staged tenant rollout; monitor errors, suppression rates and UX signals. Kill switch must revert both launchers independently of pending CSS timers and without losing unread count, open messages, Chat drafts or urgent-feedback flow. Rollback rehearsal documented before production.

## 9. Security, privacy, trust and PDPA

- Derive attention only from the existing authorized, tenant-scoped notification UI; do not widen API queries or broadcast events across tenants. User-initiated balloon click checks permission via existing route.
- Critical message/emergency delivery and permissions remain owned by the existing pipeline. A visual cooldown or disabled animation never affects message delivery, persistence or escalation.
- No notification title/body, user identifying information, conversation text, resource URL, approval document content, diagnostics bundle or secrets in balloon copy/telemetry/localStorage; no copy sourced from untrusted HTML.
- No automatic LLM call, API charge, credit consumption, chat creation, tool execution or approval on incidental animation, hint dismissal or hover; Chat only starts following the existing authorized user click behavior.
- Maintain `resolveNotificationActionUrl`, safe action-link validation, CSRF, feedback attachment rules, secure navigation, and per-tenant auth boundaries of the original components. Do not downgrade existing safety logic to make a click easier.
- Mascot assets are original project-owned or appropriately licensed; sanitize SVGs, no scripts, remote fonts/images, `<foreignObject>` or event handlers. Respect CSP; prevent SVG from stealing pointer/focus.
- If consent-governed telemetry exists, collect only allowed high-level action counts (balloon shown/clicked/dismissed, chat launcher opened, bell opened) by coarse cohort/device, not raw content, IDs or per-message tracking. If consent/instrumentation unclear, skip analytics until audited.

## 10. Accessibility, animation and resilient layout

- Motion uses `transform`/`opacity` one-shot with no infinite keyframes, canvas/WebGL, constant requestAnimationFrame or heavy filter; no layout shifts. One event should not make both top and bottom bounce repeatedly. Reduced-motion preference forces **all decorative motion off**, including ring, blink, orbit, sparkle, pulse and entrance animation; badge and text stay present.
- Tab, Enter/Space, Escape, pointer/touch, screen-reader accessible labels and focus return work for Bell, Mascot Launcher, Bubble CTA and Bubble Dismiss. Do not nest interactive buttons. One active tooltip; avoid duplicate browser `title` and custom bubble; no unsolicited, repeated `aria-live` chatter. If an announcement is used for high-priority alerts, use existing notification service semantics instead of announcing the same thing twice.
- Touch targets: ≥44x44 CSS px practical goal; desktop visible label, mobile icon uses recognizable chat affordance with one-time hint. Separate focus indicator and distinguish buttons without color alone. Meet WCAG 2.2 AA relevant criteria, contrast and 200% zoom; do not convey alert urgency purely with animation or cartoon expression.
- Test 320/360/375/390/768/1024/1440 CSS px and 200% browser zoom, landscape, portrait, light/dark, Thai/English long translations, tablet split view, browser virtual keyboard, `dvh`, `safe-area-inset-*`, scroll/drag/end/cancel/resize, mobile bottom navigation, app drawers, editor/map overlays, full-screen dialogs and critical banners. No overlay covers submit/pay/approve/emergency control. If no safe space for bubble, suppress bubble and leave both entry points available.
- Current bell's dropdown is roughly 360px wide; make placement responsive/clamped within viewport or route to full notifications on smaller mobile. Do not clip outside document; keyboard or chat dialog should not leave lingering bubble underneath.
- Drag is not needed to **learn** where Chat is: maintain stable initial placement and persistent label; if drag enabled preserve threshold suppression, pointercancel, clamped bounds and safe-area. Flag OFF restores existing placement/docking.
- Prefer no global dependency or extra bundle above existing modules; lazy-load settings gallery if appropriate; in fallback use original Bell/Feedback trigger with functioning actions. Test JS/storage/CSP failures without breaking notification or Chat.

## 11. Performance budgets and measurement

**Targets (must measure, not assert in advance):** no new notification SSE/WS/poller/query/LLM calls; no extra DB migration; no new per-frame loop; one bounded UI timer episode; zero CLS from appearance/bubble; mascot trigger assets collectively modest size after vector optimization (provisional total SVG goal <100 KiB gzip across five styles; verify actual); nominal launcher click perceived responsive at 60Hz on baseline devices, with frame-time regression measured against control; no sustained hidden-tab CPU. Measure low-end Android/tablet and desktop network/heap in before/after traces. Set explicit thresholds with QA owner from baseline rather than inventing p95 numbers. If measurements exceed agreed budget, fall back to static mascot/bell without risking function.

**Success metrics:** (1) users who discover/open `AI Chat & Feedback` launcher from eligible pages, (2) notification detail open rate for *eligible confirmed new arrivals* with stable denominator, (3) time to react to approval/critical notifications, (4) rate of balloon dismiss/motion opt-out, (5) accidental opening of Chat when trying to reach notifications, (6) mobile overlay/support incidents. Compare staged cohorts/behavior and tenant differences; no claim of uplift until measured. Never optimize click volume at expense of urgent acknowledgement or task efficiency.

## 12. Work packages and parallel ownership

| WP | Priority | Work | Dependencies / completion evidence |
| --- | --- | --- | --- |
| WP0 Registry + source audit | P0 blocking | Fresh `origin/main`; claim canonical SPEC-308 properly; initialize generator-owned handoff; inspect Bell, FeedbackButton, App composition, test suites, notification source trust, mobile positions, flags and dialog flows. Capture baseline screenshots + payload fixtures. | Registry conflict-free; source-map evidence + owner-approved scope |
| WP1 Five SVG mascots | P1, parallel | Five unique original scalable SVG skins, shared expressions and static renderer; gallery preview, license evidence. | Original assets, snapshots at 24/32/40px, light/dark |
| WP2 Attention reducer | P1, parallel | Pure authorized signal projection; silent baseline, dedup/grouping, 2s coalescing, cooldown/visibility, cleanup and priority; unit tests. | Fake-timer/auth negative tests, no second data source |
| WP3 Bell motion | P1 | Decorate existing Bell only; retain count, list, read, toasts, drag and `Recent`; open intent contract. | Baseline parity screenshots, auth/routing/component tests |
| WP4 Mascot Chat launcher | P1 | Decorate existing `FeedbackButton` trigger; desktop/tablet permanent label, mobile compact icon, preserve Dialog+3 tabs, error/feedback/emergency events and drafts; expose entry + settings. | 5-style selection, guest/login/drag/submit tests |
| WP5 Reminder balloon + coordinator | P1 | One shared small coordinator spanning siblings; generic i18n templates, separate click targets, no duplicate SSE/query; balloon cooldown and routing to notifications. | Cross-surface route tests and no-chat-on-balloon assertion |
| WP6 Responsive/safe-area | P1 | Coordinate fixed surfaces, keyboard, editors/maps, urgent banners; 320px/zoom/tablet tests; decide mobile default anchoring. | Device screenshots and overlap/keyboard evidence |
| WP7 Integration & QA | P0 release gate | Explicit feature flag, rollback, accessibility, full regression, 12-pass gap audit, independent QA, PR/handoff receipts. | Tests+evidence and required release approvals |
| WP8 Later (optional) | Deferred | Cross-device preferences, tenant branding refinements, SPEC-269 Assistant contextual help, better bottom navigation if measured. | Separate authorization and cost review; NOT MVP blocker |

**Parallel strategy:** WP1 (art) and WP2 (pure reducer) independently after WP0; WP3/WP4 may be scoped in distinct worktrees **only if no shared-file conflict**; a single integration owner performs WP5/WP6/WP7 and edits shared `App.tsx`, flags, settings and canonical handoff. Use project session-finish/integration-controller practices; UI-only lanes run focused tests rather than the server-heavy full monorepo build. Do not silently merge conflicts, overwrite another session's work or claim completion while handoff is unresolved.

## 13. Acceptance criteria — executable evidence required

### A. Identity, appearance and discovery

- **AC-308-001:** Canonical SPEC-308 resolves to this logical capability without ID collision; registry/index/handoff validate on integration SHA. No generated handoff file is edited manually.
- **AC-308-002:** Exactly five **original** styles (`droplet`,`star`,`shield`,`chat`,`orbit`) render distinct at 24/32/40px and have legal/source evidence.
- **AC-308-003:** Users select any style, change motion/hint settings, and revert to original Feedback launcher; validated scoped preferences survive reload only to the documented MVP extent.
- **AC-308-004:** Desktop/tablet bottom launcher visibly and persistently says **AI Chat & Feedback** or an equivalent verified localization (not hidden in hover); no overlapping balloon obscures its purpose.
- **AC-308-005:** Mobile shows compact recognizable chat/mascot hit target ≥44px, optionally bounded one-time onboarding, and no unintentional horizontal overflow on 320px/zoom. Tablet retains full `AI Chat & Feedback` label at normal widths.
- **AC-308-006:** Five mascot styles all invoke the **same existing Chat & Feedback dialog** and preserve all 3 tabs and auth/guest rules; a plain legacy launcher is fallback.

### B. Notification functional parity

- **AC-308-007:** Top icon remains a **bell**, authentic unread badge and `Recent` state; no mascot replaces it even while the flag is on.
- **AC-308-008:** Bell click preserves dropdown, details, mark read/all read, grouped occurrence and safe deep-link navigation on all tested routes.
- **AC-308-009:** Existing notification SSE and query/polling behavior and job-completion toast remain functionally equivalent; no additional transport/query created by SPEC-308.
- **AC-308-010:** Historical 9+ unread on mount/reconnect/refetch/tenant switch does not produce a false new-item animation or balloon.
- **AC-308-011:** A distinct, verified new authorized notification triggers ≤1 bounded bell episode; badge reflects actual existing data without count fabrication.
- **AC-308-012:** Critical/emergency/approval handling preserves existing alert delivery and access controls even if mascot visuals are disabled/cooling down.

### C. Balloon and split actions

- **AC-308-013:** Confirmed eligible new notification may show a **single**, localized bounded balloon near the bottom mascot, no raw notification content or repeated count.
- **AC-308-014:** Clicking balloon/CTA opens **Notification**, and neither creates a Chat conversation nor opens the Chat dialog; if bell unavailable, navigates to canonical notification center.
- **AC-308-015:** Clicking mascot itself opens **AI Chat & Feedback**, not Notification, even while a reminder balloon is visible; no nested-button interaction ambiguity.
- **AC-308-016:** Clicking bell itself opens **Notification**, not Chat, under every mascot style and motion setting.
- **AC-308-017:** Balloon dismiss does not mark alerts read; balloon never sends feedback, approval, LLM prompt, tool call or credit-consuming request.
- **AC-308-018:** Normal balloon coalescing, 60s cooldown, 5s desktop/3s mobile timeouts, 15s distinct critical visual cooldown, focus pause/dismiss and timer teardown pass fake-timer tests.
- **AC-308-019:** Onboarding/chat hint and notification balloon never appear simultaneously; copy and icons make intent distinguishable in Thai and English.
- **AC-308-020:** Duplicated/reordered SSE, count-only changes, grouped occurrence, 10-item truncation, out-of-order queries, tab restore and old user/tenant scope never produce unauthorized/false balloon episodes.

### D. Device/accessibility/security

- **AC-308-021:** 320/360/375/390/768/1024/1440px, 200% zoom, safe areas, rotated/tablet split-screen and keyboard opening show zero critical control occlusions. When no space, bubble suppresses gracefully.
- **AC-308-022:** Bell/mascot/balloon CTA/dismiss are keyboard and screen-reader operable with accurate roles/names; focus returns; no nested controls or duplicated announcements.
- **AC-308-023:** Reduced-motion disables **all** decorative movement while keeping unread count, static mascot and text cues; users may independently disable balloon hints.
- **AC-308-024:** SVG/CSP audit shows no unsafe scripts, external fetches, bad focus or pointer interception; crash/missing assets degrade to usable existing components.
- **AC-308-025:** Logout, guest transitions, tenant changes, mute/snooze, invalid storage and revoked authorization do not leak notification content/state/style across scopes.
- **AC-308-026:** Existing `REPORT_ERROR_EVENT`, emergency-map chat handoff, file attachments, feedback urgent confirmation, Chat conversation guard and Task Control remain functional in regression tests.
- **AC-308-027:** Feature gate **fails closed** unless explicitly true and global allow is true; OFF/kill switch restores exact functional legacy UI without extra service calls and preserves drafts/actions.
- **AC-308-028:** No new notification backend, DB migration, SSE/WS connection, read mutation, LLM/credit call, or permission expansion for aesthetic cues.

### E. Evidence and release governance

- **AC-308-029:** Before/after measurable network, memory, layout/CLS and event timer traces collected; missing or worse-than-agreed budgets recorded as blocking/partial, not glossed over.
- **AC-308-030:** Full app UI regression and device snapshots include ordinary dashboard, /notifications, /chat, editor/map and narrow mobile, all five styles where relevant.
- **AC-308-031:** At least **12 independent QA review lenses** are documented, every discovered gap corrected or owned as explicit unresolved with severity/evidence; rerun affected checks after fixes.
- **AC-308-032:** Integration SHA, PR references, canonical generator output, focused test logs, final verification and release gates recorded in handoff; no unsupported COMPLETE/DEPLOYED claim.
- **AC-308-033:** Notification and Chat discoverability outcomes have measurable definitions and privacy-safe metrics; no fabricated uplift or invented delivery timings.
- **AC-308-034:** R1.1 notification-in-bell concept is explicitly superseded; no code path leaves a bell-replacement mascot or an additional duplicate launcher behind.
- **AC-308-035:** In-app localization (TH/EN) is correct with labels/hints/dismiss/error states; mockup image text is never copied as authoritative language.
- **AC-308-036:** Rollback tested during animation, while balloon open, when Chat dialog open, and after user/tenant switch; Bell/Feedback remain independently usable.

**Completion definition:** Every applicable AC has a linked *executed* test or direct reviewed evidence with test command, environment, timestamp, source SHA and result; NO criterion passes just because a mockup or markdown says it should. If critical source trust cannot be confirmed, a **static-only subset** may be marked PARTIAL, not finished. No production deployment without explicit authorized release approval.

## 14. Test plan and minimum traceability

| Suite | Mandatory cases | Evidence owner |
| --- | --- | --- |
| Pure reducer fake timers | initial hydration, new trusted ID, duplicates, group revisions, stale events, coalescing, cooldown, hide/show, dismiss, account switch, reduced motion | WP2 |
| Bell compatibility | unread badge, `Recent`, dropdown detail, mark read/all, route visibility, SSE reconnect, existing toast/no duplicate subscriber, drag | WP3 |
| Feedback/Chat compatibility | click mascot, Chat tab, Control Plane, Feedback submit/attachments/urgent, guest/login, external error/map events, draft preservation, drag | WP4 |
| Coordination | bell vs mascot vs actionable balloon click, fallback `/notifications`, no chat on balloon, focus/dismiss, stacked hint suppression | WP5 |
| Settings/flag | 5 styles, 3 motion choices, disable mascot vs disable motion vs balloon toggle, corrupt prefs, fail-closed flag, kill-switch and scoped storage | WP4/WP7 |
| Visual/mobile | 320/360/375/390/768/1024/1440px, zoom 200%, touch targets, landscape, safe areas, keyboard, editor/map/critical overlay, light/dark/TH/EN, all 5 styles | WP6/WP7 |
| Security/perf | auth scope, no notification content in balloon/telemetry, CSP/SVG, no new SSE/query/LLM, heap/CLS/timers, no auto-approval or read | WP7 |
| Integration | canonical index, handoff generator, regression suite, PR/merge SHA, owner signoffs, staged release/rollback | WP0/WP7 |

Start with `GlobalAlerts.notificationBell.test.tsx` and tests around `FeedbackButton.tsx` discovered from the checked-out repository. The exact test runner/package commands must be read from repository scripts; do not invent success or run a memory-heavy full build for isolated visual changes unless integration gates require it. Collect before/after visual screenshots at individual page scale, not tiny thumbnails. Any screenshot depicting example alerts is synthetic, not a claim about live user data.

### 14.1 Traceability index

- AC-001..006 → WP0, WP1, WP4; style/gallery and launcher screenshot/test evidence.
- AC-007..012 → WP2, WP3; trusted-event contract and bell parity.
- AC-013..020 → WP2, WP5; balloon router and fake timers.
- AC-021..028 → WP4, WP6, WP7; cross-device, access, rollback tests.
- AC-029..036 → WP0, WP7; CI/device/QA/release evidence.

## 15. Twelve-pass gap audit protocol (required for implementation)

1. **Identity/ownership:** canonical Registry, Spec revisions, collisions, Feature 049 authority, zero duplicated backend.
2. **Existing code baseline:** precise App/GlobalAlerts/FeedbackButton integration; preserving `Recent`, job toasts and three Chat/Feedback tabs.
3. **Visual coherence:** five styles original, static readability, label permanent desktop/tablet, compact mobile.
4. **New-event accuracy:** stable IDs, initial baseline, dedup/reconnect, count-only, occurrence revision, stale/out-of-order responses.
5. **Trust/permissions:** auth+tenant, muted, critical/approval typed provenance, error/privacy/policy.
6. **Interaction semantics:** mascot→Chat; balloon→Notifications; bell→Notifications; feedback submit/approval unchanged; no accidental auto-open.
7. **Responsive overlays:** mobile/keyboard, safe-area, fixed position, 320px and 200% zoom, drag, critical banner, editors/maps.
8. **Accessibility/localization:** keyboard, focus, labels, roles, motion, TH/EN and contrast.
9. **Perf/resource:** one SSE, no new fetch/LLM, one bounded timer, SVG/CSP, CLS and memory.
10. **Feature flags/rollback:** explicit off-by-default and global kill switch, invalid settings, identity/tenant transitions, JS failure.
11. **Concurrency/architecture:** two sibling surfaces, one coordinator, no recursive event loop, shared file ownership, handoff/PR integration.
12. **Evidence truth/UX outcomes:** actual tests, screenshots, provenance, blockers, measured discovery/notice rates, owner approval.

Each pass logs `pass_id`, baseline SHA, scope, gap, fix or justified deferral, test/evidence artifact and PASS/FAIL/PARTIAL/BLOCKED. Re-review changed items until resolved. A static document review is **not** a substitute for executed runtime tests; the same pass number must not be counted as repeated tests. Do not label 12/12 runtime PASS from prose alone.

## 16. Delivery gates, rollback and migration

| Gate | Acceptance | Decision authority |
| --- | --- | --- |
| G0 Canonical import | Spec allocated without collision; generated handoff, index, traceability validated; identify source SHA | existing spec/integration owner |
| G1 Prototype | 5 original SVGs + launcher with persistent label + static preview; current Bell/Chat behavior preserved | UI reviewer |
| G2 Functional MVP | event proof, bell one-shot, notification balloon, separate click routing, fake-timer/access negative cases | integration reviewer |
| G3 Beta | desktop/tablet/mobile/zoom/i18n/accessibility/network/rollback tests and 12-pass implementation review | authorized beta owner |
| G4 Production | staged opt-in, health/metric guardrails, critical behavior and release approval | explicit production authority |

**No DB migration for MVP.** Cosmetic client preference may be stored locally behind a flag; if a later WP proposes sync/migration, it requires its own data/PDPA/migration safety review. No user data/notifications/chat messages are altered to satisfy the design. On release rollback disable SPEC-308 feature flag/global allow and restore legacy Bell and Chat/Feedback surfaces; never delete user prefs until a separate authorized retention policy says so.

## 17. Open questions and deterministic fallbacks

| Question/blocker | MVP default that allows bounded progress |
| --- | --- |
| No trustworthy authorized event identity in existing SSE/query source | Static bell and mascot, real count unchanged, **no animated “new” balloon**. Record owner/source needed; do not fabricate. |
| Cannot safely open anchored bell from balloon on a route | Navigate using existing authorized notification center route, no Chat fallback. |
| Mobile bottom-right collides with important controls | Prefer safe alternate dock (including current bottom-left) after viewport audit; suppress balloon if insufficient space. Flag-off old position unchanged. |
| Missing preference sync across devices | Local-only documented, not a blocker. |
| Missing exact TH/EN translation | Use approved copy templates and i18n; never hard-code text extracted from mockups. |
| Character file invalid/incompatible | Original Feedback button; Bell untouched. |
| Unable to meet performance/motion goals | Static mascot + Bell, no balloon until verified; leave feature flag gated. |
| Unknown recent changes in SPEC-308/related specs | Rebase semantically on latest owner content, preserve new work, do not overwrite. |

## 18. Mockup asset mapping and fidelity rules

- `references/mockup-responsive-and-interactions.png` — **primary responsive UI concept**: desktop normal/chat/new alert, tablet, mobile normal/alert/full-screen Chat, five styles and hint behavior. Visual intent only.
- `references/mockup-system-overview.png` — complementary overview of placement/state/customization; some labels may be illustrative or typographically imperfect.
- `references/01-droplet.png` ... `references/05-orbit.png` — earlier **five style inspiration sheets** from R1.1; historical versions may show mascot at bell location, which R1.2 explicitly **overrides**. Use their *original cartoon appearance only*, not their placement, wording, count or navigation.

**Precedence:** normative interactions in this spec > current authorized application behavior for untouched functionality > current design tokens/components > generated mockups. Never blindly reproduce invented notification data, Thai text artifacts, fake dates/counts, avatars or mock screen elements from images. Production mockup fidelity must concentrate on **one top bell / one bottom mascot with label / correct separate balloon target / reasonable mobile compact behavior**. Use real i18n and actual application state.

## 19. User stories

- As a **desktop user**, I immediately see the labeled cartoon `AI Chat & Feedback` entry without hunting for Chat in the sidebar.
- As a **mobile user**, a small chat/mascot control remains tappable without hiding the editor, keyboard, or notification bell.
- As a **busy operator**, a genuinely new alert gives a bounded Bell ring and optional neutral reminder from the mascot, while old unread items do not nag me repeatedly.
- As a **user**, I know tapping the helper balloon checks *notifications* and tapping the character opens *AI Chat & Feedback*.
- As a **reduced-motion user**, I can retain exact information and controls without animation, and turn reminders off separately.
- As a **tenant admin**, I can disable this cosmetic enhancement without reducing delivery/escalation or gaining access to private users' notifications.
- As a **developer**, I can implement visual art and event reduction in parallel while the integration owner preserves existing tests, release safeguards and correct handoff.
