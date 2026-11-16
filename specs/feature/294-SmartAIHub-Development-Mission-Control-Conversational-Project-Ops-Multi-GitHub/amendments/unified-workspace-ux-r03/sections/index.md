<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm --dir apps/saas-shell test
END_PROJECT_CONFIG -->
<!-- SECTION_MANIFEST
section-01-shell-routing
section-02-task-workbench
section-03-mission-fleet
section-04-validation-handoff
END_MANIFEST -->

# Sections

## Dependency Graph
| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-shell-routing | - | 02, 03 | No |
| section-02-task-workbench | 01 | 04 | No |
| section-03-mission-fleet | 01 | 04 | No |
| section-04-validation-handoff | 02, 03 | - | No |

## Execution Order
1. section-01-shell-routing
2. section-02-task-workbench, section-03-mission-fleet (same screen ownership means integrate sequentially)
3. section-04-validation-handoff

## Section Summaries
- section-01-shell-routing — UXR03-01, UXR03-05: explicit routes and shared responsive shell; preserve Chat.
- section-02-task-workbench — UXR03-02, UXR03-04, UXR03-07: project/task hierarchy and reusable synthetic execution evidence.
- section-03-mission-fleet — UXR03-03, UXR03-04, UXR03-07: fleet grouping, sessions, attention and identity continuity.
- section-04-validation-handoff — UXR03-06, UXR03-08: test/build, viewport captures, spec mapping/gaps/integration plan, handoff and DEV release.
