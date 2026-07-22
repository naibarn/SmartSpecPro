# Demonstration & Evidence Reference — Verifiability Rules

This file is the deep-dive companion to Phases D, F, and G in `skill.md`. It
defines the six `demonstration_type` values every shot must classify into,
what counts as assembly evidence, the benefit/problem-solution pivot wording
used when assembly evidence is absent, and the visible-operation exemption
that keeps ordinary feature demos from being mistaken for assembly. TypeScript
never authors this pivot text — it lives here and in `skill.md` only.

## The six demonstration types

Every shot in `shots[]` declares exactly one `demonstration_type`:

1. `finished_product_showcase` — the assembled, ready-to-use product shown
   as-is (hero shots, reveals, overview/summary shots). No operation is being
   performed; the shot exists to establish or reconfirm the product's
   identity and finished state.
2. `usage_demo` — a person (or hands) actively uses/operates a built-in,
   already-functional feature that is visibly operable in the references
   (e.g. reclining, folding, sliding a drawer, pressing a button, adjusting a
   lever). This is normal product operation, not assembly.
3. `feature_closeup` — a close, detail-focused shot on one construction or
   material feature (stitching, hinge, texture, port, finish) without a full
   usage action.
4. `benefit_narration` — the dialogue states a benefit or design intent while
   the frame shows the finished product or its use context; used when a
   feature is real but cannot be staged as a clean visual demo within the
   shot budget, or when assembly evidence is absent and an assembly beat must
   pivot (see below).
5. `problem_solution` — the frame contrasts a relatable situation/problem
   with the product as the practical fix, without inventing an emergency,
   fear, or unsupported claim.
6. `assembly_demo` — assembly, disassembly, exploded-parts view,
   internal-mechanism exposure, or a what's-in-the-box reveal. Gated: see the
   next section.

## Assembly evidence gate

`assembly_demo` is allowed for a shot **only when**
`evidenceProfile.assembly_documented === true`. This flag may be set true only
when at least one of the following evidence types is present (each is
recorded in `evidenceProfile.assembly_evidence[]` with an `evidence_type` of
one of these three, plus a `detail` string grounding it in the actual input):

- `explicit_text_steps` — `product_description` or `product_specs` contains
  explicit assembly/setup/build steps (e.g. numbered steps, a parts list with
  fastener counts, "requires assembly: 4 bolts included").
- `parts_diagram_image` — a `reference_manifest` entry flagged
  `evidence_only` with a role indicating a parts list, exploded diagram, or
  what's-in-the-box packaging shot.
- `user_confirmation` — an explicit confirmation via `confirmed_attributes`
  (e.g. a confirmed key describing assembly steps or component count).

When none of these is present, `assembly_documented` must be `false` and
`assembly_evidence` must be an empty array — never infer assembly evidence
from the product category alone (see `narrative-patterns.md`: furniture
assembly beats default OFF).

Even when `assembly_documented` is true, never depict component counts,
fastener types, or internal frames beyond what the evidence actually shows —
the count and shape of parts in an assembly-demo frame must match the
documented steps or diagram exactly.

## The benefit/problem-solution pivot (when assembly evidence is absent)

When a narrative beat would naturally be an assembly/disassembly/what's-in-
the-box moment but `assembly_documented` is false, pivot that beat to
`benefit_narration` or `problem_solution`, staged over the **finished, fully
assembled** product — the same state shown in the references is the default
posture for that beat. For example, instead of showing the product being put
together, narrate the convenience of its finished form ("ready to use as
soon as it's out of the box" as a design-intent statement, never as a
fabricated assembly-ease claim) while the frame shows the assembled product
in its real-use context. The pivot must never silently invent an assembly
step, a screwdriver, loose parts, or an open box that the evidence does not
support.

## Visible-operation exemption (not assembly)

A feature that is already built into the product and is shown being operated
in the references — a lever, wheel, hinge, folding armrest, sliding drawer,
reclining backrest, telescoping leg — is `usage_demo` or `feature_closeup`,
**not** `assembly_demo`, regardless of `assembly_documented`. The
distinguishing test: assembly is about putting separate parts together or
exposing what is normally hidden inside the product; operation is about using
a feature the product already has, fully built, in its normal end-user state.
When in doubt, prefer the visible-operation classification (`usage_demo`/
`feature_closeup`) over `assembly_demo`, since operation demos carry no
evidence gate and assembly demos do.
