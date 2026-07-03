# Feature 130 Operator Playbook

## Find A Run

- Search by execution id in `hybrid_executions`.
- Confirm `tenant_id`, `user_id`, `conversation_id`, `origin_surface`, `status`, `runtime_contract_version`, `runtime_sdk_version`, and `runtime_adapter_version`.
- Read ordered rows in `hybrid_execution_stages` by `execution_id`.

## Diagnose Failures

- `adapter_hybrid_surface_unsupported`: Python adapter health does not advertise Hybrid support.
- `adapter_hybrid_contract_unsupported`: adapter does not support `hybrid-runtime-v1`.
- `hybrid_budget_exceeded` or `hybrid_stage_budget_exceeded`: budget gate blocked before or after a stage.
- `hybrid_commit_approval_required`: commit was requested without durable approval.
- `hybrid_commit_executor_failed`: server-owned commit executor failed; verify idempotency before retrying.

## Safe Actions

- Retry only failed, retryable non-commit stages.
- Cancel stuck executions by marking future stages cancelled and preserving prior artifacts.
- Resume approval only after the user explicitly approves or submits changes.
- Verify commit side effect by idempotency key before attempting recovery.

## Disable Controls

- Stop Chat offers: disable `hybridFlowChatEntryEnabled`.
- Stop SDK runtime: disable `hybridFlowOpenAiAgentsRuntimeEnabled`.
- Stop commits only: disable `hybridFlowCommitStageEnabled`.
- Keep direct chat, direct skills, direct media, and prompt enhancement enabled during rollback.

## Legacy Agency Compatibility

- Agency preview links may still open `/agencies/:id/hybrid-preview`.
- Chat-origin executions should use `/hybrid/preview` and `/hybrid/:executionId`.
- Do not migrate expired Redis previews; regenerate from the original chat message only when access still permits.
