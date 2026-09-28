# Spec 209 — Revision 6 Repository Convergence Audit

Date: 2026-09-19
Status: Completed
Additional repository/codebase rounds in this revision: 20
Cumulative documented review rounds including Revisions 1–5: 94

The 20 rounds are recorded in
`orchestra/spec-audit-207-209-2026-09-19.md` and cover Specs 207–209 together.
This revision is a repository-alignment audit, not another conceptual feature
expansion.

## Gaps found and patched immediately

1. Current runtime/schema evidence was missing → added Section 3.1.
2. Existing `workflow_*` schema residue could be mistaken for the new canonical
   runtime → marked it migration-input-only until an authorized audit proves
   ownership.
3. Agent runtime selection was ambiguous → made OpenAI Agents API and governed
   LangGraph adapter selection explicit and versioned.
4. Flow import wording could revive retired `/workflows` → restricted imports to
   approved non-retired definitions.
5. Compatibility-shim wording could add new retired callers → added an explicit
   authorized-audit and no-new-caller boundary.

## Baseline decision

Revision 6 supersedes Revision 5 for repository-alignment wording. The
implementation baseline remains partial; Feature 195/196/197 and the approved
OpenAI Agents API/runtime boundaries remain authoritative.
