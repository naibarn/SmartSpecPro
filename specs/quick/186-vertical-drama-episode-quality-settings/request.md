# Request

Implement per-episode Drama Series quality settings with two independent controls:

- image model quality, forwarded as provider `quality` when supported;
- LLM reasoning/thinking quality, primarily using OpenRouter `reasoning.effort` when supported.

The current episode stores its own value. Saving also updates the series default for future episodes only. Existing episodes must not be changed retroactively. The user approved autonomous implementation and authorized bounded real provider verification if needed.

## Constraints

- Preserve the existing dirty worktree and unrelated changes.
- Use additive nullable migration patterns.
- Keep existing model selection and paid confirmation behavior intact.
- Do not silently substitute providers or models.
- Use npm, the repository package manager.

## Assumptions

- The existing series LLM model policy continues to select the LLM model; this feature controls reasoning quality rather than adding an episode LLM-model picker.
- `effort` is the first LLM control. No user-facing reasoning token budget is added in this slice.
