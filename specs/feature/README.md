# Feature Specs Map

Last updated: 2026-04-10

- **001-workflow-scripts**: local workflow engine (`.smartspec/ss_autopilot`) used by Desktop (004) and tests (008)
- **002-auth-generator**: generator/template (CLI) used optionally by Web server (003) or Python backend (007)
- **003-smartspec-website**: full-stack web app in `SmartSpecWeb/` (React/Vite + Node/Express + tRPC + Drizzle)
- **004-desktop-app**: desktop (Tauri+React) runs workflows via python bridge and calls python backend (007)
- **005-api-generator**: generator CLI used primarily by Web server (003), optionally by 007/001
- **006-docker**: run/deploy stack for 003 (and optionally 007)
- **007-python-backend**: tooling/local backend for desktop and optional integration
- **008-tests-and-validators**: tests for 001 + validators fixtures
- **059-external-worker-provider-framework**: SmartSpec Desktop worker runtime with ZeroClaw sidecar, OpenClaw/NemoClaw worker pools, and tool-to-worker promotion
- **060-social-video-platform-expansion**: TikTok / YouTube / YouTube Shorts background publishing and provider expansion
- **061-upload-post-universal-gateway**: Upload-Post API integration as universal social gateway — user-configurable API key, 10+ platform cross-posting, JWT social account linking, scheduling/queue, alongside native providers
- **062-i18n-dual-language-system**: Dual-language i18n with i18next — English always loaded as fallback, one user-selected language (th first), namespace-based lazy loading via Vite, replaces existing custom i18n
- **063-MediaStudioContentComposer**: Media Studio article composer and publish router — topic-to-publish flow with stable library assets, role-based destination gating, and platform-first social routing
- **066-beam-billing-invoice-phase1**: Beam-first billing, invoice, tax, document, reconciliation, and overdue-downgrade foundation for SmartSpecPro web billing
- **068-billing-phase2-cards-autorenew**: saved cards, auto-renew subscription charging, retry/dunning policy, and customer/admin payment-method management on top of Feature 066
- **071-openclaw-external-runtime-integration**: OpenClaw worker registration, worker/job/artifact control plane, team binding, capability routing, and fleet admin visibility as the first canonical external runtime extension after Feature 059
- **072-claw-worker-platform-access**: delegated worker gateway sessions, runtime-aware Bound Worker expansion, worker-driven platform automation, and credit-correct API/MCP access beyond the control-plane foundation from Feature 071
- **074-claw-worker-mcp-platform-completion**: canonical `/v1/mcp` completion for delegated workers, truthful MCP tool discovery, high-value tool parity across platform families, and consolidation of legacy MCP implementations into one budgeted and secure execution model
- **075-unified-web-desktop-agent-platform**: canonical SmartAIHub Desktop Host architecture with one trust, package, device, and runtime-label model across web and desktop surfaces
- **077-distributed-worker-fabric-completion**: runtime-generalized worker fabric completion across SmartSpec Desktop + ZeroClaw managed workers, local media/file job classes, and truthful NemoClaw/HiClaw runtime semantics on top of the OpenClaw feature chain
- **078-private-personal-finance-ocr-rag**: owner-isolated personal finance workspace with draft-confirm transaction capture, OCR evidence ingestion, and project-locked finance RAG
- **079-autonomous-work-transformation-platform**: workpack-centric product layer that converts messy business routines into reusable, evaluable, and promotable automation packs
- **080-autonomous-team-monitor-and-persistent-role-agents**: persistent role agents, department-grade routines, and an AI operations control room built on top of workpacks
- **081-hermes-agent-runtime-gateway-and-channel-interop**: Hermes Agent as a bring-your-own external runtime via a SmartSpecPro bridge, staged registration-to-dispatch rollout, delegated HTTP/MCP access, owner-bound bound-worker flows, audited remote-endpoint exceptions, and gated channel-companion interoperability without changing the Desktop Host core runtime model
- **082-work-os-case-ledger-and-operating-queues**: first-class business work objects, queue ownership, SLA tracking, and case-bound approvals and exceptions as the Work OS layer above runs and chat
- **083-agent-registry-and-organization-model**: governed registry for planner, reviewer, supervisor, connector, and role-agent identities with versioning, rollout, tool scope, memory scope, and budget policy
- **084-stateful-handoff-and-durable-run-ledger**: first-class handoff semantics, durable execution ledger, checkpoint-aware replay, and resumable state across human and agent boundaries
- **085-autonomy-ladder-and-hitl-control-plane**: platform-wide autonomy levels, approval taxonomy, downgrade rules, and HITL control surfaces across queues, workpacks, and role routines
- **086-agent-policy-guardrails-and-action-mesh**: unified action registry with pre/post guardrails, typed tool contracts, risk scoring, approval binding, and governed connector execution
- **087-enterprise-context-fabric-and-governed-memory**: governed context assembly, scoped memory layers, trust and freshness scoring, and explainable retrieval for enterprise agent work
- **088-agentops-tracing-evaluation-and-release-gates**: end-to-end tracing, replay, shadow/canary evaluation, business KPI measurement, and autonomy release gates
- **089-workforce-exchange-and-installable-operations-packs**: marketplace evolution from skills to installable workpacks, role blueprints, policy packs, and benchmark-backed workforce bundles
- **090-enterprise-readiness-autonomy-economics-and-agent-dev-platform**: enterprise identity and evidence controls, workforce ROI metrics, internal agent SDK standards, and rollout/adoption enablement
