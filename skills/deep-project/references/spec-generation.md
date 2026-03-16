# Spec File Generation

## Context to Read

Before writing spec files:
- `{initial_file}` - The original requirements
- `{planning_dir}/deep_project_interview.md` - Interview transcript
- `{planning_dir}/project-manifest.md` - Split structure and dependencies

**From setup-session.py output:**
- `split_directories` - Full paths to all split directories
- `splits_needing_specs` - Names of splits that still need spec.md written

Each split directory contains a `spec.md` that captures requirements and context for /deep-plan.

## Writing Guidelines

- **Self-contained:** Each spec should stand alone for /deep-plan
- **Reference don't duplicate:** Point to original requirements file rather than copying large sections
- **Capture decisions:** Include interview answers that shaped this split
- **Note dependencies:** Be explicit about what this split needs from other splits and provides

Remember that these spec files are going to get deep/thorough planning. They need to provide enough context to kick off a deep/thorough planning session and no more.

## Required Sections in spec.md

Every spec.md MUST include these sections to pass the review loop (Step 6.5):

1. **Goal** — Clear, specific outcome statement
2. **Scope** — What IS and IS NOT included
3. **User-Facing Behavior** — What the end user sees/does
4. **Technical Constraints** — Languages, frameworks, existing patterns
5. **Dependencies** — What this split needs from other splits (inputs)
6. **Outputs** — What this split provides to other splits (outputs)
7. **Edge Cases** — At least 3 non-obvious scenarios
8. **Error Handling** — What happens when things fail
9. **Testing Expectations** — What kinds of tests are needed

See [spec-review-loop.md](spec-review-loop.md) for the full review checklist that will be applied after all specs are written.
