# section-04-api-callbacks

## Goal

Expose the authenticated tRPC API and public ElevenLabs callback route for the
voice-agent runtime.

## Depends On

- section-02-schema-contracts
- section-03-backend-services

## Files Owned

- `apps/web/server/routers/voiceAgents.ts`
- `apps/web/server/routers.ts`
- `apps/web/server/routers/__tests__/voiceAgents.test.ts`
- `apps/web/server/routes/voiceAgentsElevenLabsCallback.ts`
- `apps/web/server/routes/__tests__/voiceAgentsElevenLabsCallback.test.ts`
- `apps/web/server/_core/index.ts`

## tRPC Router

Create `voiceAgentsRouter` and register it in the app router.

Admin procedures:

- `admin.listConfigs`
- `admin.createConfig`
- `admin.updateConfig`
- `admin.setConfigEnabled`
- `admin.testConfig`
- `admin.listSessions`
- `admin.getSession`
- `admin.getTranscript`
- `admin.getToolCalls`

User procedures:

- `listEnabled`
- `createSession`
- `getConnectionMaterial`
- `stopSession`
- `ingestClientEvent`

Every procedure must:

- Use shared Zod contracts.
- Enforce authentication.
- Enforce tenant scope.
- Enforce admin/provider-management permission for admin procedures.
- Return sanitized provider errors.

## Public Callback Route

Add `POST /api/voice-agents/elevenlabs/tool-callback` in
`apps/web/server/routes/voiceAgentsElevenLabsCallback.ts`.

If Section 01 chooses `post_call_webhook` or `both`, also add
`POST /api/voice-agents/elevenlabs/post-call` in the same route module and
delegate transcript payload processing to `voiceAgentReconciliationService`.

Registration requirements:

- Register in `apps/web/server/_core/index.ts` near provider webhook routes.
- Ensure CSRF bypass is explicit for this provider callback path.
- Apply body size limit.
- Capture raw body if signature validation requires it.
- Delegate all business policy to `voiceAgentToolBridgeService`.

Route behavior:

- Valid signed callback returns 2xx after persistence.
- Denied or failed callbacks still return 2xx after durable persistence when
  appropriate for provider retry control.
- Invalid signature, stale timestamp, malformed JSON, or oversized body returns
  error without executing a tool.

## TDD

tRPC tests:

- Admin permission enforcement.
- Tenant isolation.
- DTO validation.
- Config test sanitized errors.
- Session create/get/stop lifecycle.
- Client event ingestion.

Route tests:

- Valid payload delegates to service.
- Invalid signature rejected.
- Stale timestamp rejected.
- Replay rejected.
- Oversized body rejected.
- Policy-denied tool persisted before 2xx response.
- Post-call transcript route accepts valid signed payload when enabled by the
  Section 01 reconciliation transport decision.
- Post-call transcript route rejects invalid signature, stale timestamp,
  malformed JSON, and oversized payloads.

## Acceptance

- Router and callback route compile.
- Route registration order is safe for provider callbacks.
- Tests prove callback policy is centralized in services.
- Reconciliation transport chosen by Section 01 has a concrete route or polling
  owner.
