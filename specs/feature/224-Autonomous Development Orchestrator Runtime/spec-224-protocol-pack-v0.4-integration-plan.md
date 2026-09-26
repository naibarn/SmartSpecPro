
# Spec 224 × Development Protocol Pack v0.4 — Implementation Integration Plan
## Runtime, Compiler, Runner, Provider Adapters, Compatibility Matrix, Contract Tests & Release Gates

**Date:** 2026-09-21  
**Target:** SmartAIHub autonomous development stack  
**Primary Spec:** Spec 224 Revision 4  
**Protocol Pack:** SmartAIHub Development Protocol Pack v0.4  
**Protocol family:** `SAH-DEV-PHASE-1`  
**Compiler contract:** `SAH-PACK-COMPILER-3`

---

# 0. Executive Decision

Spec 224 and Development Protocol Pack v0.4 SHALL be implemented as **two cooperating layers**:

```text
Spec 224 Runtime
= durable lifecycle authority

Development Protocol Pack
= provider-facing phase execution contract
```

They SHALL NOT be merged into one subsystem.

Canonical flow:

```text
User Goal / Spec
      ↓
Spec 224 DevelopmentRun
      ↓
State Machine selects phase
      ↓
Phase Requirements
      ↓
HarnessCapabilityManifest + ProviderCertification
      ↓
HarnessProtocolPackCompiler
      ↓
CompiledHarnessProtocolPack
      ↓
Secure Runner Materialization
      ↓
Codex / Claude / Antigravity / ZCode / DeepSeek / Hermes
      ↓
PhaseResult
      +
Trusted EvidenceEnvelope
      ↓
Spec 224 State Reducer
      ↓
Next Phase / Recovery / Human Decision / Final Verify
```

---

# 1. Repository Layout

Recommended source structure:

```text
packages/
  development-protocol-pack/
    protocols/
    descriptors/
    schemas/
    compiler/
    providers/
    registries/
    policies/
    conformance/
    evals/
    certification/
    security/
    runtime-contracts/

apps/web/
  development-runs/
  development-decisions/

services/
  development-orchestrator/
    run-service/
    state-machine/
    event-reducer/
    next-action-compiler/
    recovery-controller/
    evidence-service/
    final-verifier/
    reconciler/
    watchdog/

  harness-protocol-compiler/
    compiler/
    negotiation/
    pack-builder/
    release-verifier/
    cache/

  provider-certification/
    capability-probes/
    conformance/
    behavioral-evals/
    certification-registry/

runner/
  protocol-materializer/
  evidence-collectors/
  provider-host/
  command-broker/

agent-runtime/
  providers/
    codex/
    claude/
    antigravity/
    zcode/
    deepseek-harness/
    hermes/
```

---

# 2. Ownership Matrix

| Concern | Owner |
|---|---|
| DevelopmentRun lifecycle | Spec 224 Runtime |
| Current phase | Spec 224 Runtime |
| Retry/recovery | Spec 224 Runtime |
| Human decision | Spec 224 Runtime |
| Authority | server-side Authority Engine |
| Final Verify | Spec 224 Final Verifier |
| Phase semantics | Development Protocol Pack |
| Phase input/output schema | Development Protocol Pack |
| Provider materialization | Spec 222 compiler implementation |
| Provider session/resume/cancel | Spec 200 provider adapters |
| Workspace/Git/build/test | Spec 218 |
| Runner execution | canonical Runner |
| Trusted evidence capture | Runner/CI collectors |
| Provider capability probe | provider adapter + certification service |
| Provider certification | certification service |
| Production deployment | Spec 219 |

Invariant:

> No Pack Skill, provider hook, provider session, Runner process or provider-local agent may advance DevelopmentRun state directly.

---

# 3. Runtime-to-Pack Integration Contract

Spec 224 SHALL invoke the compiler only after it has resolved:

```text
development_run_id
phase
phase_generation
candidate_sha
base_sha
SpecDependencyLock
AuthorityProfile
PolicySnapshot
VerificationProfile
ProjectContextPack
HarnessCapabilityManifest
ProviderCertificationRecord
MethodologyProfile?
```

Runtime produces:

```text
HarnessProtocolCompileRequest
```

defined by v0.4.

The compiler SHALL return:

