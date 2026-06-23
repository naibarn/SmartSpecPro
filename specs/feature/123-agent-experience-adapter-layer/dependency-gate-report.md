# Agent Experience Runtype Renderer Dependency Gate Report

Status: installed for gated bridge evaluation; not approved as the default production renderer.

## Evaluated Package

- Package: `@runtypelabs/persona`
- Exact version: `4.4.0`
- License: package metadata reports `MIT`; legal approval is still required before default production renderer adoption.
- Dependency tree/install diff: installed in `@smartspec/agent-experience` only via `npm install --workspace @smartspec/agent-experience @runtypelabs/persona@4.4.0 --ignore-scripts`.
- Bundle impact: isolated esbuild browser bundle of `packages/agent-experience/src/runtypeBridge.ts` with dynamic import produced a 3.1KB bridge entry and approximately 914KB of lazy Runtype chunks raw, approximately 219KB gzip total. This is not an `apps/web` production bundle measurement; it is spike evidence for the external renderer chunk cost.
- CSS/theme isolation and style bleed risk: static package scan found `dist/widget.css` scoped to `[data-persona-root]`, `all: initial` at the widget root, `--persona-*` CSS variables, and `persona-*` utility classes. Browser style-bleed screenshots are still required before default renderer adoption.
- Shadow DOM / DOM ownership behavior: static package scan found `runtime/init.ts` supports a `useShadow` mount path via `host.attachShadow({ mode: "open" })`, then mounts `[data-persona-root]` and styles inside that root. SmartSpec bridge adoption must choose and document the mount mode before any product route uses it.
- Mobile drawer/layout parity: not measured because no isolated Runtype browser demo is wired in this implementation. Required before default renderer adoption.
- Accessibility parity: static package scan found ARIA/role/reduced-motion patterns in package source and `prefers-reduced-motion` media rules in `dist/widget.css`; full keyboard, focus, screen reader, and reduced-motion parity still requires an isolated browser demo before default renderer adoption.
- Private API usage check: repository scan found `@runtypelabs/persona` only in `packages/agent-experience/package.json` and the dynamic `loadRuntypePersonaRenderer()` bridge loader; no core Chat, Agency, Team, approval, artifact, or billing file imports it.
- Supply-chain audit: `npm audit --workspace @smartspec/agent-experience --audit-level=moderate` reported 0 vulnerabilities on 2026-06-22.
- Install verification: `npm ls @runtypelabs/persona --workspace @smartspec/agent-experience` resolves `@runtypelabs/persona@4.4.0`.
- Uninstall/rollback steps: keep `agentExperienceRuntypeRenderer=false`; remove `@runtypelabs/persona` from `packages/agent-experience/package.json`; run `npm install --ignore-scripts`; remove `loadRuntypePersonaRenderer` if the spike is reverted.

## Decision

Keep the SmartSpec renderer and canonical Agent Experience protocol authoritative. `@runtypelabs/persona` is now available to the removable bridge, but runtime use remains guarded by dependency evidence and feature flags.

## Browser Demo Decision

No isolated Runtype browser demo was created in this implementation because the shipped scope is a protocol/package foundation plus a gated dependency bridge, not a product route or renderer replacement. Section 07 browser screenshots are therefore deferred until a future isolated demo or product preview mounts `loadRuntypePersonaRenderer()` behind `agentExperienceRuntypeRenderer`. Before default renderer adoption, that demo must provide mobile 390x844 and desktop 1440x900 screenshots plus keyboard, focus, screen reader, reduced-motion, and style-bleed evidence.
