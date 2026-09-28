# Spec 209 Revision 9 — Mini App Hub / Vector Catalog / External Dependency Audit

วันที่ตรวจ: 2026-09-19

รอบนี้ตรวจตาม requirements เรื่อง Central Mini App Hub, Marketplace discovery,
register/select/bookmark/pin/remove, vector catalog completeness, external-tool
readiness และการ pack Skill สำหรับ Claude/Codex/Antigravity-style runtimes.
เป็นการแก้ specification เท่านั้น ไม่ได้อ้างว่า codebase มี implementation ครบแล้ว.

SocratiCode MCP ไม่พร้อมใช้งานใน session นี้ จึงใช้ targeted shell discovery และ
exact source reads จาก `Marketplace.tsx`, `SkillBrowser.tsx`, `marketplace.ts`,
`skills.ts`, `runnerNodes.ts`, `vectorProvider.ts`, `vectorize-search.ts`,
`apps/runner-app/src/discovery.rs` และ `apps/runner-app/src/adapters.rs`.

## ผลตรวจ 20 รอบ

| รอบ | Focus | Gap / evidence | Immediate repair |
|---:|---|---|---|
| 1 | Create-to-use flow | Spec had publish-to-Mini-App but no central post-create manager | Added Central Mini App Hub and Created by me/Registered contract |
| 2 | Single ownership | Marketplace, Builder and Assistant could become separate lists | Required one authenticated tenant-scoped Hub |
| 3 | Registered state | No durable user-side registration semantics | Added `REGISTER` and `mini_app_user_library` |
| 4 | Selected state | Select could be confused with install/bookmark | Added context-only `SELECT` and action policy |
| 5 | Bookmark state | Bookmark could be misread as permission | Explicitly made bookmark non-entitling |
| 6 | Frequent use | User would need to search every time | Added Pinned/Frequent and Recently used views |
| 7 | Removal | Remove behavior could delete or confuse publisher/history data | Separated unregister, unpin and unbookmark; preserve history/assets |
| 8 | Existing UI reuse | Existing Marketplace and Skill Browser patterns were not named | Recorded reuse decision and justified new Hub divergence |
| 9 | UI states | Setup/install/indexing/degraded states were incomplete | Added state matrix and actionable copy contract |
| 10 | Responsive/accessibility | Central manager UX lacked viewport/keyboard/focus acceptance | Added mobile/tablet/desktop/a11y/reduced-motion requirements |
| 11 | Vector ownership | Requirement could produce a second vector database | Bound catalog to shared Vector Provider adapters |
| 12 | Catalog identity | Mini App and Skill revisions lacked common index identity | Added catalog type/entity/revision/content hash metadata |
| 13 | Search dimensions | Semantic search facets were not normative | Added hybrid semantic/exact, capability, I/O, tool, language, readiness, cost and permission facets |
| 14 | ACL safety | Vector result leakage was not explicitly blocked | Required tenant/visibility/ACL filtering before metadata return |
| 15 | Index lifecycle | Query success was not coverage proof | Added index projection states, coverage metrics and reconciliation |
| 16 | Failure visibility | Failed/pending catalog records could disappear | Added visible degraded/indexing state and operator status |
| 17 | External disclosure | Listing did not require complete tool/setup disclosure | Added machine-readable manifest and Required to run panel |
| 18 | External Skill packaging | Claude/Codex/Antigravity Skill dependencies could be absent | Added immutable transitive Skill bundle or explicit publisher-managed setup |
| 19 | Rights/secrets | Download rights and secret exclusion were incomplete | Added per-action rights, hash/signature/trust and no-secret bundle contract |
| 20 | Run gate | Missing tool/Skill/auth/Runner could reach run or silently fallback | Added server-authoritative readiness preflight and explicit fallback policy |

## Repairs applied

- Spec header advanced to Revision 9.
- Added normative section `160BM` covering the Central Mini App Hub,
  relationship semantics, UI/UX contract, Vector Provider catalog, index
  completeness, external dependency manifest, Skill bundle packaging,
  rights/install/readiness gates, data contract and acceptance criteria.
- Added `miniapp.hub.*`, `miniapp.dependencies.*`, `miniapp.readiness.check`,
  `catalog.search` and `catalog.index_status` API contracts.
- Added user-library, dependency installation, readiness snapshot, Skill bundle
  artifact and catalog index projection entities without creating another Job,
  queue, Skill Registry or vector database.
- Added Central Hub, catalog coverage and dependency readiness to the Definition
  of Done scenario.
- Updated README and this audit companion; the package manifest must include this
  audit file and the new hashes.

## Codebase compatibility decisions

- Reuse `Marketplace.tsx` lexical/category/card patterns and `SkillBrowser.tsx`
  search/category/pagination patterns for the first Hub implementation.
- Reuse `vectorProvider.ts` / `vectorize-search.ts` provider and tenant namespace
  contract; catalog indexing is a new projection/coverage concern, not a new RAG
  provider.
- Reuse Runner inventory/readiness dimensions from `runnerNodes.ts` and
  `apps/runner-app/src/discovery.rs`; Spec 209 owns presentation and manifest,
  while Feature 197 / Specs 200/206/210 own probing, installation and execution.
- Do not infer production readiness from existing public Skill Marketplace or
  current Runner adapter presence; current code still lacks the unified Mini App
  Hub, catalog coverage projection and external Skill bundle installer.

## Remaining implementation gates

- Implement the authenticated Hub route/API and persistence with tenant/user ACLs.
- Add catalog projection/indexing/reconciliation and prove coverage for eligible
  Skill and Mini App revisions using the configured provider.
- Implement rights-aware immutable Skill bundle resolution, package verification,
  atomic install/rollback and Runner-specific readiness probes.
- Add browser evidence for mobile 390x844, tablet 768x1024 and desktop 1440x900.

No repository-wide TypeScript typecheck was run because this revision changes
documentation only and `AGENTS.md` prohibits that command unless explicitly
requested.
