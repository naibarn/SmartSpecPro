# Section 03 — PR Candidate SHA Binding

**Owned paths:** candidate CI gate workflow and dedicated workflow-contract tests only.

**Prerequisites:** a newly authorized task branch based on PR #944 head `d826f71bde6c995260e7dbb9ae6925aef29b08a9`; never use the original PR branch.

**Deliverable:** PR head, synthetic test merge, merge-group and push source revisions are represented separately; each critical job proves the revision checked out and tested.

**TDD:** synthetic merge SHA differs from PR head and is accepted only with matching checkout evidence; stale, wrong, missing, failed, skipped and duplicate critical checks remain denied.

**Acceptance:** CI baseline failures are reported independently from source-binding failures; no gate is skipped or weakened.

**Risks:** source SHA changes during review invalidate evidence; rebind and rerun required checks.

**Merge readiness:** workflow validation and all required status checks through normal PR protection.
