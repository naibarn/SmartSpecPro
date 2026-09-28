# Section 09 — Stock SVG symbols and AI CSS/React/Three.js overlays

## Goal

Bring the Worker App's large symbol/overlay toolbox to the Web editor while
keeping SVG, generated code and Three.js effects sanitized, reviewable and
renderable by the same Worker job contract.

## Symbol catalog

Add a versioned catalog with line icons, arrows, callouts, badges, media marks,
shapes and common stock SVGs. Search/filter by category, stroke/fill, aspect
ratio, license and source. Insert creates a typed overlay with source ID,
catalog version, license, sanitized hash and Transform/Keyframe track. Allow
colour, size, rotation, opacity, anchor and stacking controls. Keep a bundled
baseline catalog for offline browsing, paginate/virtualize the large catalog and
allow server-published updates.

Sanitize SVG on import and before persistence: reject scripts, event handlers,
external references, unsafe data URLs, unbounded path/filter complexity and
unsupported animation. Render only the sanitized artifact; preserve original
source separately for audit if policy permits.

## AI code overlays

Add `CodeOverlayPanel.tsx` with a skill-first flow: choose CSS, React or
Three.js, describe the effect, inspect policy/cost, generate a declarative
`OverlayManifest` and preview it before approval. Persist prompt, model,
template/skill version, source hash and approval. CSS properties, DOM nodes,
geometry, materials, cameras, loaders and keyframe tracks are allowlisted.

Render in a sandboxed iframe with strict CSP, no network, bounded DOM/canvas,
time/resource limits and captured errors. Use a separate opaque origin (or
equivalent isolated Worker render origin), strict `postMessage` schema and no
credential-bearing cookies. React/Three.js source is never executed in the main
editor. Remotion receives only the validated manifest and compiled asset.
Invalid manifests, runtime errors, policy rejection, external-reference/SSRF
attempts and missing skill capability stop preview/render with recovery
instructions. Approved manifests include deterministic seed and dependency
versions.

Resolve the selected skill through the existing
`apps/web/server/services/skillCapabilityManifestService.ts` and its manifest
schema. Persist the resolved skill slug/hash and template version in the job
and overlay artifact so a later render cannot silently use a different skill.

## Files and sequence

1. Add catalog/source/license schema and sanitizer with malicious fixtures.
2. Add symbol panel/inspector and overlay insertion using shared Transform/
   Keyframe commands.
3. Add AI code job, manifest validator, sandbox preview and approval/revert.
4. Add Remotion manifest adapter and artifact/QC review.

## UI/UX Contract

### Target User / JTBD

A creator needs many ready-to-use line symbols and safe AI-generated overlays,
with a preview that explains exactly what will be rendered.

### Surface Inventory

Symbols/Stock SVG drawer, search/filter/catalog card, symbol inspector, AI prompt
and result tabs, sandbox preview, console/error panel and approval sheet.

### Component Map

`SymbolCatalogPanel` owns search/catalog; `SymbolInspector` owns style/transform;
`CodeOverlayPanel` owns prompt/result/approval; `OverlaySandbox` owns iframe/CSP
preview; server owns catalog/AI policy; Worker owns manifest render.

### State Matrix

| State | Required behavior |
|---|---|
| catalog loading/empty | show source/version and retry |
| symbol selected/inserted | preview and track placement |
| SVG rejected | identify sanitizer rule; do not insert |
| AI preflight/generating | cost/policy/progress/cancel |
| invalid manifest | field errors and edit/regenerate |
| sandbox runtime error | isolate error; allow revert |
| approved | immutable manifest and render-ready |
| rate limited/no skill | explain capability and retry later |

### Responsive Matrix

| Viewport | Behavior |
|---|---|
| 360x800 | catalog/status; code editing deferred |
| 390x844 | one-column catalog and preview sheet |
| 768x1024 | stacked inspector/sandbox |
| 1024x768 | compact side drawer |
| 1280x800 | catalog, preview and timeline |
| 1440x900 | full catalog, sandbox and inspector |

### Accessibility Acceptance

Catalog cards have names/license/source text, search/filter are keyboardable,
preview iframe has a title, generated errors are announced, approval has a
clear focus path and colour/stroke controls expose values and contrast.

### Copy Contract

Use `Symbols / Stock SVG`, `สัญลักษณ์ลายเส้น`, `แหล่งที่มาและสิทธิ์ใช้งาน`,
`สร้าง Overlay ด้วย AI`, `เลือก CSS / React / Three.js`, `ดูตัวอย่างแบบปลอดภัย`,
`อนุมัติเพื่อใช้ในโปรเจกต์` and `โค้ดนี้ไม่ผ่านการตรวจสอบ`.

### Browser Evidence Required

Browser fixtures must reject malicious SVG and code, show CSP/runtime errors,
render a valid manifest in the sandbox and insert a symbol/overlay into a
timeline. Staging proof must verify Remotion consumes the manifest only.

## Tests and acceptance

- Catalog search/filter/license and insertion metadata.
- Sanitizer rejects scripts, handlers, external references, data exfiltration and
  complexity bombs.
- Manifest/CSS/React/Three.js allowlist, prompt audit, CSP/sandbox/time limits,
  invalid/recovery states and no main-app execution.
- Remotion fixture renders approved manifest and records source/template hashes.

## Risks and stop conditions

Do not execute generated source in the main window or pass raw source/filter text
to Worker. Stop preview/render if sanitizer, CSP or manifest validation cannot
be proven.
