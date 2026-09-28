# Spec 209 Amendment — Typed Workflow Node Platform v1

สถานะ: Planning baseline สำหรับการยกระดับ Workflow Studio จาก graph editor ที่มี
metadata ไปเป็นระบบสร้างและรัน workflow ได้จริง

วันที่: 2026-09-19

## 1. เป้าหมายและหลักการตัดสินใจ

Workflow Studio ต้องรองรับการสร้าง workflow มาตรฐานสำหรับงาน AI, เอกสาร,
ข้อมูล, automation, media และ human-in-the-loop โดยผู้ใช้เลือก node จาก
catalog แล้วตั้งค่าผ่าน form ที่อ่านเข้าใจง่าย ไม่ต้องเขียน JSON เป็นหลัก
และสามารถลากเส้น/แตกแขนง/เรียก subflow/ทดสอบ/รัน/ตรวจ output ได้จริง

ข้อกำหนดที่ต้องถือเป็น acceptance source:

1. หน้าตาและลำดับการใช้งานต้องยึด mockup Spec 209 ที่แนบ: header และ tabs
   Build/Test/Runs/Analytics/Versions, canvas กลาง, node palette ด้านล่าง,
   inspector ด้านขวา และ run/debug drawer ด้านล่าง ห้ามสร้างหน้าจอใหม่ที่ทำให้
   workflow authoring กระจัดกระจาย
2. `nodeType` เป็น semantic identity; `kind` เป็นเพียง rendering family และ
   `capability` เป็น runtime adapter ที่ระบบตรวจสอบได้ ห้ามใช้ชื่อ node เป็น
   capability แบบหลวม ๆ
3. ทุก node ต้องประกาศ input ports, output ports, config schema, UI schema,
   binding policy, runtime capability, error policy และ output preview policy
   ใน registry เดียวกัน
4. ทุกการรันต้องผ่าน canonical `worker_jobs` + outbox/control-plane ที่มีอยู่
   ห้ามสร้าง queue/runtime/route แบบใหม่ และห้ามเรียก Agency, legacy
   `/workflows`, workpacks หรือ OpenSandbox/Docker/OpenSandbox dispatch
5. Provider, skill, MCP, Runner, media และ economic authority ยังเป็นเจ้าของ
   domain เดิม; Workflow Studio เป็น authoring/orchestration product layer
   และส่ง capability request ไปยัง owner ผ่าน adapter contract
6. AI Draft เป็นตัวช่วยสร้าง graph ที่ typed และ deterministic fallback ได้
   ไม่ใช่ปุ่มเปลี่ยนข้อความหรือสร้าง input→execute→output แบบเดียวทุกครั้ง
7. การแสดงว่า node พร้อมใช้งานต้องแยก `ready`, `configuration_required`,
   `provider_unavailable`, `capability_not_enabled` และ `policy_blocked` ให้เห็น
   ตรงกับ runtime admission

## 2. Use-case matrix ที่ต้องครอบคลุม

| Use case | ตัวอย่าง workflow | กลุ่ม node หลัก |
|---|---|---|
| Document intelligence | upload PDF → OCR/extract → classify → summarize → approve → export | Input, Document, AI, Logic, Output |
| Knowledge/RAG | form question → query Library/vector → rerank → LLM answer → citations | Data, Search, LLM, Output |
| Content factory | brief → prompt/LLM → image/video/audio generation → compose → preview | AI, Media, Artifact |
| Automation/API | webhook/form → condition → HTTP/MCP tool → transform → notify | Trigger, Logic, Tool, Data |
| Human-in-the-loop | generate draft → approval → reject branch/revise → publish | AI, Approval, Branch, Artifact |
| Data pipeline | library items → map/filter → join → transform → database/export | Data, Collection, Tool, Output |
| Multi-step agent | goal → planner/agent → skill/tool calls → approval → final report | Agent, Skill, Tool, Approval |
| Browser/computer use | instruction → browser session → preview/commit action → evidence artifact | Computer Use, Approval, Evidence |
| Reusable product | marketplace app → input form → subflow → result/artifacts | Subflow, App, Input, Output |
| Scheduled/interruptible run | schedule/webhook → checkpoint → partial run → resume/retry/cancel | Trigger, Runtime, Recovery |

