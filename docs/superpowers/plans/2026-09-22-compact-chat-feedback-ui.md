# Compact Chat & Feedback UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** ปรับหน้า AI Chat & Feedback ฉบับย่อให้ responsive และใช้งานง่ายขึ้น โดยคง behavior เดิมและทำงานร่วมกับ GlobalAlerts/Notification stack โดยไม่สร้างระบบซ้ำ

**Architecture:** เพิ่ม optional `density="compact"` ให้ `ChatView` แล้วใช้เฉพาะตอนฝังใน `FeedbackButton` ส่วน `GlobalAlerts` ยังคงเป็น global notification owner เดิม การเปลี่ยนแปลงเป็น Tailwind presentation branches และ dialog shell sizing เท่านั้น ไม่มีการเปลี่ยน data flow, API หรือ routing

**Tech Stack:** React, TypeScript, Tailwind utility classes, shadcn/Radix Dialog, Vitest + Testing Library, existing `GlobalAlerts` SSE/notification flow

**Spec:** `docs/portable-skill-pack/specs/2026-09-22-compact-chat-feedback-ui-design.md`

## Global Constraints

- เปลี่ยนเฉพาะ presentation ของ `FeedbackButton` dialog และ `ChatView` เมื่อถูกใช้ใน dialog นี้
- คงการสร้าง conversation, model selection, task control, feedback submission, attachment, media generation และ send handlers เดิม
- ไม่เปลี่ยน API, schema, routing, worker flow หรือเพิ่ม dependency
- ไม่แทนที่หรือย้าย ownership ของ `GlobalAlerts`, notification bell, urgent center modal, SSE notification stream หรือ `/notifications`
- ห้ามรัน `npm run typecheck` ตาม AGENTS.md
- รักษา unrelated dirty-worktree changes และ stage เฉพาะไฟล์ที่เป็นของงานนี้หากภายหลังมีการ commit

## Review Focus

1. Mobile full-screen dialog must keep input and send action reachable without horizontal overflow. Test: FeedbackButton compact shell class/aria assertions plus browser viewport check.
2. Icon compaction must not reduce touch target or accessible name. Test: ChatView compact controls retain `aria-label`/tooltip and minimum-size classes.
3. Chat dialog must not outrank global notifications. Test: assert compact dialog uses the existing Dialog layer and no new z-index above `9990`; browser check with urgent overlay.
4. Urgent modal must appear above Chat and preserve action/dismiss behavior. Test: existing `GlobalAlerts.notificationBell` suite plus manual/browser overlay check.
5. Feedback notification deep links must remain unchanged. Test: existing `resolveNotificationActionUrl` coverage and no edits to GlobalAlerts ownership.

---

### Task 1: Add focused compact-mode regression tests

**Files:**
- Modify: `apps/web/client/src/components/guardian/__tests__/FeedbackButton.test.tsx`
- Modify: `apps/web/client/src/components/__tests__/GlobalAlerts.notificationBell.test.tsx` only if a narrow compatibility assertion is needed

**Interfaces:**
- Consumes: existing mocked `ChatView`, `GlobalAlerts`, and Testing Library harness
- Produces: failing assertions that pin compact dialog semantics and notification coexistence

- [ ] **Step 1: Write the failing test**

  Add an assertion that opening the combined dialog renders the AI Chat tab and compact embedded Chat contract, using a test-only `ChatView` mock that records the received `density` prop. Add an assertion that the dialog class contains full-screen mobile sizing and bounded desktop sizing. Keep existing behavior assertions unchanged.

- [ ] **Step 2: Run the focused test to verify it fails**

  Run from `apps/web`:

  ```bash
  npm test -- client/src/components/guardian/__tests__/FeedbackButton.test.tsx --environment jsdom --run
  ```

  Expected: FAIL because `FeedbackButton` does not pass `density="compact"` and does not yet expose the new responsive class contract.

- [ ] **Step 3: Add the notification compatibility assertion if needed**

  Prefer existing `GlobalAlerts.notificationBell` tests for SSE, unread bell, urgent modal, and action routing. Only add a narrow test if the Chat change introduces a testable regression boundary; do not duplicate the notification implementation in `FeedbackButton` tests.

---

### Task 2: Implement compact embedded Chat presentation

**Files:**
- Modify: `apps/web/client/src/components/chat/ChatView.tsx:748-790, 5629-5905, 6510-7010`
- Test: `apps/web/client/src/components/guardian/__tests__/FeedbackButton.test.tsx`

**Interfaces:**
- Consumes: optional `density?: "default" | "compact"` prop, defaulting to `"default"`
- Produces: compact-only class branches for header, model/identity controls, quick actions, composer actions, and input/send layout; all event handlers remain unchanged

