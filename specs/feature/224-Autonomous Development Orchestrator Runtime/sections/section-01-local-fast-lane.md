# Section 01 — Local Developer Fast Lane

**Owned paths:** workspace lifecycle scripts/tests; existing SPEC-224 local admission and SPEC-226 create path/tests only when required. Do not touch Protected Runner semantics.

**Prerequisites:** authenticated developer principal and current canonical source SHA. Existing task workspace remains isolated from the primary checkout.

**Deliverable:** ordinary reversible local developer work can acquire an automatically generated task identity, isolated registered workspace, active owner lease/fence, exact source binding, allowed write set and bounded budget without asking for a Protected Runner grant. Unauthorized/cross-scope/protected actions fail closed.

**TDD:** local R1/R2 allow; missing/invalid principal deny; protected operation deny; exact source/path and budget enforced; no lease on provisioning failure.

**Acceptance:** returned workspace receipt binds task/session/process, base SHA, allowed paths, lease expiry/fence and policy evidence; existing runner-based flows remain behavior-compatible.

**Risks:** session identity may outlive process; lease expiry cannot alone imply process exit. Do not enable reclaim here before Section 02 fencing.

**Merge readiness:** focused tests + syntax checks, then normal protected integration. Gate remains disabled if caller binding is unavailable.