## 3. Canonical type system

Port types are structural and must be checked at connect/admission time. `any`
is allowed only when a node explicitly opts into dynamic values; it must not be
used as the default for every preset.

Primitive types: `string`, `number`, `integer`, `boolean`, `object`, `array`,
`json`, `date-time`, `enum`.

Domain types: `file`, `file[]`, `image`, `audio`, `video`, `artifact`,
`artifact[]`, `document`, `document[]`, `library-item`, `library-item[]`,
`search-result[]`, `citation[]`, `message`, `chat-context`, `form-data`,
`approval-decision`, `browser-session`, `browser-evidence`, `skill-result`,
`tool-result`, `llm-response`, `workflow-input`, `workflow-output`.

Every port has `{ name, type, required, description, multiple?, schemaRef? }`.
Edge records source/target port IDs and optional branch label. Dynamic object
ports carry a JSON Schema reference in the semantic definition; the editor may
render fields from the schema but must preserve unknown fields when safe.

## 4. Registry contract

The registry is the only source for palette, node rendering, inspector forms,
validation, AI compiler hints, readiness checks and runtime dispatch.

Required fields for every `NodeDefinition`:

```text
id, version, label, description, category, icon, kind, nodeType
inputs[], outputs[], configSchema, uiSchema
runtime: { capability, adapter, executionClass, supportsPartialRun,
           supportsRetry, supportsCancel, supportsResume }
bindings: { allowedSources[], templateSyntax, secretPolicy }
validation: { requiredConfig[], admissionChecks[], errors[] }
preview: { mode, fields[], artifactKinds[] }
execution: { routePolicy, protocol, runtimeTarget, runtimeProfile,
             providerRef, capabilityRequirements, workspaceBinding,
             resourcePolicy, approvalPolicy, economicPolicy,
             verificationProfile, retryPolicy, timeoutPolicy }
```

`configSchema` describes values. `uiSchema` describes field order, grouping,
labels, control type, help text, visibility conditions and examples. Existing
skill `input.json` and `ui.json` (plus compatibility with `input.schema.json`
and `ui.schema.json`) are mapped into this contract without flattening away
the original schema.

For execution-capable entries, `execution` is a policy request, not a client
authority. The server resolves it against the Capability/Runner Registry,
Cloudflare Container runtime profiles, A2A Agent Card/conformance, ACP/Gas City
or Orca adapters, browser/CUA policy, workspace authority, Economic Control
Plane and verification profiles. The resolved snapshot is pinned to the run;
transient provider/session/Runner/browser IDs remain run state only.

The approved cross-spec enum values are defined centrally: route policy includes
`native_preferred`, `native_required`, `a2a_required`, `a2a_preferred`,
`orca_preferred`, and `acp_preferred`; runtime targets are
`CLOUD_SHARED`, `CLOUD_JOB_ISOLATED`, `CLOUD_SESSION_ISOLATED`, `SANDBOX`,
`LOCAL`, and `EXTERNAL_PROVIDER_NO_CONTAINER`; runtime profiles are
`media-utils-runtime`, `video-render-runtime`, `remotion-render-runtime`,
`document-runtime`, `hermes-runtime`, `code-sandbox-runtime`, and
`cpu-ml-runtime`. `SANDBOX` here means the approved Spec 204 runtime target,
not the retired OpenSandbox system.

## 5. Complete node catalog v1

The following catalog is the minimum standard baseline. Nodes may be implemented
in waves, but their contracts must be defined together before implementation.

### 5.1 Trigger and input nodes