```text
CompiledHarnessProtocolPack
```

The Runtime SHALL verify:

```text
pack protocol family compatible
pack audience matches run/runner/workspace
pack source lock digest trusted
pack certification compatible with risk profile
pack not expired
pack nonce unused
```

before dispatch.

---

# 4. Compile-Time Flow

```text
DevelopmentRun current phase
       ↓
load DevelopmentPhaseProtocol descriptor
       ↓
load phase exposure matrix
       ↓
load HarnessCapabilityManifest
       ↓
load ProviderCertificationRecord
       ↓
Protocol Negotiator
       ↓
DIRECT_NATIVE
PACK_AUGMENTED
PROMPT_FALLBACK
ALTERNATE_PROVIDER_REQUIRED
POLICY_BLOCKED
       ↓
Policy Composition
       ↓
HarnessProtocolPackCompiler
       ↓
CompiledHarnessProtocolPack
       ↓
schema validation
       ↓
semantic validation
       ↓
content digest
       ↓
dispatch intent
```

---

# 5. Phase Mapping

## PLANNING

Runtime:

```text
state = PLANNING
```

Pack exposure:

```text
sah-plan
sah-requirement-trace
```

Expected provider output:

```text
DevelopmentPlan
PhaseResult
```

Runtime next action:

```text
PLAN_VERIFY
```

Provider SHALL NOT self-advance to IMPLEMENT.

---

## IMPLEMENTING

Pack:

```text
sah-implement
sah-repo-safety
sah-requirement-trace
+ methodology skill such as TDD when selected
```

Provider output:

```text
SourceChangeSet
PhaseResult
```

Trusted source state:

```text
Git collector / Spec 218
```

Runtime next:

```text
BUILDING
```

---

## TESTING

Primary executor SHOULD be deterministic:

```text
Runner test collector
```

Provider Skill may interpret failures but SHALL NOT create trusted TestResult.

Output:

```text
EvidenceEnvelope(UnitTestResult/IntegrationTestResult)
```

If fail:

```text
Spec 224 → DEBUGGING
```

---

## DEBUGGING / REPAIRING

Pack:

```text
sah-debug-repair
sah-repo-safety
sah-requirement-trace
```

Inputs:

```text
FailureEvidence
prior failed strategies
candidate SHA
```

Output:

```text
RepairResult
PhaseResult
```

Runtime determines retry/regression scope.

---

## REVIEWING

Preferred:

```text
native detached/fresh provider review
```

Pack fallback:

```text
sah-review
sah-requirement-trace
sah-repo-safety
```

Output:

```text
ReviewResult
PhaseResult
```

Runtime next:

```text
FIXING_REVIEW
or
VERIFYING
```

---

## VERIFYING

Pack:

```text
sah-verify
sah-requirement-trace
```

Output:

```text
VerificationGapReport
```

This phase remains advisory.

Trusted Final Verify remains server-side.

---

## HANDOFF

Pack:

```text
sah-handoff
```

Output:

```text
HarnessHandoffManifest
```

Runtime validates:

```text
candidate SHA
phase generation
SpecDependencyLock
AuthorityProfile
Protocol Pack digest
```

before provider switch.

---

# 6. Runtime API Boundaries

Recommended internal service APIs:

```text
POST /internal/development-runs/{id}/compile-phase-pack
POST /internal/development-runs/{id}/dispatch-phase
POST /internal/development-runs/{id}/phase-results
POST /internal/development-runs/{id}/evidence
POST /internal/development-runs/{id}/provider-questions
POST /internal/development-runs/{id}/provider-approvals
POST /internal/development-runs/{id}/reconcile
POST /internal/development-runs/{id}/final-verify
```

Provider adapters SHALL NOT call state transition APIs directly.

They return events/results only.

---

# 7. Runner Integration

Runner SHALL implement:

```text
ProtocolMaterializer
CommandExecutionBroker
EvidenceCollectors
ProviderHost
PackCleanup/Reaper
```

Materialization flow:

```text
receive dispatch
→ verify audience
→ verify nonce
→ verify expiry
→ create private staging directory
→ reject path traversal/symlink escape
→ write provider assets
→ verify digests
→ issue MaterializationReceipt
→ atomic activate
→ launch provider
```

After provider completion:

