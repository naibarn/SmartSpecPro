# Version-neutral Native Harness Ports (Proposal)

These language-neutral ports keep Pi-specific types behind an adapter and keep
the only model transport on SmartAIHub Gateway. This is a contract sketch for
review and offline fixtures; it is not a route or runtime implementation.

```text
CanonicalOrchestratorPort
  planRef -> bounded NativeAttemptRequest
  owns planning, policy, lifecycle, team intent and admission decisions

NativeHarnessPort
  run(attemptRef, immutableContextRefs, grantedToolRefs, ModelPort)
    -> stream<NormalizedHarnessEvent>
  may host a subordinate Pi loop; receives no ambient credential or host path

GatewayModelPort
  invoke(attemptRef, gatewayGrantRef, modelRef, normalizedMessages)
    -> stream<NormalizedModelEvent + UsageReceiptRef>
  resolves grant inside the Gateway adapter; no direct provider fallback

GovernedToolPort
  invoke(attemptRef, executionGrantRef, capabilityGrantRef, opaqueInputRefs)
    -> ToolResultRef
  validates the executor's current scope on every side effect

CanonicalJobPort / WorkspaceArtifactPort
  admission, status, workspace ACL and artifact custody remain references to
  the existing SPEC-195/279, SPEC-269/292/278/284/293 and Library authorities
```

The stable boundary contains no Pi package version, Node ABI, Pi session type,
database row, task scheduler, workspace registry, credit ledger, API token, or
desktop bearer token. A Pi adapter may implement `NativeHarnessPort` after
owner review and trust certification; it cannot replace the canonical Python
OpenAI Agents orchestration boundary. A Git repository is optional. No
workspace reference means no filesystem capability unless the existing
authority explicitly grants a non-filesystem operation.

## Proposed normalized event subset

```text
run_started(attemptRef, runtimeManifestRef)
model_turn(attemptRef, modelRef, gatewayUsageRef?)
tool_requested(attemptRef, capabilityGrantRef, opaqueInputRefs)
tool_result(attemptRef, resultRef, trust="untrusted")
artifact_ready(attemptRef, artifactRef, digest, provenanceRef)
cancel_requested(attemptRef)
cancel_observed(attemptRef, processReceiptRef)
attempt_indeterminate(attemptRef, reasonCode)
```

These event labels are proposals. Canonical job status and Task Control remain
authoritative. `cancel_requested` is not terminal; `artifact_ready` is a claim
until the artifact owner verifies ACL and digest.