| nodeType | Purpose | Inputs | Outputs | Required settings |
|---|---|---|---|---|
| `manual-input` | Start from Run form | none | `workflow-input` | fields, required/default/validation, upload limits |
| `form-input` | Rich user form in Mini App | none | `form-data` | field groups, types, labels, validation, conditional fields |
| `webhook-trigger` | Start from signed HTTP event | request metadata | `object`, `headers` | method/path, signature secret ref, schema, replay policy |
| `schedule-trigger` | Start on schedule | schedule context | `date-time`, `object` | timezone, cron/interval, enable window, idempotency key |
| `chat-trigger` | Start from conversation message | `message`, `chat-context` | `string`, `chat-context` | channel, mention rule, conversation binding |
| `library-input` | Select Library assets/items | filters/query | `library-item[]` | tenant scope, collection, tags, media/document filter |
| `file-input` | Receive managed file(s) | upload/form binding | `file` or `file[]` | MIME/size/count, storage scope, virus/QC policy |
| `project-input` | Read current project/episode/editor state | project reference | `object` | project selector, allowed fields, snapshot policy |
| `previous-run-input` | Resume from a prior run/checkpoint | run/checkpoint ref | `workflow-output`, artifacts | same-version rule, input fingerprint rule |

### 5.2 Data and document nodes

| nodeType | Purpose | Inputs | Outputs | Required settings |
|---|---|---|---|---|
| `document-parser` | Parse PDF/DOCX/HTML/text | `file`/`document` | `document` | parser mode, encoding, page range, failure policy |
| `ocr` | Extract text from image/PDF | `file`/`image` | `document` | language, layout mode, confidence threshold |
| `document-extractor` | Extract schema-shaped fields | `document` | `object` | output JSON Schema, extraction prompt, citations |
| `document-classifier` | Classify document | `document` | `enum`/`object` | labels, confidence threshold, fallback label |
| `chunker` | Split text for retrieval | `document`/`string` | `document[]` | chunk size, overlap, separators, metadata mapping |
| `structured-parser` | Parse LLM/tool text to JSON | `string`/`llm-response` | `object` | JSON Schema, strictness, repair policy |
| `data-transform` | Map/pick/merge/rename values | `any`/`object` | `any`/`object` | operation, field mappings, expression/binding list |
| `filter` | Keep items matching predicate | `array` | `array`, `array` | predicate, empty behavior |
| `map` | Apply child node to every item | `array` | `array` | item binding, concurrency, error strategy |
| `reduce` | Aggregate collection | `array` | `any` | accumulator schema, operation, initial value |
| `join` | Join two data streams | `array`, `array` | `array` | key paths, join type, collision policy |
| `split` | Split object/collection | `any` | named ports | path, output names, missing policy |
| `merge` | Merge branch values | multiple `any` | `object`/`array` | precedence, wait-for-all/first, conflict policy |

### 5.3 Search, memory and system-data nodes

| nodeType | Purpose | Inputs | Outputs | Required settings |
|---|---|---|---|---|
| `library-search` | Search tenant Library | query/filter | `search-result[]` | query binding, collection, topK, tenant scope |
| `vector-search` | Semantic retrieval | embedding/query | `search-result[]` | index/provider, topK, filters, score threshold |
| `rerank` | Improve retrieval ordering | `search-result[]`, query | `search-result[]` | reranker, topK, score policy |
| `citation-builder` | Build traceable citations | result/document | `citation[]` | source fields, dedupe, display format |
| `embedding` | Create embeddings | `string`/`document[]` | `object`/vector ref | provider/model, batching, privacy policy |
| `tenant-context` | Read safe tenant context | none | `object` | explicit allowlisted fields only |
| `user-context` | Read current user profile | none | `object` | explicit fields, PII policy |
| `project-context` | Read project/series/editor context | project ref | `object` | domain, fields, revision consistency |
| `config-value` | Read non-secret managed config | config key | typed value | allowlisted key, fallback |
| `secret-reference` | Pass secret by reference only | none | secret ref | secret name, scope; never expose value to canvas/logs |

### 5.4 AI and agent nodes

