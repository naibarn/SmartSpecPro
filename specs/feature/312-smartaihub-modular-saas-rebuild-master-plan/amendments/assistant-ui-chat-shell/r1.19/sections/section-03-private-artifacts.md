# Section 03 — Private artifact path

- Requirement IDs: R1.19-3, R1.19-7.
- Objective: implement authorized artifact metadata and private object retrieval/preview using existing Core storage boundaries, enabling capability only after complete route coverage.
- Owned scope: Core artifact API/repository and existing R2 patterns; Chat proxy and UI viewer only where needed.
- Prerequisites: Section 01 shared event and ownership contracts.
- Tests: registration, read, download, preview metadata, expiry, MIME/size, tenant/workspace/thread/run isolation, HTML inertness and capability truth.
- Completion predicate: real non-placeholder artifacts can be safely registered and retrieved by authorized owner; private content is not public; capability is accurate.
- Fallback: if no canonical run relationship exists, associate only actual thread/job IDs and leave other identifiers absent.
- Blocker strategy: keep unsupported document viewers unavailable; do not return fake success or arbitrary HTML execution.