- [ ] **Step 1: Add the optional prop with the current default**

  Extend `ChatViewProps` with `density?: "default" | "compact"`, destructure it with `density = "default"`, and derive a boolean or class helper locally. Do not alter the default rendering path used by `/chat`.

- [ ] **Step 2: Apply compact classes without changing behavior**

  Reduce visual chrome and gaps only in the compact branch: keep the conversation/model controls available, let labels truncate instead of forcing width, make secondary icon buttons compact while retaining at least touch-sized hit areas, and give the text input/send action the dominant flex width. Keep mobile wrapping intentional and preserve existing tooltip/accessible names.

- [ ] **Step 3: Run the focused failing test**

  ```bash
  npm test -- client/src/components/guardian/__tests__/FeedbackButton.test.tsx --environment jsdom --run
  ```

  Expected: still FAIL until `FeedbackButton` passes `density="compact"`.

- [ ] **Step 4: Refactor only after the test remains meaningfully red**

  Consolidate repeated compact class strings with local constants/helpers only if this reduces duplication without changing the default Chat layout.

---

### Task 3: Implement responsive FeedbackButton shell and wire compact mode

**Files:**
- Modify: `apps/web/client/src/components/guardian/FeedbackButton.tsx:656-740`
- Test: `apps/web/client/src/components/guardian/__tests__/FeedbackButton.test.tsx`

**Interfaces:**
- Consumes: `ChatView` optional `density="compact"`
- Produces: mobile full-screen dialog, bounded tablet/desktop surface, compact active tabs, and notification-safe layering

- [ ] **Step 1: Pass compact mode to the embedded ChatView**

  Add `density="compact"` to the existing `ChatView` instance. Do not change `conversationId`, `composerPrompt`, `showBrowserSessionEntry`, or any callbacks.

- [ ] **Step 2: Refine dialog shell classes**

  Use full viewport dimensions and safe-area-aware padding on mobile, remove excessive outer margin/radius only at the mobile breakpoint, and use a wider bounded surface on tablet/desktop. Keep `overflow-hidden` on the shell so ChatView owns its internal scroll. Do not add a z-index higher than the existing global alert stack (`9990+`).

- [ ] **Step 3: Refine title and tab density**

  Preserve title, roles, labels, and close behavior. Use compact icon sizing and active-state contrast; allow the tab labels to collapse visually only where accessible names remain and the touch target remains usable.

- [ ] **Step 4: Run the focused test to verify it passes**

  ```bash
  npm test -- client/src/components/guardian/__tests__/FeedbackButton.test.tsx --environment jsdom --run
  ```

  Expected: PASS, with existing placement, tab, feedback, and admin-navigation tests preserved.

---

### Task 4: Verify notification coexistence and responsive proof

**Files:**
- Modify: `orchestra/ui-browser-evidence.md` if browser evidence can be captured; otherwise record skipped checks and blocker in the final report
- Test: `apps/web/client/src/components/__tests__/GlobalAlerts.notificationBell.test.tsx`

**Interfaces:**
- Consumes: compact dialog and unchanged `GlobalAlerts` owner/stack
- Produces: evidence that bell, SSE/toast, urgent center modal, and deep links remain usable with Chat open

- [ ] **Step 1: Run focused notification regression tests**

  ```bash
  npm test -- client/src/components/__tests__/GlobalAlerts.notificationBell.test.tsx --environment jsdom --run
  ```

  Expected: existing notification tests pass, including unread bell, grouped alerts, SSE action routing, and urgent behavior covered by the suite.

- [ ] **Step 2: Run combined focused tests**

  ```bash
  npm test -- client/src/components/guardian/__tests__/FeedbackButton.test.tsx client/src/components/__tests__/GlobalAlerts.notificationBell.test.tsx --environment jsdom --run
  ```

- [ ] **Step 3: Run static diff checks**

  ```bash
  git diff --check
  ```

- [ ] **Step 4: Capture browser evidence where available**

  Verify the compact surface at mobile `390x844`, tablet `768x1024`, desktop `1440x900`, plus small-mobile `360x800` and laptop `1024x768`. While Chat is open, verify the bell/dropdown remains owned by `GlobalAlerts`, an urgent modal renders above Chat, and its view/dismiss action still works. Record screenshots or explicitly mark browser checks skipped if tooling/auth is unavailable.

- [ ] **Step 5: Inspect owned diff and report unrelated baseline issues**

  Run:

  ```bash
  git status --short
  git diff --stat -- apps/web/client/src/components/chat/ChatView.tsx apps/web/client/src/components/guardian/FeedbackButton.tsx apps/web/client/src/components/guardian/__tests__/FeedbackButton.test.tsx apps/web/client/src/components/__tests__/GlobalAlerts.notificationBell.test.tsx
  ```

  Confirm no unrelated dirty-worktree files were changed by this task. Do not run repository-wide typecheck.