| nodeType | Purpose | Inputs | Outputs | Required settings |
|---|---|---|---|---|
| `llm-prompt` | Execute one prompt | any bindings | `llm-response`/`string` | model, system/user prompt, temperature, max tokens, response format, schema |
| `llm-structured` | Execute schema-constrained LLM | any | `object` | model, prompt, JSON Schema, strictness, repair policy |
| `classifier` | LLM/classifier decision | any | label, confidence | model, labels/schema, threshold |
| `summarizer` | Summarize content | text/document | string/object | style, length, language, citations |
| `translator` | Translate content | text/document | string/document | source/target language, preserve markup |
| `prompt-template` | Render reusable prompt | bindings | string/message | template, escaping, missing binding policy |
| `ai-agent` | Bounded reasoning/tool selection | objective/context | `agent-result`, events | agent profile, max steps, tools, budget, approval policy |
| `skill` | Run registered skill | schema-defined input | `skill-result` | skill ID/version, `input.json`, `ui.json`, execution policy |
| `external-agent` | Invoke approved external agent | task/context | `agent-result` | provider/agent ref, contract, timeout, artifact policy |
| `subflow-call` | Invoke reusable subflow | contract inputs | contract outputs | subflow/version, input mapping, output mapping |

### 5.5 Tool and integration nodes

| nodeType | Purpose | Inputs | Outputs | Required settings |
|---|---|---|---|---|
| `http-request` | Call approved public HTTP endpoint | object/body | `tool-result` | method, URL, headers refs, body template, timeout, retry, SSRF policy |
| `mcp-tool` | Call registered MCP tool | tool args | `tool-result` | server/tool/version, arg schema, approval/policy |
| `connector-action` | Call first-party connector | connector input | typed result | connector/action, account ref, input schema |
| `database-query` | Read approved data source | query params | rows/object | source, read-only query/template, tenant filter, limit |
| `database-write` | Write approved data | object/rows | receipt/object | source/table action, schema, idempotency, authorization |
| `notification` | Send email/in-app/webhook notice | message/recipient | delivery receipt | channel, recipient binding, template, retry |
| `file-transform` | Convert/copy managed files | `file` | `file`/artifact | operation, MIME, destination scope, overwrite policy |
| `artifact-store` | Persist output artifact | file/content | artifact ref | name/type/retention/visibility |
| `artifact-publish` | Publish/share result | artifact ref | published ref | destination, access mode, moderation/approval |
| `browser_session_start` | Start an approved browser session | URL/session policy | `browser-session` | tenant feature flag, allowlist, profile, timeout, evidence policy |
| `browser_session_instruction` | Execute an approved browser/computer action | `browser-session`, instruction | `browser-session`, `browser-evidence` | action policy, target/selector, commit mode, approval gate |
| `browser_session_wait_for_user` | Pause for user interaction in browser session | `browser-session` | `browser-session`, `browser-evidence` | assignee, expiry, allowed interaction, resume policy |
| `browser_session_review_gate` | Require review before committing browser action | `browser-session`, evidence | `approved`, `rejected`, `browser-evidence` | reviewer policy, action summary, expiry, evidence retention |

### 5.6 Media and production nodes

| nodeType | Purpose | Inputs | Outputs | Required settings |
|---|---|---|---|---|
| `image-generate` | Generate image | prompt/assets | image/artifact | model, size, aspect, count, references, safety |
| `video-generate` | Generate video | prompt/images | video/artifact | model, duration, aspect, start/end frames, QC |
| `audio-generate` | Generate audio/music | prompt/script | audio/artifact | model, voice/style, duration, format |
| `tts` | Text to speech | text/dialogue | audio/artifact | voice, language, timing, output format |
| `transcription` | Speech to text | audio/video | transcript | language, diarization, timestamps |
| `storyboard` | Produce storyboard/shot plan | brief/assets | storyboard object | style, shot count, continuity refs |
| `media-compose` | Combine clips/images/audio | media[] | video/artifact | timeline, transitions, audio mix, output format |
| `media-qc` | Validate media output | media/artifact | QC report, pass/fail | duration, resolution, safety/quality thresholds |
| `render` | Submit render to owned worker | edit/project | artifact/job ref | composition, worker capability, priority, timeout |
| `preview` | Show preview and metadata | artifact/media | preview/artifact | preview type, poster, controls |

### 5.7 Control-flow and human nodes

