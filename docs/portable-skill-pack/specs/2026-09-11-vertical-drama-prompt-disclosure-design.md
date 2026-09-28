# Vertical Drama prompt disclosure design

## Goal

Reduce the amount of long prompt text shown in the Vertical Drama storyboard UI to a maximum of ten visible lines while preserving the complete prompt for inspection, copying, editing, generation, and character-count display.

## Scope

The existing shared `InlineEditablePromptBox` is used by all prompt cards in the storyboard panel: start-frame image prompts, stop-frame image prompts, supplementary view prompts, and Legacy/Enhanced video prompts. Its read-only preview will become a disclosure surface shared by all of those callers.

Stop-frame cards without a prompt start collapsed to their header only. The header remains keyboard accessible and can be activated to reveal the empty state and existing edit/generation actions. The same empty-state behavior is safe for other prompt cards because it removes blank visual noise without changing their actions.

## Interaction and data flow

- The stored `prompt` string remains the source of truth and is passed unchanged to copy, edit, AI adjustment, render, and save callbacks.
- Read-only text renders in a fixed ten-line preview using the existing prompt text styling. A resize-aware overflow check exposes an expand control only when the content exceeds the preview, while empty prompts always expose the header disclosure control.
- Expanding reveals the complete text; collapsing returns to the ten-line preview. The disclosure resets to collapsed when the prompt value changes, so newly generated long prompts do not unexpectedly consume the full page.
- Copy remains available from the header and always calls the existing clipboard helper with the full `prompt` value, independent of disclosure state.
- The existing count continues to use `prompt.length` (or the full edit draft length while editing), so neither truncation nor disclosure state changes the displayed count.
- Editing still opens the existing full textarea and save/cancel flow. Disclosure controls are not shown while editing.

## Failure handling and accessibility

- If `ResizeObserver` is unavailable, the preview remains safely capped and a conservative text-length/newline fallback keeps the expand control available for obviously long prompts.
- The toggle is a real button with `aria-expanded` and `aria-controls`; its label changes between expand and collapse and it is keyboard reachable.
- Copy, edit, AI-adjust, and generation controls remain separate buttons so nested interactive controls are avoided.

## Verification

Add focused component coverage for: ten-line collapsed rendering, expand/collapse, full-text copy while collapsed, unchanged full character count, and empty stop-frame header-only collapse with keyboard activation. Run the focused Vertical Drama prompt tests and a client type/build check where the existing dirty worktree allows it.

## Operational considerations

This is a client-only presentational change. It requires no schema, API, provider, credit, migration, or deployment configuration change. Browser smoke should confirm the resize behavior at the storyboard page's normal desktop and narrow widths; focused tests provide the primary automated proof.
