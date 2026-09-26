# v0.4 — Fourth 24-Round Robustness / Trust-Chain Audit

| # | Dimension | Gap | v0.4 hardening |
|---:|---|---|---|
| 1 | External trust bootstrap | Pack could not authenticate itself safely | Added release envelope, external trust bootstrap and CI attestation boundary. |
| 2 | Validator trust | Compromised pack could modify its own validator | Declared validator consistency-only; trust verification must happen outside pack. |
| 3 | TOCTOU compile→execute | Validated files could change before launch | Added immutable digest-addressed inputs, recheck-before-launch and materialization receipt. |
| 4 | Audience binding | Compiled pack could be replayed on another Runner/workspace | Added runner/workspace/run/generation binding. |
| 5 | Replay protection | Valid old compiled pack could be reused | Added nonce, expiry and single-use activation semantics. |
| 6 | Atomic materialization | Partial pack could be visible after crash | Added staging→verify→atomic activate state machine. |
| 7 | Archive/path traversal | Materializer path rules were implicit | Added traversal/absolute/UNC/reserved path policy. |
| 8 | Symlink/hardlink escape | Pack could escape root through links | Explicitly reject unsafe links/special files. |
| 9 | Cross-platform path collision | Windows/macOS case folding could collide files | Added case-fold + Unicode collision checks. |
| 10 | Policy composition | Multiple policies had precedence but no executable algebra | Added DENY_OVERRIDES_INTERSECTION_V1 and result schema. |
| 11 | Action→capability enforcement | Allowed actions not linked to server capabilities | Added canonical action-capability map. |
| 12 | Capability spoofing | Harness could claim features without trusted probe provenance | Added runner/probe/evidence/digest fields and claimed-vs-observed split. |
| 13 | Certification freshness | Certification existed but revocation/freshness was weak | Added certification id, revalidation, revocation schema/policy. |
| 14 | Evidence trust chain | Evidence refs lacked a common signed/trusted envelope | Added EvidenceEnvelope with producer/trust/candidate/digest binding. |
| 15 | Evidence invalidation | Old evidence could survive candidate/environment changes | Added freshness/invalidation policy. |
| 16 | Untrusted logs/content | Tool output could become control-plane prompt injection | Added provenance/untrusted-content handling contract. |
| 17 | Secret redaction | Redaction was mentioned but not a pack contract | Added secret-redaction security contract. |
| 18 | Schema reference supply chain | Remote `$ref` could create network-dependent validation | Added offline bundled resolution policy. |
| 19 | Payload/DoS limits | Valid huge JSON could exhaust resources | Added typed size limits; large content by immutable refs. |
| 20 | Multi-tenant compiler cache | Compiled/context content could leak across tenants | Added tenant/project/policy/provider-bound cache rules. |
| 21 | Semantic cross-field validation | JSON Schema cannot enforce lifecycle meaning | Added semantic validation contract and negative vectors. |
| 22 | Plan DAG correctness | Plan dependencies could cycle or reference missing tasks | Added acyclic/existence semantic checks. |
| 23 | Provider overlay ambiguity | phase_mapping allowed arbitrary nested structures | Tightened provider materialization schema. |
| 24 | Release reproducibility/governance | No formal release/SBOM/CI process | Added release process, SBOM-lite inventory, negotiation golden vectors and stricter validator. |

## Assessment

v0.3 was strong at contract shape, registries and certification structure, but it still relied too
heavily on an assumption that a locally-valid pack was a trusted pack.

v0.4 introduces the missing **trust chain and execution binding**:

```text
External trusted release/attestation
→ secure extraction
→ manifest + lock verification
→ schema + semantic validation
→ policy composition
→ deterministic compile
→ audience-bound compiled pack
→ staged materialization
→ digest verification
→ atomic activation + nonce consumption
→ provider launch
→ PhaseResult + trusted EvidenceEnvelope
```

This substantially reduces the gap between “well-specified starter pack” and a pack suitable
for implementing a high-assurance autonomous development runtime.

It still does not replace Spec 224 Runtime, the server-side Authority Engine, trusted evidence
collectors, or Final Verifier.