| nodeType | Purpose | Inputs | Outputs | Required settings |
|---|---|---|---|---|
| `condition` | Yes/No boolean branch | any | `yes`, `no` | left expression, operator, right value, null policy |
| `switch` | Multi-case branch | any | named case ports, `default` | ordered cases, operators, default policy |
| `parallel` | Run branches concurrently | any | branch outputs | join strategy, max concurrency, failure policy |
| `loop` | Repeat while predicate | state | final state/items | max iterations, predicate, checkpoint interval |
| `foreach` | Run child graph per item | array | array/results | item binding, concurrency, error strategy |
| `delay` | Wait until time/duration | time input | same input | duration/timezone, cancellability |
| `retry` | Explicit bounded retry wrapper | any | success/error | max attempts, backoff, error classes |
| `human-approval` | Pause for reviewer decision | any | `approved`, `rejected`, decision | approver policy, title, expiry, evidence |
| `human-input` | Pause for additional form data | any | input + original | form schema, assignee, expiry |
| `checkpoint` | Persist resumable state | any | same input + checkpoint | retention, redaction, resume contract |
| `error-handler` | Catch/route failures | error/input | handled/unhandled | error classes, fallback, notification |
| `subflow` | Visual reusable flow boundary | contract input | contract output | subflow ID/version, contract, mapping |
| `run-until` | Debug/test boundary | graph state | checkpoint/output | target node, checkpoint policy |

### 5.8 Output and observability nodes

| nodeType | Purpose | Inputs | Outputs | Required settings |
|---|---|---|---|---|
| `result-view` | Display final output | any | workflow output | output mapping, preview fields |
| `output-mapper` | Select public output contract | any | typed workflow-output | fields/schema, redaction |
| `trace-event` | Emit business trace event | any | same input | event name, safe metadata |
| `log` | Emit structured diagnostic log | any | same input | level, message template, redaction |
| `metric` | Emit metric/timing | number/object | receipt | name, dimensions, sampling |
| `run-status` | Project node/run status | run context | status object | fields and audience |

### 5.9 Cross-spec capability and execution nodes

The detailed cross-spec contract is normative in
[`cross-spec-node-coverage.md`](./cross-spec-node-coverage.md). These nodes
complete the workflow-facing coverage for Specs 200, 204, 205, 206, 207, 208,
210, and 211. Runtime profiles, Runner leases, Agent Cards, browser sessions,
external-agent sessions, approvals, and economic records remain owned by their
source specs; this catalog only composes typed requests and projections.

