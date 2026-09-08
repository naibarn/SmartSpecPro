# Request

Replace the normal Vertical Drama character prompt generation path with the
new `character-prompt-skill`. Generate only the prompt deliverable requested by
the current action instead of always generating five sibling prompts. Preserve
the existing portrait preview/approval flow, image rendering, reference locks,
Character DNA persistence, tenant ownership, fixed skill billing, and legacy
records. Keep `character-candidate-prompt` for reference-guided candidate
casting.

## Constraints and assumptions

- Worktree contains unrelated dirty changes; touch only files required by this
  feature and the planning package.
- No image generation, deployment, service restart, or destructive database
  mutation is part of implementation.
- Existing `vertical-drama-character-visual-bible` remains available for legacy
  callers while the normal character router moves to the adapter.
- `character-prompt-skill` is already present on disk and enabled in the skills
  registry, with `openai/gpt-5.6-luna` available through current model policy.
- One LLM call produces one validated profile and one requested prompt. Image
  rendering remains a separate media operation and charge.
