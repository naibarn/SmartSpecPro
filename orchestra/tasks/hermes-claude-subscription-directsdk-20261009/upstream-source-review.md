# Upstream Source Review — Hermes Claude Subscription DirectSDK

Date checked: 2026-10-09. Read-only source review; plugin was not installed or executed.

## Pin and provenance

- Official live Hermes plugin catalog entry `claude-subscription-directsdk` reports version `0.3.3`, full source commit `4bc79c78031d1a042b5d8a7314ceea283db5c5e2`, catalog generated 2026-10-09 00:07 UTC. Catalog entry: [hermes-agent/plugin-catalog/claude-subscription-directsdk.yaml](https://github.com/NousResearch/hermes-agent/blob/main/plugin-catalog/claude-subscription-directsdk.yaml#L233-L263).
- Hermes docs state minimum Hermes `0.21.4`, exact catalog commit installation, and last re-pin Oct 7: [DirectSDK plugin docs](https://hermes-agent.nousresearch.com/docs/plugins/claude-subscription-directsdk#).
- The plugin repository has no GitHub Releases at review time: [releases](https://github.com/NousResearch/hermes-plugin-claude-subscription-directsdk/releases). Treat `0.3.3` as the catalog version plus immutable full-SHA pin, not a tagged upstream release.
- Reviewed code links use the immutable SHA above, including [`directsdk.py`](https://github.com/NousResearch/hermes-plugin-claude-subscription-directsdk/blob/4bc79c78031d1a042b5d8a7314ceea283db5c5e2/directsdk.py), [`admission.py`](https://github.com/NousResearch/hermes-plugin-claude-subscription-directsdk/blob/4bc79c78031d1a042b5d8a7314ceea283db5c5e2/admission.py), and [`directsdk_setup.py`](https://github.com/NousResearch/hermes-plugin-claude-subscription-directsdk/blob/4bc79c78031d1a042b5d8a7314ceea283db5c5e2/directsdk_setup.py).

## Classification

| Topic | Finding | Classification |
|---|---|---|
| CLI auth and subscription boundary | Setup probes `claude auth status` and local CLI plan/model state. Setup code also recognizes `CLAUDE_CODE_OAUTH_TOKEN` as an environment auth route; that is a local secret and must remain on the user's Runner. CLI login does not establish SmartAIHub commercial entitlement or actual charge semantics. | VERIFIED mechanism; UNKNOWN commercial right |
| Model-only invocation | `Client._run` invokes `claude -p` with stream JSON, empty native tools, empty setting sources, strict MCP config, disabled slash commands, `dontAsk`, no session persistence, and one max turn. Hermes tool schemas are carried through an inert MCP/body adapter and returned as model output for host-side handling. | VERIFIED at pinned source |
| Admission | Request-scoped local relay permits one upstream message request per admission; later upstream attempts are denied locally. This is plugin-local behavior, not SmartAIHub's tenant/job admission authority. | VERIFIED at pinned source |
| History | Canonical messages are replayed with special historical user-frame handling. Native signed replay data is preserved only for unchanged projection; transformed history uses canonical text/tools. Arbitrary history and cross-model signed replay are not stable public SDK contracts. | VERIFIED behavior; broader replay parity EXPERIMENTAL |
| Tools and approvals | Native Claude tool execution is disabled in model-only mode. Returned tool suggestions still require SmartAIHub's own policy, validation, approvals and host execution. | VERIFIED plugin behavior; SmartAIHub integration NOT IMPLEMENTED |
| Streaming and cancellation | Text/thinking deltas stream; tool calls are published after validated final event/result. Cancellation aborts relay sockets and kills the process tree; POSIX uses session/process-group kill, Windows uses process group plus `taskkill /T`; temp/relay resources are cleaned and child reaped. | VERIFIED at pinned source; deployment integration NOT IMPLEMENTED |
| Usage/accounting | Plugin returns native token/cache fields and cost estimate equivalent to API list pricing. Docs explicitly say this is not an actual subscription invoice/charge, and interrupted work must not be treated as zero/free. No account-level overage cap is established. | VERIFIED reporting; actual billed amount UNKNOWN |
| Quota, errors, fallback | Native quota/session errors and billing errors normalize to HTTP-like statuses; Hermes owns retry/fallback policy. Conflicting API key/auth-token/base-URL/backend variables are rejected on the normal path. Low-level fixture seam can bypass inherited-env guard. No silent API-key fallback is an appropriate SmartAIHub rule. | VERIFIED plugin mechanics; SmartAIHub fallback policy NOT IMPLEMENTED |
| OS and native versions | Python 3.10+ and Windows/Linux/macOS are documented, with OS-specific process cleanup. Native qualification is narrow (Claude Code 2.1.263); broad platform/version parity remains unproven. | Experimental compatibility surface |
| Upgrade drift | Catalog pin prevents unreviewed branch drift. Model aliases, CLI minimum version, context/replay behavior and signed payloads can drift with Claude Code; pin and re-review upgrades. | VERIFIED risk; long-term compatibility EXPERIMENTAL |
| Paid-subscription live evidence | Docs report a small paid-subscription qualification set, seven calls/one upstream request each, cancellation, host-tool denial, resume and steering cases. Synthetic loopback tests do not prove paid-model behavior, full parity, or production readiness. | EXPERIMENTAL |
| Commercial SaaS and multi-tenant use | Plugin MIT licensing and a user's consumer Pro/Max subscription do not establish resale, shared-account, or third-party multi-tenant SaaS rights. Keep a commercial-entitlement/terms review gate; do not state a blanket prohibition without legal/account authority. | UNKNOWN; hard product gate |

## Acceptance implications

Future SmartAIHub acceptance must prove model-only output deterministically, deny native tool execution, execute tools only through the authorized Runner/host path, preserve approval and tenant/user isolation, bind replay to the exact request/history projection, cancel and reap the whole child process tree, distinguish quota from API billing, and require explicit authorization plus cost disclosure for fallback. Upgrade qualification must be repeated against the exact pinned commit and CLI version. No such SmartAIHub runtime proof was generated by this task.

## Source retrieval limitation

The full commit was verified through the live official catalog API and catalog YAML. A `git ls-remote` retrieval attempt was unavailable because this host lacked `git-remote-https`; no plugin installation or source execution was used. Upstream documentation and immutable source links are the review evidence.
