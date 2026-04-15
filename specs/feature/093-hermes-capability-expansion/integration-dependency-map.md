# Hermes / Work OS Dependency Map

## Purpose

This page summarizes how Feature 081, Feature 082, and Feature 093 fit together so the team can see where Hermes stops and Work OS begins.

## One-line summary

- Feature 081 connects Hermes as an external runtime.
- Feature 082 defines the canonical Work OS.
- Feature 093 improves Hermes UX and capability handling.
- Future Hermes-to-Work-OS integration should use Feature 082 as the work-state source of truth.

## Layer Map

| Layer | Responsibility | Notes |
|---|---|---|
| Feature 081 | Hermes bridge, runtime connectivity, delegated external execution | Gives Hermes a supported connection into SmartSpecPro |
| Feature 082 | Canonical requests, cases, tasks, assignments, approvals, exceptions, outcomes, queues | Owns business work state and must stay authoritative |
| Feature 093 | Persona UX, channel UX, opt-in memory sync, task modes, progress visibility | Makes Hermes usable without changing the work model |
| Section 06 of Feature 093 | Future Hermes-to-Work-OS integration slice | Lets Hermes create or update Work OS records through Feature 082 APIs |

## Recommended Flow

1. User starts with Hermes.
2. Hermes interprets intent and, if relevant, proposes a work action.
3. If the action is Work OS related, Hermes calls Feature 082 APIs.
4. Feature 082 creates or updates the canonical work item.
5. Hermes reflects the resulting status back in plain language.

## Hard Boundaries

- Hermes must not maintain a parallel queue, case, approval, or outcome store.
- Hermes must not infer ownership when the target is ambiguous.
- Unsafe or unclear work targets must route to triage.
- Any work mutation must preserve tenant isolation and actor attribution.

## Practical Decision Rule

- Use Feature 093 when the problem is about Hermes usability or capability presentation.
- Use Feature 082 when the problem is about business work state, queue ownership, SLA, approval, or outcome.
- Use both when Hermes is the front-end assistant for Work OS actions.

