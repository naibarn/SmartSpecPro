# Section 06: Chat Routing And Card UI

## Purpose

Update Chat routing and confirmation UI so direct paths remain direct and Hybrid uses neutral preview.

## Depends On

- `section-01-contracts-flags-routing-fixtures`
- `section-03-neutral-router-runtime-coordinator`

## Blocks

- neutral workspace route integration
- release routing fixtures

## Files Owned By This Section

- `apps/web/shared/chatSkillRouting.ts`
- `apps/web/client/src/components/chat/chatLocalRouting.ts`
- `apps/web/client/src/components/chat/chatLocalRouting.test.ts`
- `apps/web/client/src/components/chat/ChatView.tsx`
- `apps/web/client/src/components/chat/HybridOrchestrationCard.tsx`
- `apps/web/client/src/components/chat/__tests__/HybridOrchestrationCard.test.tsx`
- `apps/web/client/src/locales/en/common.json`
- `apps/web/client/src/locales/th/common.json`

## Routing Rules

Evaluation order:

1. slash/direct command
2. direct image/video command
3. prompt enhance/edit command
4. direct skill detection
5. Hybrid-positive staged intent
6. ambiguity confirmation

Direct commands must never open Hybrid unless the prompt explicitly asks for staged alternatives, critique, approval, or final execution after review.

## UI/UX Contract

### Target User / JTBD

- Role: Chat user.
- Goal: Decide whether a complex request should run as staged Hybrid Flow or stay in chat/direct skill.
- Entry point: Chat message response card.
- Success outcome: User can confidently start Hybrid, keep chatting, or use direct skill.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Chat message area | `ChatView.tsx` | render Hybrid card only when route says confirmation |
| Hybrid card | `HybridOrchestrationCard.tsx` | remove Agency query; create neutral preview token |
| Private chat empty state | Chat surface | hide disabled Work OS/Hybrid affordances |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| `HybridOrchestrationCard` | Chat component | confirmation UI and actions | plan, reason, preview mutation |
| Chat routing helpers | shared/client routing files | deterministic route decisions | prompt text, skill metadata |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading | button shows opening state | component test |
| empty | no Hybrid card | Chat UI test |
| error | localized toast/error | component test |
| success | navigates to `/hybrid/preview` | component test |
| disabled/focus/hover | disabled flag hides or disables action; focus visible | component/browser test |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | actions remain reachable, no composer overlap | browser evidence |
| tablet 768x1024 | card fits within chat column | browser evidence |
| desktop 1440x900 | card aligns with message layout | browser evidence |

### Accessibility Acceptance

- Keyboard path reaches primary and secondary actions.
- Focus visibility is preserved.
- Buttons have descriptive labels.
- Card uses semantic text, not icon-only action ambiguity.
- Reduced motion does not affect usability.

### Copy Contract

- Tone: concise, practical, Thai/English localized.
- Required labels: Start Hybrid Flow, Keep in Chat, Run Direct Skill.
- Error copy: failed to open, unavailable by flag, expired preview.
- Localization fallback: English string must exist for every Thai key.

### Browser Evidence Required

- Public chat card.
- Private chat without hidden Work OS/Hybrid leakage.
- Mobile card.

## TDD Expectations

Write tests first for:

- no `agency.list` dependency in Chat-origin card behavior
- neutral preview mutation payload
- navigation to `/hybrid/preview`
- direct image/video/prompt-enhance fixtures
- private chat hidden states
- localized labels exist

## Acceptance Checks

- Chat-origin card works without published Agency.
- Direct media/prompt/skill commands remain direct.
- UI is keyboard and mobile reachable.