| nodeType | Purpose | Inputs | Outputs | Required settings |
|---|---|---|---|---|
| `external-agent-task` | Run an approved external task | goal, context, assets | agent-result, events, artifacts | task family, logical agent, route/protocol, workspace, capabilities, budget, approval, verification |
| `capability-search` | Discover approved capabilities | query, context | capability[] | type, query, scope, health filter, limit |
| `capability-describe` | Inspect capability/Agent Card | capability ref | manifest | version/detail policy |
| `capability-invoke` | Invoke a typed capability | capability ref, typed args | result | pinned version, input schema, permissions, idempotency, approval/economics |
| `capability-status` | Read canonical invocation status | job/capability ref | status/progress | scope, refresh, event projection |
| `capability-result` | Read canonical result/artifacts | job/capability ref | result/artifacts | result schema, artifact, verification |
| `asset-select` | Select authorized assets | filters/query | asset-ref[] | tenant/project scope, types, tags, authorization |
| `asset-preview` | Produce safe asset preview | asset-ref | preview/evidence | mode, redaction, size/retention |
| `context-package` | Build scoped context/citations | query, refs | context/citations | RAG/Library scope, budget, freshness, provenance |
| `workspace-bind` | Bind approved workspace | project/repository ref | workspace-binding | mode, branch/worktree, allowlist, cleanup |
| `git-operation` | Perform allowlisted Git operation | workspace | receipt/diff/artifact | operation, ref policy, verification, unpublished-work policy |
| `verification` | Verify authoritative postconditions | output/artifact/evidence | report/pass-fail | profile, checks, human confirmation |
| `code-task` | Run an approved coding task | goal, workspace, context | code-result/diff/artifacts | commands/profile, runtime, workspace, tests, timeout, approval |
| `economic-quote` | Request canonical price quote | task/cost estimate | quote | pricing, currency, route, expiry, risk policy |
| `budget-guard` | Gate spend against mandate | quote/cost/mandate | authorized/blocked | budget scope, limit, reserve policy |
| `economic-reserve` | Reserve approved funds | intent/quote | reservation/status | idempotency, expiry, amount/currency |
| `economic-authorization` | Obtain spend authorization | intent/reservation/mandate | authorization receipt | threshold, mandate scope, finality |
| `economic-capture` | Capture measured usage | reservation/usage | capture/ledger ref | bounds, attempt/effect identity |
| `economic-release` | Release/refund reservation | reservation/failed attempt | release/refund receipt | unknown-finality and refund policy |
| `economic-status` | Project economic state | intent/job/receipt | economic status | freshness and redaction |
| `settlement-report` | Read settlement/reconciliation | ledger/settlement ref | report | period, currency, tenant/partner, redaction |
| `browser_observe` | Capture browser state/evidence | browser-session | observation/evidence | redaction, target, screenshot/DOM policy |
| `browser_action` | Execute a typed browser action | session, typed action | session/action-result | target binding, action kind, approval, stale-target policy |
| `browser_file_transfer` | Upload/download through session | session, asset/file | asset/evidence | direction, destination, authorization, cleanup, finality |
| `browser_verify` | Verify browser postcondition | session/result/evidence | verification report | DOM/download/Library evidence, confidence policy |
| `browser_takeover` | Transfer control to a human | browser-session | takeover receipt/session | AI fencing, release/reobserve policy |
| `managed-agent-fleet` | Coordinate bounded child agents | goal/context/assets | results, child events, artifacts | fleet, child limit, lease, scope, concurrency, aggregate budget, join policy |
| `agent-session-control` | Control an external agent session | session/job ref | status/receipt | pause/resume/cancel/close, protocol/runtime, lease/fence |

## 6. Input/data sources the system must expose

The editor must present data sources as typed binding choices, not as arbitrary
JSON paths only. The binding picker should group these sources:

1. Run form: text, number, boolean, enum, files, images, dates, objects.
2. Previous node outputs: named node and port, schema-driven nested fields.
3. Workflow metadata: run ID, version, mode, actor, tenant-safe context,
   started time, checkpoint ID.
4. Library: item ID, title, content, file reference, tags, collection,
   metadata, citations and signed/authorized asset reference.
5. Project/media domain: project, episode, storyboard, shot, character,
   asset, timeline, render settings, prior revision.
6. Chat/webhook/schedule: message, conversation, headers, verified payload,
   schedule timestamp and idempotency key.
7. System services: user/tenant/config values, model catalog, skill catalog,
   MCP tool catalog, connector accounts, Runner capability catalog.
8. External capability metadata: Agent Card, protocol/interface/skill
   conformance, Runner capability snapshot, runtime profile health, workspace
   binding, browser target/evidence policy, and ACP/Gas City/Orca route health.
9. Economic state: quote, budget/mandate decision, reservation, authorization,
   capture/release/refund, usage, ledger/settlement projection and cost policy.
10. Runtime state: prior outputs, errors, retry attempt, approval decision,
    external provider status, artifact references and trace IDs.

Rules: all sources are tenant-scoped and server-authorized; secrets are
references; raw credentials, access tokens and private URLs never enter node
data, client payloads, trace/log output or AI prompt unless an adapter explicitly
redacts and authorizes them.

## 7. Runtime and execution contract

1. Save/publish validates graph cycles, port compatibility, node config schema,
   subflow contracts, secret policy, capability readiness and Marketplace
   entitlement/dependency policy.
2. Run admission creates one canonical workflow Job with typed step plan. Each
   step carries node ID, node type/version, capability, dependency IDs, input
   bindings, config reference, idempotency key and route metadata.
3. Long/provider/media/skill/tool work is executed through the existing
   `worker_jobs`/outbox executor registry or its approved domain adapter. The
   workflow executor must not create a second queue authority.
4. `condition`, `switch`, `parallel`, `loop`, `foreach` and `subflow` are
   deterministic orchestration semantics. Provider adapters only perform their
   owned effects.
