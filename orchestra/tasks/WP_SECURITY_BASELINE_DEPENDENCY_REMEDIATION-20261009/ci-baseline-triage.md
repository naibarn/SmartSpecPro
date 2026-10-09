# CI failure triage — PR #405

Compared candidate CI run `37918154512` at `41a53ef0cef280da0c0a220229e26ccee461e59d` with canonical control CI run `37914553747` at `a709ec4084243386848785bd276f53445c7d36b8`.

| Job | Candidate evidence | Main control evidence | Classification / separate follow-up |
|---|---|---|---|
| `api_generator` | `npm ci` rejected `api-generator/package-lock.json`: `js-yaml@4.1.1` does not satisfy manifest `^4.3.2`. | Install succeeded; 31 tests ran, then the existing branch/function coverage thresholds failed (76.61% / 57.74%). | Candidate dependency-install regression, fixed in this PR by regenerating only the package lock. Baseline coverage gap remains a separate `WU_API_GENERATOR_COVERAGE_BASELINE`; API Generator owner not identified in repository CODEOWNERS (none found). |
| `smartspecweb` | `npm ci` failed with `EUNSUPPORTEDPROTOCOL`, `workspace:*`. | Same error. | Existing CI install selection defect: `scripts/ci/node_tests.sh` chooses npm when `apps/web/package-lock.json` exists, despite pnpm workspace protocol. Separate `WU_WEB_WORKSPACE_INSTALL_BASELINE`; Web/CI owner not identified. |
| `python` | Pytest collected 4,891 items / 26 collection errors, including removed/absent legacy imports and modules. | Same 26 collection errors and representative missing modules. | Existing Python test/source baseline mismatch. Separate `WU_PYTHON_COLLECTION_BASELINE`; Python backend owner not identified. Do not restore retired systems as a compatibility workaround. |
| `local_ai_runtime` | Target tests fail on missing browser globals (`Storage`, `document`, `HTMLDialogElement`). | Same browser-global failures; this job also reports the pre-existing missing generated Remotion schema. | Existing test-environment/build-order defect. Separate `WU_LOCAL_AI_TEST_ENV_BASELINE`; Local AI test owner not identified. |
| `marketplace_extension` | TypeScript cannot find React/React DOM declarations; JSX types consequently fail. | Same missing declarations. | Existing extension dependency/type configuration defect. Separate `WU_EXTENSION_REACT_TYPES_BASELINE`; extension owner not identified. |
| `turbo_build` | `TS2688: Cannot find type definition file for 'node'` in Remotion executor typecheck. | Same missing Node type definition failure. | Existing workspace type dependency/build defect. Separate `WU_TURBO_NODE_TYPES_BASELINE`; build owner not identified. |
| `desktop_app` | `scripts/ci/node_tests.sh` cannot `pushd` into `apps/desktop`. | Same path does not exist. | Existing stale CI path. Separate `WU_DESKTOP_CI_PATH_BASELINE`; desktop/CI owner not identified. |

Ownership boundary: repository CODEOWNERS was not present and no accountable team/person was established by these CI logs. The proposed work unit names and evidence are recorded for assignment; they are not treated as owned or authorized work. PR #403 owns its MCP fixture/workflow changes only and is not the owner for these seven failures. No baseline CI source/config was changed in PR #405.

## Candidate-only fix verification

- Before: manifest `js-yaml: ^4.3.2`, lock root `^4.1.0`, locked package `4.1.1`; exact CI failed before tests.
- After: package lock root matches `^4.3.2`, resolved package is `4.3.2` with registry integrity metadata.
- `npm ci` in `api-generator/`: passed.
- `npm test -- --runInBand`: passed, 2 suites / 31 tests.
- The CI `test:coverage` gate remains separately subject to its existing baseline thresholds; no threshold was changed.
