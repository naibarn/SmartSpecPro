<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace apps/worker-app run typecheck
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-pure-matcher
section-02-server-vision-adapter
section-03-worker-command
section-04-preview-ui
section-05-project-apply-undo
section-06-verification-release
END_MANIFEST -->

# Implementation Sections Index

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-pure-matcher | - | 04, 05 | Yes |
| section-02-server-vision-adapter | - | 03, 04 | Yes |
| section-03-worker-command | 02 | 04 | No |
| section-04-preview-ui | 01, 03 | 05 | No |
| section-05-project-apply-undo | 01, 04 | 06 | No |
| section-06-verification-release | 01-05 | - | No |

## Execution Order

1. Sections 01 and 02
2. Section 03
3. Section 04
4. Section 05
5. Section 06
