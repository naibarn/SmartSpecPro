# Feature Specs Map

Last updated: 2026-04-07

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
