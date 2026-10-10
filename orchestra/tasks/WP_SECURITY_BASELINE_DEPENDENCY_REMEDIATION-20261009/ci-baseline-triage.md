# CI failure triage — PR #405

Compared candidate CI run `37918154512` at `41a53ef0cef280da0c0a220229e26ccee461e59d` with canonical control CI run `37914553747` at `a709ec4084243386848785bd276f53445c7d36b8`.

| Job | Candidate evidence | Main control evidence | Classification / separate follow-up |
|---|---|---|---|
| `api_generator` | `npm ci` rejected `api-generator/package-lock.json`: `js-yaml@4.1.1` does not satisfy manifest `^4.3.2`. | Install succeeded; 31 tests ran, then the existing branch/function coverage thresholds failed (76.61% / 57.74%). | Candidate dependency-install regression, fixed in this PR by regenerating only the package lock. Baseline coverage gap remains a separate `WU_API_GENERATOR_COVERAGE_BASELINE`; API Generator owner not identified in repository CODEOWNERS (none found). |
| `smartspecweb` | `npm ci` failed with `EUNSUPPORTEDPROTOCOL`, `workspace:*`. | Same error. | Existing CI install selection defect: `scripts/ci/node_tests.sh` chooses npm when `apps/web/package-lock.json` exists, despite pnpm workspace protocol. Separate `WU_WEB_WORKSPACE_INSTALL_BASELINE`; Web/CI owner not identified. |
| `python` | Pytest collected 4,891 items / 26 collection errors, including removed/absent legacy imports and modules. | Same 26 collection errors and representative missing modules. | Existing Python test/source baseline mismatch. Separate `WU_PYTHON_COLLECTION_BASELINE`; Python backend owner not identified. Do not restore retired systems as a compatibility workaround. |
| `local_ai_runtime` | Target tests fail on missing browser globals (`Storage`, `document`, `HTMLDialogElement`) and ENOENT for `apps/web/skills/parenting-article-writer/SKILL.md` and `apps/web/client/src/locales/en/agency.json`. | Same browser-global failures and the same two ENOENT paths; main also reports the pre-existing missing generated Remotion schema. | Existing test-environment/fixture/build-order defects. Separate `WU_LOCAL_AI_TEST_ENV_BASELINE`; Local AI test owner not identified. Do not restore the retired Agency system/locale as a workaround. |
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

## Exact pair confirmation on refreshed canonical

- Main run `37924816780` at `19b5a890b41b95172bcd97a12fcccaa32d9984af` and candidate run `37926913394` at `f2100cef9c99cead06165e0da6640ff1b07f0a2c` have the same seven failed job outcomes and signatures. `api_generator` on both completes install and 31 tests, then fails the same baseline coverage thresholds. `local_ai_runtime` on both reports the same browser globals and missing fixture paths above.
- Candidate `37926913394` confirms no `npm ci` lock mismatch. Its `python`, extension, workspace install, turbo types, and desktop path failures match main. Thus the only candidate-specific regression found in this comparison was the api-generator package-lock mismatch, repaired and retested locally.

## Latest canonical pair — PR #413 refresh

- Main control `37929463981` at `481a9f665dfb9b06de0d78ad44580cc0cb9bfa48` and candidate `37931745952` at `b8b82efa9ac63fb713f326ac88c10510bb390f8b` completed with the same seven failed jobs/signatures. `api_generator` passed install and 31 tests on both before the same coverage thresholds failed. `local_ai_runtime` on both had missing browser globals, missing `parenting-article-writer/SKILL.md` and retired `agency.json` fixture paths, and the same runtime/database fixture failures. Candidate `smartspecweb`, Python collection, extension React types, turbo Node types, and desktop path also match main.
- Compatibility run `37930797992` on the candidate passed 18 files / 238 tests; full audit remains Moderate-only fail.
