# Skill Slug Contract Repair

## Goal

Make SmartSpecPro skill references resolve deterministically without rewriting
immutable credit or audit history. Runtime skills use canonical registry slugs;
legacy aliases, workflow identifiers, and artifact namespaces are handled by
their own contracts.

## Evidence and scope

The local audit found:

- `image_prompt_engineer` is the registered canonical skill, while
  `create-image-prompt` is still accepted by runtime code and appears in three
  historical credit transactions.
- `marketplace-auto-review-director` and
  `marketplace-auto-review-verifier` are persisted planner/verifier role IDs;
  the registered runtime skills are `media-production-storyboard-planner` and
  `media-production-plan-verifier`.
- `presentation-preview-cache` is an artifact-cache label stored in
  `content_artifacts`, not an executable skill.
- `auto-draft-presentation` is a scheduler workflow identifier, not an
  executable skill.
- There are historical `credit_transactions` rows with `sourceType = skill` and
  no `skillSlug`; current structured-LLM billing must classify those requests as
  `chat` unless a real skill slug is present.
- Four skill manifest categories are not recognized by the parser:
  `quality_control`, `video_prompting`, `story_planning`, and `video_prompt_qa`.

The repair covers runtime resolution, new writes, billing diagnostics, skill
metadata parsing, and regression auditing. It does not mutate historical
credit transactions, audit events, task runs, or artifact rows.

## Design

### 1. Canonical slug and legacy aliases

Extend the shared skill slug resolver with these compatibility mappings:

| Legacy or role identifier | Canonical registry slug | Use |
| --- | --- | --- |
| `create-image-prompt` | `image_prompt_engineer` | legacy runtime and billing references |
| `marketplace-auto-review-director` | `media-production-storyboard-planner` | historical planner role references |
| `marketplace-auto-review-verifier` | `media-production-plan-verifier` | historical verifier role references |
| `vertical-drama-season-critique` | `vertical-drama-season-dramaturgy-critic` | historical Vertical Drama rename |

All registry lookups and skill settlement already pass through or can reuse this
resolver. New Marketplace plan records will write canonical IDs. Existing values
remain readable through the same resolver.

Billing diagnostics will use the same alias set when joining persisted
transactions to `skills`, so historical legacy rows are not reported as unknown
skills.

### 2. Workflow and artifact namespaces

Do not register non-executable identifiers as fake skills.

- Keep `auto-draft-presentation` as a workflow ID and make its message/schedule
  usage explicit in code and tests.
- Keep `presentation-preview-cache` as an artifact namespace. Add a typed
  namespace predicate/helper for content-artifact ownership and exclude it from
  executable-skill audits.
- Keep synthetic diagnostics such as `debug-evidence-gate` out of executable
  skill resolution.
- Treat historical team/provider labels such as `team-discussion-assistant` and
  `agency-swarm` as non-executable references.

This preserves the existing data model in this repair while making audit rules
understand the distinction instead of treating every string in a field named
`skillSlug` as a runtime skill invocation.

### 3. Metadata category normalization

Add explicit parser mappings for the four supported manifest categories to the
existing database enum, avoiding a schema migration in this repair:

| Manifest category | Normalized database category | Compatibility rationale |
| --- | --- | --- |
| `quality_control` | `product_review` | review/quality judgment workflow |
| `video_prompting` | `video_prompt_generation` | creates bounded video prompts |
| `story_planning` | `article_generation` | produces structured narrative text |
| `video_prompt_qa` | `video_prompt_generation` | evaluates video prompt candidates |

The parser, skill-management router, and repository importer use the same
mapping so folder sync and admin/import paths do not disagree.

### 4. Regression audit

Add focused tests for:

- every slug alias resolving to its canonical registry skill;
- skill settlement and diagnostics resolving legacy `create-image-prompt`;
- Marketplace writers emitting canonical planner/verifier IDs;
- artifact/workflow identifiers not being classified as executable skills;
- all four category values parsing without falling back to `other`;
- a production-reference audit that reports only genuine unknown executable
  slugs.

## Failure behavior

- Missing canonical runtime skills fail closed with the existing not-found or
  billing error.
- Legacy aliases remain accepted and are normalized before lookup/settlement.
- Unknown artifact/workflow identifiers are reported by their namespace-specific
  audit, not silently treated as executable skills.
- No historical ledger row is rewritten as part of this change.

## Operational and migration notes

This repair should require code and test changes but no database migration. It
also updates the checked-in compiled structured-LLM adapter so a stale runtime
entry point cannot create new skill charges without a slug. If a
later release chooses to rename database columns for stronger namespace
separation, that must be a separate migration with backup, dry-run, counts, and
rollback evidence.

Production deployment, migration application, and browser smoke proof are
outside this local implementation pass.

## Acceptance criteria

1. `create-image-prompt` resolves to `image_prompt_engineer` everywhere runtime
   lookup or skill billing is involved.
2. New Marketplace plan records contain registered canonical planner/verifier
   slugs; old records remain readable.
3. Artifact-cache and workflow labels are not falsely reported as missing
   executable skills.
4. The four category metadata cases pass the built-in metadata test.
5. Focused tests and the post-change local reference audit pass.