```text
collect PhaseResult
collect trusted evidence
cleanup transient pack
revoke credentials
```

---

# 8. Provider Adapter Interface

All provider adapters SHOULD expose a common semantic interface:

```ts
interface DevelopmentHarnessAdapter {
  probeCapabilities(): HarnessCapabilityManifest
  startPhase(input: PhaseExecutionInput): ProviderSessionRef
  resumePhase(input: ResumePhaseInput): ProviderSessionRef
  steerPhase(input: SteerPhaseInput): void
  cancelPhase(input: CancelPhaseInput): void
  collectPhaseResult(): PhaseResult
  collectProviderEvents(): AsyncIterable<ProviderEvent>
  materializationProfile(): ProviderMaterializationProfile
}
```

Optional:

```text
startNativeReview()
startNativePlan()
spawnSubagent()
forkSession()
```

Core Runtime must not depend on optional provider-specific methods.

---

# 9. Compatibility Matrix

Minimum compatibility record:

| Component | Required version |
|---|---|
| Spec 224 Runtime | Revision 4 implementation |
| Protocol family | SAH-DEV-PHASE-1 |
| Protocol Pack | v0.4.x |
| Compiler | SAH-PACK-COMPILER-3 |
| Runner materializer | PACK-MATERIALIZER-1 |
| PhaseResult | schema from Pack v0.4 |
| Capability Manifest | schema from Pack v0.4 |
| Provider Certification | schema from Pack v0.4 |

Each provider certification SHALL pin:

```text
provider runtime version
adapter version
provider materialization profile version
protocol family
pack release reference
capability manifest digest
```

---

# 10. Cross-Compatibility Checks

Before dispatch:

```text
Runtime protocol family
      ==
Pack protocol family

Pack compiler contract
      compatible with
Compiler implementation

Provider runtime
      matches
ProviderCertificationRecord

Provider overlay version
      matches certification

Runner materializer
      supports pack scope/version

PhaseResult schema
      supported by Runtime reducer
```

Any mismatch:

```text
COMPATIBILITY_BLOCKED
```

not best-effort execution.

---

# 11. Contract Test Layers

## CT-1 — Pack Schema Contract

Verify all:

```text
DevelopmentPhaseProtocol
DevelopmentPlan
PhaseResult
ReviewResult
HarnessHandoffManifest
CompiledHarnessProtocolPack
EvidenceEnvelope
ProviderCertificationRecord
```

against v0.4 schemas.

---

## CT-2 — Runtime Reducer Contract

For every valid `PhaseResult`:

```text
given current state
+ event
+ policy
+ evidence
→ deterministic next state
```

Golden state-transition fixtures SHOULD be maintained.

---

## CT-3 — Compiler Contract

Same normalized inputs SHALL produce semantically identical output.

Test:

```text
same compile request
same provider profile
same policy snapshot
→ same canonical module set
→ same materialization decision
```

Audience fields such as nonce/time may differ while semantic payload remains identical.

---

## CT-4 — Runner Materializer

Test:

```text
valid pack
expired pack
wrong Runner
wrong workspace
nonce replay
path traversal
symlink escape
partial write
digest mismatch
case collision
```

Only valid case reaches ACTIVE.

---

## CT-5 — Provider Adapter Contract

Run HC-01..HC-24 against each provider.

---

## CT-6 — Behavioral Contract

Run v0.4 behavioral eval suite.

Certification thresholds determine H3/H4.

---

## CT-7 — Evidence Trust Contract

Provider claims:

```text
tests passed
```

must not produce:

```text
TRUSTED_COLLECTOR UnitTestResult
```

unless Runner/CI collector produced it.

---

## CT-8 — Recovery Contract

Inject:

```text
provider crash
Runner disconnect
server restart
duplicate event
late result
malformed PhaseResult
```

DevelopmentRun SHALL recover or enter correct bounded terminal/decision state.

---

# 12. Cross-Spec Compatibility Checks

## Spec 218

Verify:

```text
workspace ID
candidate/base SHA
SourceChangeSet
Git state
build/test evidence
```

are consumed by Spec 224 without duplicate workspace/Git ownership.

## Spec 222

Verify:

```text
ProjectContextPack
HarnessProtocolPackCompiler
methodology Skills
provider bootstrap
```

are packaging/context concerns only.

