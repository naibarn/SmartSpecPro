# Orchestra Contracts

No cross-agent contracts. Direct conductor implementation only.

## Stable Behavioral Contract
- Do not change tRPC request/response shapes.
- Do not change chat message send/stream behavior.
- Do not change skill/local AI/media routing behavior.
- Preserve `/chat?c=<conversationId>` deep-link behavior.
- Preserve sidebar conversation selection, new chat, personal chat, team room open, trash, and bulk select behavior.
