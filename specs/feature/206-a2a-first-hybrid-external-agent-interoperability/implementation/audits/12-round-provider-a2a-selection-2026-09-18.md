# Spec 206 Provider A2A Selection Audit — 12 Rounds

**Date:** 2026-09-18
**Scope:** Provider research and deterministic A2A/native route selection
**Decision:** No provider is A2A-active from product/version metadata alone. All four researched providers remain native-fallback candidates until a live Agent Card, supported binding, health/conformance, trust, credential and task-skill check produces `a2a_eligible`.

## Evidence baseline

| Provider | Current official evidence observed | A2A conclusion | Default route |
|---|---|---|---|
| Claude Code | `v2.1.274`; official CLI documentation describes CLI/SDK/MCP surfaces | A2A Agent Card/server/client contract not publicly documented in reviewed official sources | Spec 200 native |
| OpenAI Codex | Codex CLI `0.155.0`; official release and CLI docs describe CLI/app-server/MCP surfaces | A2A Agent Card/server/client contract not publicly documented in reviewed official sources | Spec 200 native |
| Google Antigravity | Changelog `2.14.0`; download page observed `2.12.2` and CLI `1.2.0` during gradual rollout | A2A support not publicly documented in reviewed official product/SDK docs | Spec 200 native |
| DeepSeek Harness | `dsh-v0.1.6-alpha.1`; official repo documents local harness and stdio JSON-RPC SDK | A2A support not publicly documented in reviewed official repository/SDK docs | Spec 200 native |

“Not publicly documented” is not treated as proof of impossibility. A live,
validated Agent Card is the only route-activation authority.

## Round ledger

| Round | Check | Result / repair |
|---:|---|---|
| 1 | Confirm Spec 206 target and current repository boundary | Kept the work planning-only; no A2A runtime was invented in this change. |
| 2 | Separate A2A agent protocol from MCP tool protocol | Added `agent_interop` and `tool_interop` boundary; MCP/CLI/SDK no longer imply A2A. |
| 3 | Identify Claude Code current official version | Recorded `v2.1.274` from the official release page; route remains native until live A2A verification. |
| 4 | Search Claude Code official docs/releases for A2A | No public A2A contract found in reviewed official material; status is `not_publicly_documented`, not hard `unsupported`. |
| 5 | Identify OpenAI Codex current official version | Recorded Codex CLI `0.155.0` from the official latest release. |
| 6 | Search Codex official docs/releases for A2A | Reviewed CLI/app-server/MCP material; no public A2A contract found; route remains native. |
| 7 | Identify Antigravity current product versions | Recorded changelog `2.14.0`, plus download-page `2.12.2`/CLI `1.2.0` rollout observations rather than pretending one universal version. |
| 8 | Search Antigravity official docs/SDK for A2A | Official SDK/product pages expose MCP and managed REST/gRPC surfaces; no A2A text/contract found. |
| 9 | Identify DeepSeek Harness current version and wire surface | Recorded `dsh-v0.1.6-alpha.1`; official SDK server/client is stdio JSON-RPC, not assumed to be A2A. |
| 10 | Search DeepSeek Harness official repository/SDK for A2A | No A2A contract found; status remains `not_publicly_documented` and native adapter is the default. |
| 11 | Validate activation/fallback policy against ambiguity risk | Added `a2a_required`, `a2a_preferred`, and `native_required`; post-dispatch fallback must reconcile the same task and cannot duplicate execution. |
| 12 | Validate observability and regression coverage | Added capability/eligibility states, source/freshness/health/conformance fields, UI reason codes, and ten contract-test cases to Spec 206. |

## Official evidence links

- [Claude Code releases](https://github.com/anthropics/claude-code/releases)
- [Claude Code CLI reference](https://docs.anthropic.com/en/docs/claude-code/cli-usage)
- [OpenAI Codex latest release](https://github.com/openai/codex/releases/latest)
- [OpenAI Codex CLI documentation](https://developers.openai.com/zh-Hans/docs/codex/cli)
- [Google Antigravity changelog](https://www.antigravity.google/changelog)
- [Google Antigravity download/version page](https://antigravity.google/download)
- [Google Antigravity SDK overview](https://www.antigravity.google/docs/sdk/overview)
- [DeepSeek Harness repository](https://github.com/deepseek-ai/deepseek-harness)
- [DeepSeek Harness releases](https://github.com/deepseek-ai/deepseek-harness/releases)

## Residual implementation gates

This audit does not claim that any provider has been runtime-tested as an A2A
server. Before activating one, implementation work must add the live Agent Card
fetch, trust/SSRF checks, binding conformance probe, credential handling,
capability snapshot persistence, route decision persistence, and duplicate-safe
reconciliation required by Spec 206.