Spec 222 SHALL NOT own phase lifecycle.

## Spec 200

Verify provider adapters normalize:

```text
session
resume
cancel
events
PhaseResult
```

without implementing Spec 224 state transitions.

## Spec 186

Verify `worker_jobs` / `worker_job_events` remain execution SoT.

DevelopmentRun stores orchestration references, not a duplicate queue.

## Spec 219

Final Verify creates:

```text
ReleaseCandidate
```

but does not directly bypass production release policy.

---

# 13. Required Integration Test — End-to-End

```text
1. User submits a Spec.
2. Spec 224 creates DevelopmentRun.
3. Runtime locks Spec dependencies.
4. PLAN compile request generated.
5. Pack compiler selects provider-native PLAN path.
6. Runner materializes audience-bound pack.
7. Provider returns DevelopmentPlan + PhaseResult.
8. Runtime performs PLAN_VERIFY.
9. IMPLEMENT pack compiled/materialized.
10. Provider creates source change.
11. Trusted Git collector records candidate SHA.
12. Test collector intentionally returns failure.
13. Runtime enters DEBUGGING.
14. Debug pack compiled automatically.
15. Provider repairs.
16. Tests pass.
17. Independent reviewer selected.
18. Review pack/native review runs.
19. Reviewer finds injected defect.
20. Runtime dispatches review-fix.
21. Regression runs.
22. Verification gap report is clean.
23. Final Verifier consumes trusted EvidenceEnvelopes.
24. VerificationCertificate issued.
25. Candidate pushed only through approved source-control path.
26. PR/ReleaseCandidate created.
27. User never sends "continue".
```

---

# 14. Compatibility Failure Tests

Mandatory mismatches:

```text
Pack v0.4 + old Compiler v2
→ BLOCK

Compiler v3 + unsupported protocol family
→ BLOCK

Provider upgraded but certification pins old version
→ BLOCK / RECERTIFY

Runner materializer lacks nonce replay protection
→ provider cannot receive H4 job

PhaseResult old schema missing action_id
→ reject / adapter migration path

Pack digest changed after compile
→ PACK_TAMPER_DETECTED

Capability Manifest says H4 feature but probe evidence missing
→ downgrade/block

Provider overlay attempts forbidden authority expansion
→ compile fail
```

---

# 15. Implementation Milestones

## M1 — Embed Pack

Place v0.4 into repository:

```text
packages/development-protocol-pack/
```

CI:

```text
python tools/validate_pack.py
```

Exit:

```text
PACK_CONTRACT_PASS
```

---

## M2 — Runtime Contract Loader

Implement:

```text
ProtocolPackRegistry
SchemaRegistry
RegistryLoader
CompatibilityResolver
```

Exit:

```text
Runtime can load v0.4 without provider execution.
```

---

## M3 — Compiler

Implement:

```text
HarnessProtocolPackCompiler
ProtocolNegotiator
PolicyComposer
PackDigestBuilder
```

Start with mock provider manifest.

Exit:

```text
valid compile request → valid CompiledHarnessProtocolPack
```

---

## M4 — Runner Materializer

Implement secure staging/activation.

Exit:

```text
all path/replay/tamper negative fixtures PASS
```

---

## M5 — Codex Reference Adapter

Implement:

```text
capability probe
session start/resume
phase execution
structured PhaseResult
native review integration
question/approval interception
```

Exit:

```text
Codex HC-01..HC-24 PASS at target certification level
```

---

## M6 — Runtime Auto-Continuation

Connect:

```text
PhaseResult
→ reducer
→ NextAction
→ next compile request
```

Exit:

```text
PLAN → IMPLEMENT → TEST → DEBUG → REVIEW
without user continuation.
```

---

## M7 — Evidence / Final Verify

Connect trusted collectors.

Exit:

```text
provider cannot self-certify PASS.
```

---

## M8 — Additional Providers

Order recommended:

```text
Claude
Antigravity
ZCode
DeepSeek Harness
Hermes
```

Each provider independently passes conformance/certification.

---

# 16. CI Pipeline

Recommended CI jobs:

```text
protocol-pack-validate
protocol-pack-semantic-tests
compiler-golden-vectors
runtime-reducer-contract-tests
runner-materializer-security-tests
provider-adapter-unit-tests
provider-conformance-smoke
evidence-trust-tests
cross-spec-contract-tests
failure-injection-tests
```

