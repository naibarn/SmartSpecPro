# SmartAIHub Companion-Spec Alignment Addendum
## Specs 216 / 199 / 200 / 206 / 207 / 214 / 215 / Feature 195 with Specs 217–222 R3

**Date:** 2026-09-20  
**Status:** Normative interpretation guide for the R3 architecture pack

---

## 1. Purpose

Specs 217–222 extend SmartAIHub from Flow→Mini App into branded AI Products, tenant-specific development, managed runtime and reusable Skill engineering. They MUST integrate with existing authorities rather than replace them.

---

## 2. Spec 216 Boundary

Spec 216 remains the upgrade owner for the existing Workflow Studio and the base:

```text
Workflow → MiniAppDefinition
```

projection.

Interpretation after Spec 217:

```text
Spec 216
  native Flow→Mini App projection
        ↓
Spec 217
  Product Shell / Branding / multi-Mini-App composition / white-label / custom Product UX
```

A complex custom-code Mini App MAY be represented in the Product model but its source-development mechanics belong to 218/222, runtime to 219, and Data/Capability access to 220.

Spec 216 MUST NOT be expanded into a second tenant/product runtime.

---

## 3. Specs 199 / 200 / 206

- Spec 199 remains the External MCP Gateway authority.
- Spec 200 remains the External Agent native-adapter/control-plane authority.
- Spec 206 remains A2A-first interoperability/fallback authority.

Spec 222 may invoke external engineering agents through these approved routes where relevant, but MUST NOT implement parallel MCP/A2A/external-agent credential or trust systems.

---

## 4. Spec 207

Spec 207 remains the sole authority for:

```text
quote
credit reservation
capture/finality
refund/reconciliation
revenue allocation
payout identity
```

Specs 217/220/221 provide product/Skill attribution metadata only.

A Product subscription, Mini App fee, Runtime Skill fee, provider cost and partner share MAY coexist, but one execution effect MUST have one economic lineage to prevent duplicate charge/allocation.

---

## 5. Specs 214 / 215

Spec 214 remains the Node Type contract owner.

Spec 215 remains the Workflow compiler/logical runtime owner.

Specs 217–222 introduce **no new canonical Workflow Node Type solely for Product hosting, Git development, deployment, custom domains or harness context**.

Product/Skill development control-plane operations remain outside the Workflow Node taxonomy unless a genuine workflow semantic later requires a reviewed node contract.

---

## 6. Feature 195 / worker_jobs

Long-running development, build, eval, release, deployment and related physical tasks SHOULD reuse the canonical durable job/control-plane semantics where applicable.

New specs MUST NOT create an unrelated durable job table merely because the job concerns Product or Skill engineering.

Domain-specific records MAY reference canonical jobs for product-specific lifecycle state.

---

## 7. Spec 212 Revision 20

Spec 212 R20 adds UC-2831…UC-2930 specifically to validate the new architecture.

A release candidate for Specs 217–222 SHOULD NOT be called architecture-freeze ready until the critical Revision 20 families pass on representative deployment modes.

---

## 8. Canonical End-to-End Flow

```text
Tenant/Product Intent
→ Spec 217 Product architecture
→ Spec 222 development intent/context
→ capability search
   ├ existing capability → reuse
   └ missing → Spec 221 Skill Engineering
→ Spec 218 source/build/test/preview
→ ReleaseCandidate
→ Spec 219 production admission/deploy
→ Product on subdomain/custom domain
→ Spec 220 Data/Asset/Capability access
→ Spec 215 / Feature 195 execution where workflows/jobs are involved
→ Spec 207 economic finality
→ Spec 212 R20 continuous validation
```

---

## 9. Architecture Freeze Rule

A future feature request SHOULD first be classified as:

```text
Product composition        → 217
Development mechanics      → 218
Production runtime/deploy  → 219
Data/capability/security   → 220
Runtime Skill engineering  → 221
Harness/context/methodology→ 222
Validation                 → 212
```

Only create a new spec when the concern has a genuinely new source of truth that cannot live safely under these owners.
