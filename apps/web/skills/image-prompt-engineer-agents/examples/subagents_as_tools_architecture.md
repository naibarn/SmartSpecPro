# Subagents-as-tools architecture

The skill is deterministic and model-free. It can be wrapped by a higher-level Agents SDK orchestrator.

Recommended pattern:

1. Call `build_prompt_bundle`.
2. Inspect `orchestration.selected_subagents`.
3. For complex prompts, call specialist agents as tools.
4. Merge specialist feedback in the app layer.
5. Send `render_request.image_api.prompt` to the external renderer.
6. Add the image model outside the skill.

Use agents-as-tools for specialist review because ownership returns to the prompt orchestrator. Use handoffs only when another agent should take over the conversation.
