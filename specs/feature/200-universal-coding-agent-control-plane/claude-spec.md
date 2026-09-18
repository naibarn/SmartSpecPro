# Feature 200 Synthesized Specification

Implement the Universal External Agent Control Plane described by `spec.md` over Features 195–205. Define provider-independent Agent Task/session/turn/event/result contracts, adapt Codex/Claude/Antigravity/DeepSeek/Hermes/OpenClaw-compatible runtimes, use shared Runner control and Job durability, mediate Context/Skill/Asset/MCP access, verify workspaces/results and render Agent Panel/live task/approval/result UI. The shared Task Control projection groups open `worker_jobs` into expandable multi-step tasks with scoped completed predecessors, bounded progress and safe latest events in the existing Feedback/Chat and `/chat` surfaces.

Extend current OpenAI Agents/LangGraph/Web/Python/Tauri foundations without making the SDK or provider runtime the platform source of truth. Preserve native evidence, normalize events, fence stale/empty results, protect credentials and prohibit arbitrary direct upstream MCP or duplicate platform control planes.
