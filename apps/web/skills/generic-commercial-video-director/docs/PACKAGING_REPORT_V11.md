# Packaging Report — Generic Commercial Video Director v11

Date: 2026-09-01

## Package contents

- Complete v10 provider/runtime-independent skill baseline migrated to v11.
- Full Thai user guide at `docs/USER_GUIDE_TH.md`.
- OpenAI Agents SDK bounded runtime reference under `src/smartaihub_video_director/`.
- Provider profiles/adapters/tests for MiniMax H3, Grok Imagine Video 1.5, Wan 3.0, FLUX 3, Seedance 2.0/2.5, LTX 2.5, Omni and existing generic providers.
- Additional canonical stage schemas for Agent-runtime stages that previously existed only as logical/documented stages.
- v11 gap review at `docs/GAP_REVIEW_V11_12_ROUNDS.md`.

## Regression gates run before packaging

```text
PASS: v11 schemas, 37 input fixtures, 16 provider profiles,
      4 generic stage fixtures, 3 promotion/place fixtures,
      4 H3 fixtures, 3 Grok fixtures, 3 Wan fixtures,
      3 FLUX fixtures, 3 Seedance fixtures, 3 LTX fixtures,
      sample output, Omni/H3/provider temporal solvers

PASS: 18 MiniMax H3 integration regression checks
PASS: 22 Grok Imagine Video 1.5 integration regression checks
PASS: 17 Wan 3.0 integration regression checks
PASS: 18 FLUX 3 integration regression checks
PASS: 22 Seedance 2.0/2.5 integration regression checks
PASS: 29 LTX 2.5 integration regression checks
PASS: 8 v11 Agent runtime regression checks
PASS: Python compileall for adapters/src/tests
```

## OpenAI Agents SDK boundary

Reference runtime dependency:

```text
openai-agents >=0.22.0,<0.23
```

The package tests do not require a live OpenAI API key. The runtime imports the Agents SDK lazily; a deployment that executes Agent reasoning must install the declared dependency and configure an explicit model.

SmartAIHub Core remains authoritative for canonical state, tenant/asset authorization, approvals, credits, idempotency, paid provider submission and publishing.

## Release invariant

A packaged ZIP is considered valid only after it is reopened/extracted and the validation/regression suite passes from the extracted copy.
