# Post-recovery Spec dispositions — 2026-10-06

## Spec 278 — retain current canonical main

Current canonical Spec 278 remains at `specs/feature/278-durable-runner-execution-sessions-recovery-fabric-r1-4/spec.md` with SHA-256 `8973e0263cfba991db278e072fe4fe602f62ecb724fc28874c7f5b7ffa08d3e0`. The recovered blob SHA-256 is `e8c4e7cbcc2d4955cdc5419e0f78c216bb6c5e6f89cd6b260943252128c57f81` (recovery commit `1698c7f`, source candidate path `specs/feature/278-durable-runner-execution-sessions-recovery-fabric-r1-4/spec.md`). The complete line-wise comparison after trimming trailing whitespace is equal; the ten raw differences are formatting/trailing-space differences in the header. Resolve authority in favor of canonical main. Do not create a revision or replace the canonical file. Retain the recovered object as equivalent historical/recovery evidence only.

## Spec 281 — retain with policy-conformance amendment

Keep `SmartAIHub Portable Mini App Knowledge Runtime & Wiki RAG`. The recovered candidate was at `specs/feature/281-smartaihub-portable-mini-app-knowledge-runtime-wiki-rag-r1-0/spec.md` with source SHA-256 `80007734debaa077e277bf9fd32a11f0aa71d02cd65d8007ed20007f83d45bfd`. Its deployment wording now clarifies that SmartAIHub-managed execution uses approved runtime substrates; Docker/OpenSandbox are not managed execution or dispatch runtimes; OCI remains an optional external/customer-owned portability target and conveys no execution authority; Spec 261 and current lifecycle/security policy govern package and deployment authority. This is a policy-conformance amendment, not abandonment.

## Spec 282 and renumbered Work Context Spec 292

Keep canonical Spec 282 as `SmartAIHub Continuous Canonicalization & Durable Work Convergence` at `specs/feature/282-smartaihub-continuous-canonicalization-durable-work-convergence-r1-0/spec.md` (SHA-256 `e22d6134574f15afff73b9d8acf958c91bdfe1f09a58fb93fe0baa4f0c45a04e`). The recovered candidate is a distinct capability and is not a revision of Spec 282.

The recovered `Adaptive Work Context, Organizational Collaboration & Federated Work Exchange` is assigned Spec 292 after refreshing the configured canonical inventory; no canonical Spec 292 record existed, while IDs 290 and 291 remain reserved. Original provenance: `previous_draft_id=282`; `renumber_reason=SPEC_ID_COLLISION`; original title `SmartAIHub Adaptive Work Context, Organizational Collaboration & Federated Work Exchange`; original path `specs/feature/282-adaptive-work-context-organizational-collaboration-federated-exchange-r1-0/spec.md`; original SHA-256 `5c82aa08ce1887544d7172b0f4be4f2d272f90152101d0dae7b8be06121492a6`; recovery source `/home/dev/projects/SmartSpecPro/specs/feature/282-adaptive-work-context-organizational-collaboration-federated-exchange-r1-0/spec.md` in the prepared recovery checkout. The source copy was preserved and only its canonical identity plus semantic references were changed.

Semantic references in Specs 284 and 285 that mean Adaptive Work Context now point to Spec 292. Spec 285's registry note describing allocation of IDs 282–284 remains unchanged because it describes registry allocation, not the Adaptive Work Context dependency. Other references to current canonical Spec 282 remain unchanged.

## Inventory and integration state

Pre-integration inventory on the refreshed canonical base plus these task-owned Spec changes discovers one canonical record each for IDs 278, 281, 282, 283, 284, 285, and 292, with no duplicate ID/revision relationship for IDs 278, 281, 282, 290, 291, or 292. IDs 290 and 291 remain reserved but are not present in this checkout. This evidence is candidate validation; the post-recovery upload predicate becomes satisfied only once this exact Spec set is integrated into the configured canonical ref. Regenerate relationship/provenance projections and resume repository-wide reconciliation against that integrated SHA.
