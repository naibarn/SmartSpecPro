# Model Compatibility

Support tier: Tier A - Agents SDK ready
Subagent support: Single-agent

## Agents SDK Notes
- Compatible with OpenAI Agents SDK `Skills` sandbox mounting.
- Best results come from explicit inputs, structured outputs, and deterministic scripts.
- Handoffs and context injection should stay outside the bundle entry scripts.

## Hard Minimum
- tool calling
- multi-step tool loop
- reliable instruction following
- plain-text final output

## Recommended
- deterministic scripts
- structured outputs
- trace-friendly logs

## Optional Features
- handoffs
- multi-agent orchestration

## Caveats
- Keep provider-specific settings explicit.