5. Approval/input nodes use canonical `waiting_external` and resume commands.
   Retry/cancel/resume must be lease-fenced, idempotent and version/checkpoint
   safe. A cancelled run cannot be silently resumed as a new run.
6. Every node emits start/progress/complete/fail/skip/wait events with safe
   payloads. Outputs and artifacts are persisted via existing artifact/storage
   authority and exposed through authorized references.
7. Partial run modes are first-class: full, run-until, run-from-checkpoint,
   run-node and run-subflow. A partial run must not execute excluded nodes or
   claim a complete final output.
8. Cross-spec admission resolves the execution envelope once and records the
   capability/runtime/protocol/workspace/economic/approval/verification
   snapshot. A2A fallback is bounded to pre-dispatch failures; ambiguous
   dispatch reconciles before retry. Browser actions require typed targets and
   evidence. External-agent sessions and managed fleets remain subordinate to
   the canonical job and event lineage.

## 8. UI/UX contract aligned to the mockup

### Canvas and palette

Keep the mockup composition. The palette is grouped and searchable by category
and contains draggable chips/cards for all catalog entries. Clicking adds a node;
dragging places it at the drop position. The canvas has visible zoom +/-/fit
controls, minimap, grid, clear directional smooth-step edges with arrowheads,
branch labels, connection validation and keyboard deletion.

Selected nodes show a visible resize affordance. Width/height are persisted in
semantic view state and update handle positions. Double-clicking a subflow opens
the subflow; tablets also have a visible Open subflow button.

### Node cards

Node cards must differ by semantic type: icon, accent, summary, port labels,
branch handles, readiness state, input/output preview, tool/model/skill badge,
approval/wait status and subflow contract summary. A generic card may provide
layout primitives, but it cannot erase node-specific information.

### Right inspector

The inspector keeps Configure/Settings/Notes tabs and is horizontally resizable.
Configure renders the node's `uiSchema` form. It provides friendly controls for
prompt, model, tool, skill, conditions, cases, fields, mappings, retry/timeout,
approval and output contracts. Advanced JSON is an explicit escape hatch with
parse errors, never the primary interface. Input/output ports show descriptions,
types, required state and binding examples.

### AI Draft/Edit

The bottom AI bar remains in the mockup hierarchy but becomes a real form: a
multiline prompt, mode Draft/Edit, optional target node, loading/error state,
detected node summary, diff preview and Apply/Discard. Draft calls the compiler
and returns a typed candidate. Edit modifies the selected node or adds/removes
typed nodes while preserving unaffected graph state. No provider is required for
the deterministic baseline; provider-assisted planning is optional and must
validate its output against the same registry.

### Run/debug

Run surface and bottom drawer remain aligned to the attached Run mockup. Inputs
are rendered from workflow input schema. The run timeline shows actual node
states, partial progress, approval wait, retry/cancel/resume controls, logs,
trace, events, outputs, artifacts, preview and cost only when authoritative
data exists. Empty/loading/error/blocked states are explicit.

## 9. Security, tenancy and reliability

- Derive tenant, actor, authorization and Marketplace entitlement on the server.
- Validate external URLs with the existing SSRF policy and enforce provider/tool
  allowlists; never permit arbitrary internal network access.
- Secret fields use references and server-side injection at the adapter boundary.
- Validate JSON Schema depth/size, prompt/template length, loop/concurrency
  limits, upload MIME/size, HTTP response size and artifact retention.
- Use idempotency per run/step/effect; provider retries are finite and only for
  allowed transient classes.
- Redact secrets and personal data in node previews, logs, trace events,
  compiler output, Marketplace manifests and error messages.
- Published versions are immutable. Draft saves use revision checks. A run pins
  definition version, content hash, input fingerprint and checkpoint lineage.
- Fail closed when a provider/capability is not configured; do not show a green
  Ready state for a passthrough shell.

## 10. Delivery waves and dependency order

