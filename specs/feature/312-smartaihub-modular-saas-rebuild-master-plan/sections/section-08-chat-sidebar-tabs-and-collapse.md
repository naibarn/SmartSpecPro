# Section 08 — Chat sidebar tabs and collapse

## Objective

Separate primary navigation and chat history into switchable tabs within the existing left panel. Let users collapse the panel to a narrow left-edge expand control to widen the center Chat workspace. Expanding restores the previous tab and context.

## Requirements

- The expanded sidebar keeps branding, workspace selection/creation, tab controls, and account/sign-out controls available.
- The navigation tab shows primary destinations and their current route or explicit coming-soon behavior.
- The history tab shows New Chat, available conversation history, selected-thread state, and the existing unavailable-history message when the capability is disabled.
- The collapse control leaves an accessible expand control on the left edge; expansion preserves the previously selected tab.
- The layout remains usable on desktop, tablet, and mobile and does not cover the composer or theme control.
- No auth, tenant, queue, provider, credit-ledger, or deployment-target behavior changes.

## Owned paths

- `smartaihub-platform/modules/chat/src/ui/ChatWorkspace.tsx`
- `smartaihub-platform/modules/chat/src/ui/styles.css`
- `smartaihub-platform/modules/chat/src/ui/workspace.test.tsx`
- This SPEC-312 section, index, normative R1.11 addendum, and shared handoff evidence.

## Verification

- Focused Chat UI tests cover tab switching, showing/hiding the corresponding panel, collapse/expand, restoring the active tab, and existing navigation/history actions.
- Scoped `@smartaihub/chat` typecheck and build pass.
- Review at desktop, tablet, and mobile widths on `aimarkethubs.com` after integrating the exact source SHA.

## Completion and handoff

Record the exact integrated source SHA, test/build outputs, and actual development-target preview in the canonical SPEC-312 manifest/evidence. Keep remaining authenticated UAT, attachment upload contract, Queue/DO resilience, and benchmark gaps open. Do not claim parent SPEC-312 completion from this UI section.