For release:

```text
clean checkout
→ validate
→ build immutable pack
→ generate manifest/lock/SBOM
→ attest
→ publish
→ update TrustedProtocolPackRegistry
```

---

# 17. Compatibility Dashboard

Admin/Internal UI SHOULD show:

```text
Protocol Pack        v0.4.0  TRUSTED
Protocol Family      SAH-DEV-PHASE-1
Compiler             v3      COMPATIBLE
Runner Materializer  v1      COMPATIBLE

Codex
  Runtime            x.y
  Adapter            a.b
  Certification      H4
  Status             READY

Claude
  Certification      H3
  Status             READY

Antigravity
  Certification      H3
  Status             READY

ZCode
  Certification      H2
  Status             LIMITED

DeepSeek Harness
  Certification      H2
  Status             PROVISIONAL

Hermes
  Certification      H3
  Status             READY
```

Actual values come from probes/certification, not hard-coded assumptions.

---

# 18. Definition of Compatible

Spec 224 Runtime and Development Protocol Pack v0.4 are considered compatible only if:

```text
1. Runtime understands protocol family.
2. Runtime understands all required schemas.
3. Compiler contract version is supported.
4. Pack release is externally trusted.
5. Registries load without unknown required identifiers.
6. Runtime reducer accepts current PhaseResult schema.
7. Runner supports secure materialization contract.
8. Provider certification supports requested risk profile.
9. Evidence trust model is enforced.
10. Final Verify consumes only accepted evidence classes/trust levels.
```

---

# 19. Definition of Integrated

They are considered **integrated**, not merely compatible, only when:

```text
one DevelopmentRun
→ compiles at least two different phases
→ runs a real provider
→ produces valid PhaseResult
→ consumes trusted evidence
→ auto-continues
→ survives one injected failure
→ completes independent review
→ Final Verify passes
```

---

# 20. Production Release Gate

Production autonomous development SHALL remain disabled until:

```text
Protocol Pack v0.4 trusted-release verification PASS
Compiler SAH-PACK-COMPILER-3 PASS
Runner secure materialization PASS
Runtime reducer contract PASS
Codex reference provider H3/H4 PASS
Evidence trust separation PASS
Human Decision interception PASS
Recovery test PASS
Cross-spec ownership audit PASS
End-to-end no-"continue" scenario PASS
```

High-assurance SmartAIHub self-development additionally requires:

```text
at least one independent reviewer path
protected source-control path
Automation Fork / isolated automation repository
merge-base freshness
VerificationCertificate
provider certification freshness
fault injection suite
```

---

# 21. Critical Architectural Rule

The integration SHALL preserve:

```text
Protocol Pack tells provider HOW to perform a bounded phase.

Spec 224 Runtime decides WHAT phase runs, WHEN it runs,
WHETHER it succeeded, WHAT happens next,
and WHETHER the overall Development Run is complete.
```

If implementation reverses this relationship, the architecture is incorrect.

---

# 22. Recommended First Implementation Slice

Implement only:

```text
Spec 224 Runtime
+ Protocol Pack v0.4
+ Compiler v3
+ Runner materializer
+ Codex adapter
```

First target:

```text
User:
"Implement fixture Spec."

PLAN
→ Codex
→ DevelopmentPlan

IMPLEMENT
→ Codex
→ source change

TEST
→ deterministic test fails

DEBUG
→ Codex automatically

TEST
→ PASS

REVIEW
→ detached/fresh review

FINAL VERIFY
→ PASS
```

No user message between phases.

Once this passes reliably, add other providers.

---

# 23. Final Recommendation

Do not implement the Pack and Spec 224 as two independent projects that are only connected later.

Develop them using **contract-first vertical slices**:

```text
State transition
→ protocol descriptor
→ compiler mapping
→ materialization
→ provider execution
→ PhaseResult
→ evidence
→ reducer
```

one phase at a time.

Recommended sequence:

```text
PLANNING
→ IMPLEMENTING
→ TESTING
→ DEBUGGING
→ REVIEWING
→ VERIFYING
→ HANDOFF
```

This catches incompatibility immediately instead of discovering it after every subsystem is already large.