| Wave | Scope | Depends on |
|---:|---|---|
| 0 | Freeze registry/types/port/config/binding contracts and catalog manifest | none |
| 1 | Server registry, schema validation, readiness and safe binding resolver | 0 |
| 2 | Graph model, edges/branches/subflows, semantic validation, resize persistence | 0–1 |
| 3 | Input/data/document/search/system-context nodes | 1–2 |
| 4 | Logic/control-flow, checkpoint, approval/input, partial selection | 1–3 |
| 5 | LLM/structured AI/agent/skill nodes and schema-driven forms | 1–4 |
| 6 | HTTP/MCP/connector/database/notification/file/artifact adapters | 1–4 |
| 7 | Media and Runner/provider capability adapters | 1–6 and domain readiness |
| 8 | Specialized node cards, inspector, palette, binding picker, responsive UX | 0–7 contracts; can UI-build against mocks earlier |
| 9 | AI Draft/Edit compiler, candidate diff/apply and guardrails | 1–8 |
| 10 | Canonical execution, event/trace/artifact projection and Run surface | 3–9 |
| 11 | Library/Marketplace/Subflow reuse, entitlement/dependency preflight | 2, 9–10 |
| 12 | Cross-spec adapters, route/economic/verification integration and certification | 1–11 and companion-spec readiness |
| 13 | Full regression, browser evidence, rollout/feature flag and external certification gates | all |

Sequential constraints: registry/contract before every adapter; runtime admission
before claiming Run works; approval/checkpoint before resume; artifact authority
before preview/download; Marketplace entitlement before Run from catalog. UI may
be developed in parallel only when it uses registry fixtures and does not invent
unverified readiness.

## 11. Acceptance criteria

1. Catalog contains every node type in Section 5 with a tested registry entry,
   distinct UI form and declared input/output/config contract.
2. Adding two different node types produces different ports, inspector fields,
   card summaries and runtime capability checks.
3. LLM node accepts a prompt template and upstream bindings, admits only with a
   configured model, executes through approved LLM/runtime boundary and exposes
   text/JSON plus usage output.
4. Skill node loads `input.json` and `ui.json` (with compatibility filenames),
   renders the form, validates values and invokes the registered skill through
   canonical worker execution.
5. HTTP/MCP/connector/tool nodes require approved catalog entries, safe URLs or
   account references, and produce typed tool results.
6. Condition and switch nodes render branch ports/labels, validate branch edges,
   and execute only the selected branch while preserving join semantics.
7. Node movement, resize, connect, reconnect, delete edge/node, duplicate,
   subflow open/back and keyboard/tablet controls work and persist.
8. AI Draft/Edit produces a meaningful typed graph/diff from at least the use
   cases in Section 2 and never falls back to a generic execute node silently.
9. Run supports full, run-until, run-from, run-node and run-subflow; approval,
   retry, cancel and resume are backed by canonical lifecycle states.
10. Output/artifact/preview/trace/log/event tabs show authoritative data or an
    explicit unavailable/empty state; no placeholder success is shown.
11. Browser tests cover Dashboard → Build → node configure → connect/branch →
    subflow → Run/debug at desktop, tablet and mobile sizes, following the
    attached mockup hierarchy.
12. Focused unit/integration tests, build, diff checks and at least 20
    completeness/convergence rounds pass. Production provider/Runner/database
    certification remains separately reported when unavailable.
13. Cross-spec certification covers at least one real contract for each of
    Specs 200/204/205/206/207/208/210/211, including the corresponding
    capability source, route/runtime snapshot, permission/approval boundary,
    economic linkage where required, output/evidence projection and recovery
    behavior. A catalog row is not complete when only its label or generic
    pass-through executor exists.

## 12. Out of scope and explicit boundaries

- Do not revive retired Agency, workpacks, `/workflows`, OpenSandbox,
  `sandbox_jobs` or Docker/OpenSandbox execution.
- Do not duplicate model, skill, MCP, connector, media, Runner, economic,
  artifact or approval authorities owned by other specs.
- Do not mark a node as live merely because a palette entry exists.
- Do not replace the attached mockup with a new standalone visual system.
- Do not add dozens of provider-specific nodes when one typed adapter plus a
  provider/tool catalog can represent the capability safely.
