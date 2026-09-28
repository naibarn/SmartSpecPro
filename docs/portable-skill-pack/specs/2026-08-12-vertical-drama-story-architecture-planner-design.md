# Vertical Drama Story Architecture Planner

## Objective

Create a bounded, inspectable story foundation before the existing preset
synthesizer writes the creator-readable draft. The foundation must prevent a
large premise from collapsing into only its opening hook, especially when the
story has a professional or multi-year destination.

## Pipeline

```text
creator input
  -> Story Architecture Planner skill
  -> foundation gate (planner + at most 2 repair calls)
  -> preset synthesizer
  -> Draft QC (existing bounded improvement loop)
  -> creator confirmation
  -> Story Bible / full story generation
```

The planner owns architecture, not prose polish. The synthesizer owns the
readable title, logline, synopsis, characters, and season presentation, but it
must derive those fields from the approved architecture.

## Additive contract

`storyContract` is optional for legacy drafts and required for newly generated
drafts. It contains:

- audience promise and core question;
- protagonist starting state, goal, internal need, long-term destination,
  transformation stages, and end state;
- repeatable primary engine and escalation ladder;
- required arc bundles with turning points, cost, payoff, and end state;
- a real-world failure model for science, engineering, and innovation plots;
- separate season endpoint and long-term endpoint, plus final image and meaning;
- promise-to-payoff mappings and story guardrails.

The server re-evaluates the contract at create time when present. Missing or
invalid contracts block the new path before QC/create; manual and legacy paths
without the field remain compatible.

## Quality and cost controls

- one architecture planning call plus at most two repair calls;
- only the best contract is retained; repair stops immediately when the
  foundation gate passes;
- planner usage is included in the synthesis credit estimate;
- UI shows the contract and blocks QC until the foundation is complete;
- the contract is forwarded unchanged to standard and premium Story Bible
  prompts as an authoritative constraint.

## Acceptance criteria

1. A premise such as `Proof of Us` produces distinct academic, romance,
   underdog, and professional-innovation arcs when those promises are present.
2. The long-term structural-engineering destination is not replaced by a
   campus-only ending.
3. A missing destination, transformation, engine, required arc, or payoff is
   visible as a blocking diagnostic and cannot start Draft QC.
4. A valid contract is visible in the draft review UI and survives Apply,
   create, standard generation, premium generation, and resume paths.
5. Drafts and series created before this feature remain readable and usable.
