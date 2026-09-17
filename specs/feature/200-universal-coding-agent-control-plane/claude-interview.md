# Feature 200 Interview

## Decisions

- Feature 200 is last and owns delegated External Agent provider/runtime behavior.
- Existing OpenAI Agents/LangGraph/Web/Python/Runner foundations are partial and must be adapted behind a provider-independent contract.
- Agent Tasks use Feature 195 Jobs, Feature 196 plans/approvals, Feature 197 Runner control, Feature 198 Chat, and Feature 199 MCP mediation.
- Provider sessions/events/results must be normalized without losing native evidence; workspace/context/asset/skill access is scoped and verified.
- Whole-repository typecheck is prohibited; focused provider, integration, UI and recovery tests are required.

