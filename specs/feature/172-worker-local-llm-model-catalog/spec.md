# Feature 172 — Worker Local LLM Model Catalog and Group Sharing

**สถานะ:** Design approved — specification baseline
**วันที่:** 2026-09-01
**เจ้าของ:** LLM Platform / Worker App / Access Control / Chat & Skill Runtime
**อ้างอิงหลัก:** SmartAIHub Local LLM Integration Specification v1 ที่แนบมากับงานนี้

## 1. Executive decision

SmartAIHub จะรองรับ Local LLM ผ่าน Worker App โดยให้ Worker เป็นผู้ติดต่อ
Local AI endpoint และให้ Cloud เป็นผู้ควบคุม model catalog, user/group
permission, routing, job state, usage และ audit

v1 ใช้แนวทาง **Worker-backed Model Projection** ไม่สร้าง provider ปลอมใน
`llm_providers` และไม่ให้ Browser ติดต่อ Local AI endpoint โดยตรง

```text
Worker App local configuration
    -> local provider/model inventory
    -> Cloud metadata projection
    -> actor-aware unified LLM catalog
    -> user selects a worker model
    -> Cloud creates worker_jobs (llm_invoke)
    -> Worker claims job and calls local endpoint
    -> normalized result/stream returns through worker control plane
```

การเข้าถึง v1 มีสองระดับ:

1. **Worker owner** ใช้ Worker และโมเดลที่เปิดใช้งานได้เสมอ
2. **Group share** เจ้าของ Worker เลือก Group ที่ตนสร้างใน Tenant เดียวกัน
   สมาชิกที่มีสถานะ `active` ของ Group จึงมองเห็นและใช้งานโมเดลของ Worker ได้

การแชร์เป็น Worker-level policy ใน v1: โมเดล Local ที่ `enabled` ทุกตัวของ
Worker จะถูกแชร์ตาม policy เดียวกัน โมเดลแต่ละตัวสามารถปิดการใช้งานได้จาก
Worker App โดยไม่ต้องสร้าง ACL ซ้ำต่อโมเดล

สำหรับ Local LLM v1 อนุญาตเฉพาะ `private` และ `groups`; `tenant` sharing ของ
Worker ที่มี Local LLM ต้องไม่ทำให้ Local model ถูกเปิดให้ทั้ง Tenant โดยอัตโนมัติ
หาก Worker อยู่ใน `tenant` mode ให้ปิดการ publish/select ของ Local LLM จนกว่า
จะมี tenant-wide policy ที่ผ่าน security review โดยเฉพาะ

เมื่อผู้ใช้เลือก Worker-backed `modelRef` โดยตรง ระบบต้องเรียก Worker เท่านั้น
และห้าม fallback ไป Cloud model โดยเงียบ ๆ หาก Worker หรือโมเดลไม่พร้อม

## 2. Research findings and design implications

Runtime หลักมี common denominator ที่เหมาะกับ adapter กลางคือ OpenAI-compatible
HTTP API แต่ capability ต้องเป็นข้อมูลราย model/endpoint ไม่ใช่เดาจากชื่อ runtime:

| Runtime | สิ่งที่ยืนยันจากเอกสารทางการ | ผลต่อ design |
|---|---|---|
| Ollama | รองรับบางส่วนของ OpenAI API, ใช้ `/v1/chat/completions` และ endpoint แบบ local; API key ในตัวอย่างจำเป็นต่อ client แต่ถูก ignore โดย server | ใช้ OpenAI adapter ได้ แต่ต้องมี explicit auth mode และ capability probe |
| vLLM | มี `/v1/completions`, `/v1/chat/completions`, `/v1/responses`, `/v1/embeddings` และ audio endpoints; chat ต้องมี chat template | อย่าส่ง tools/structured output/vision จนกว่าจะตรวจ capability ของ model |
| LM Studio | มี `/v1/models`, Responses, Chat Completions, Completions และ Embeddings | discovery และ streaming ใช้ adapter กลางได้; native API เป็น future extension |
| llama.cpp | มี `/v1/models`, chat/completions, responses และ embeddings; `/v1/models` อาจคืน model ที่ loaded เพียงตัวเดียว | รองรับหลาย model record ใน catalog แต่ต้องยอมรับว่าแต่ละ server instance อาจ serve ได้เพียง model เดียว |
| LocalAI | เป็น runtime ที่เปิด OpenAI-compatible API และรองรับหลาย backend/capability ตาม model | ใช้ `openai_compatible` เป็น baseline; capability ต้อง probe ราย model และห้ามสมมติว่า backend ทุกตัวรองรับ feature เดียวกัน |

ดังนั้น “เพิ่มได้หลาย model” หมายถึง Worker มีหลาย provider profiles และหลาย
model inventory records ได้ โดยไม่บังคับว่า endpoint หนึ่งต้อง serve หลาย model
พร้อมกัน หาก runtime รายงาน model เดียว ระบบต้องแสดง model เดียวนั้น และให้ผู้ใช้
เพิ่ม provider instance อื่นหรือ manual model ตามที่ endpoint รองรับ

Research sources:

- [Ollama OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility)
- [vLLM OpenAI-compatible server](https://docs.vllm.ai/en/latest/serving/online_serving/openai_compatible_server/)
- [LM Studio OpenAI compatibility](https://lmstudio.ai/docs/developer/openai-compat)
- [llama.cpp server API](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)
- [LocalAI documentation](https://localai.io/docs/index.html)

## 3. Current repository boundaries

การพัฒนาต้องต่อเข้ากับ boundary ที่มีอยู่ ไม่สร้าง parallel gateway:

| Boundary ปัจจุบัน | บทบาทใน Feature 172 |
|---|---|
| `apps/web/server/services/enabledLlmModels.ts` | ขยายจาก global catalog เป็น actor-aware catalog หรือเรียก unified catalog service ที่รวม system rows กับ Worker projections |
| `apps/web/server/services/llmRouter.ts` | แยก resolution ของ Worker model ออกจาก global `model_provider_map`; Worker candidate ห้ามถูกส่งไป HTTP provider path เดิม |
| `apps/web/server/routers/llmProviders.ts` | รักษา global provider behavior เดิม และเพิ่ม/เชื่อม query สำหรับ visible Worker models โดยไม่เปิด secret |
| `apps/web/shared/workerRuntime.ts` | เพิ่ม versioned LLM inventory, `llm_invoke` job และ event schemas โดยคง compatibility กับ worker jobs เดิม |
| `apps/web/server/routes/workerRuntime.ts` | เพิ่ม inventory sync/read และใช้ heartbeat/claim/event/lease boundary เดิม |
| `apps/web/server/services/workerRegistryService.ts` | ใช้ owner/group claim filter เดิมเป็น defense-in-depth และเพิ่ม LLM model readiness checks |
| `apps/web/server/services/workerSchedulerService.ts` | เพิ่ม queue/admission helper สำหรับ LLM jobs และ worker pinning |
| `apps/web/server/routers/users.ts` | ใช้ connected-worker sharing flow เดิม แต่จำกัด Group policy ตามข้อ 6 |
| `apps/web/drizzle/schema.ts` | เพิ่ม cloud projection tables และ indexes; ไม่เพิ่ม Worker model ลง global provider tables |
| `apps/worker-app/src-tauri/src/settings.rs` | เพิ่ม local AI feature settings ที่ไม่มี secret |
| `apps/worker-app/src-tauri/src/comfy_profiles.rs` / `comfy_credentials.rs` | ใช้เป็น pattern สำหรับ local non-secret profile และ OS keyring secret reference; ไม่ผูก implementation กับ ComfyUI |
| `apps/worker-app/src-tauri/src/worker_control_plane.rs` | เพิ่ม inventory upload, LLM job event และ protocol helpers |
| `apps/worker-app/src-tauri/src/worker_loop.rs` / `worker_executor.rs` | เพิ่ม capability advertisement, job classification, local model lookup และ adapter execution |

ขณะสำรวจ SocratiCode MCP ไม่พร้อมใช้งาน จึงใช้ targeted shell search และอ่าน
ไฟล์ boundary โดยตรงเป็น fallback; implementation ต้องทำ impact review อีกครั้ง
ก่อนเปลี่ยน shared symbols หรือ schema

## 4. Goals

1. ให้ผู้ใช้เพิ่ม provider connection ใน Worker App ได้หลายรายการ
2. ให้ผู้ใช้เพิ่ม/discover local models ได้หลายรายการต่อ Worker และต่อ provider
3. ให้แต่ละ model มี alias, capability, context window, enabled state และ status
4. ให้โมเดลทั้งหมดที่ user มีสิทธิ์มองเห็นในทุก LLM model picker ของ Web App
5. ให้การเลือก Worker model route กลับไปยัง Worker ของตนเองผ่าน control plane
6. รองรับ owner และ Group ที่เจ้าของ Worker สร้างและเปิดสิทธิ์ให้
7. ป้องกัน secret และ local endpoint ไม่ให้ถูกส่งขึ้น Cloud
8. รักษา Chat, Skill, Agent, Plugin/MCP และ background LLM flow ผ่าน contract เดียว
9. รักษา credit, usage, audit, retry, cancellation และ idempotency เดิม
10. ทำให้ Worker offline/model missing/capability drift แสดงสถานะที่แก้ไขได้

## 5. Non-goals

1. ไม่สร้างหรือ fine-tune model ใน SmartAIHub
2. ไม่บังคับให้ทุก runtime รองรับ OpenAI API ครบทุก endpoint
3. ไม่ทำ LAN port scan หรือ auto-discover ทุกเครื่องใน network
4. ไม่เปิด inbound port จาก Internet เข้าเครื่องผู้ใช้
5. ไม่ให้ Browser หรือ Plugin อ่าน Worker credential store
6. ไม่ใส่ Local model ลง `llm_providers` แบบ synthetic provider
7. ไม่ให้ auto-selection เลือก private local model ของผู้ใช้โดยไม่ตั้งใจ
8. ไม่รับรอง “local-only” สำหรับ Web SaaS หาก prompt ยังวิ่งผ่าน Cloud แบบอ่านได้
9. ไม่เปลี่ยน media model catalog ให้ปนกับ LLM catalog
10. ไม่ทำ per-model group ACL ใน v1; หากต้องการจำกัดบาง model ให้ปิด model ที่ Worker

## 6. Sharing and authorization policy

### 6.1 Ownership

Cloud projection ทุกแถวต้องมี `tenantId`, `workerId` และ `ownerUserId` ที่ตรงกับ
Worker `registeredByUserId` เมื่อมี owner หาก Worker ไม่มี owner ให้ห้าม publish
personal Local LLM inventory จนกว่าจะมี explicit system ownership policy

Owner มีสิทธิ์:

- เพิ่ม แก้ไข ลบ และทดสอบ local provider/model ใน Worker App
- เปิด/ปิด model และกำหนด alias/capability
- ดูสถานะ inventory และ job ของ Worker
- เลือก sharing mode และ Group ที่อนุญาต
- revoke share หรือ disconnect Worker

### 6.2 Group sharing

ใช้ `workers.capabilitiesJson.runtimeMetadata.workerSharingPolicy` และ flow ใน
`users.updateConnectedWorkerSharing` เป็น authoritative worker sharing policy
ใน v1 ไม่สร้าง ACL ซ้ำอีกชุดหนึ่ง

แม้จะใช้ field ใน `capabilitiesJson` ร่วมกับ runtime metadata แต่
`workerSharingPolicy` เป็น **server-owned** subdocument: Worker heartbeat/registration
ห้ามเขียนทับ, ลดสิทธิ์ไม่ได้ และต้อง merge เฉพาะ runtime-reported fields ที่ allowlist
ไว้เท่านั้น การเปลี่ยน policy ทำผ่าน owner-authorized mutation ของ Cloud เท่านั้น

เมื่อเลือก `sharingMode = groups`:

1. ต้องเลือกอย่างน้อยหนึ่ง Group
2. Group ต้องอยู่ใน Tenant เดียวกับ Worker
3. Group ต้องไม่ถูก soft-delete
4. Group ต้องมี `userGroups.ownerId` ตรงกับ `workers.registeredByUserId`
   (เจ้าของ Worker เป็นผู้สร้าง Group)
5. สมาชิกที่ใช้งานได้ต้องมี `group_members.status = active`
6. Owner ของ Worker ต้องยังใช้งานได้เสมอ แม้ไม่ได้เป็น member ของ Group ที่เลือก
7. การเปลี่ยน Group share มีผลทันทีต่อการแสดง catalog และ job ใหม่
8. Job ที่กำลังรันอยู่ไม่ถูกเปลี่ยน owner; การยกเลิกต้องใช้ cancellation flow ที่มีอยู่

เมื่อ revoke Group, เปลี่ยนเป็น private, ปิด Worker หรือเจ้าของ Worker ถูกลบ/
ถูกระงับ ระบบต้อง invalidate catalog cache และ re-check งาน `queued`/`claimed`
ที่ยังไม่เริ่ม inference ทันที งานที่ไม่ผ่าน policy ใหม่ต้องถูก block/cancel ตาม
สถานะที่รองรับ และห้ามถูก claim ต่อ สมาชิกเดิม ส่วนงานที่ provider เริ่ม inference
แล้วใช้ terminal/cancellation policy เดิมและต้องบันทึก policy revision ที่ใช้ตอน dispatch

Local LLM ห้ามใช้ `sharingMode = tenant` ใน v1 ตามข้อกำหนดด้านบน แม้ connected-worker
UI เดิมจะรองรับ tenant mode สำหรับงานประเภทอื่น

ถ้า implementation product policy ต้องอนุญาตผู้ที่เป็น group manager แต่ไม่ใช่
group owner ให้บันทึกเป็น explicit policy revision และห้ามขยายสิทธิ์ด้วยการ
ตรวจเพียงว่าเป็นสมาชิก Group

### 6.3 Two-sided enforcement

Cloud ต้องตรวจ permission ก่อน:

- คืน Worker model ใน actor-aware catalog
- รับ model selection จาก browser/API
- สร้าง `llm_invoke` worker job
- retry/requeue job
- อ่านผลลัพธ์หรือ stream ของ job

Worker control plane ต้องตรวจซ้ำจาก lease, tenant, worker identity, model binding
และ job scope ก่อน execute ไม่เชื่อ `ownerUserId` หรือ `groupId` จาก payload ที่
client ส่งมาเอง

ทุกการตรวจสิทธิ์ต้องอ่าน policy revision ล่าสุดจาก Cloud หรือ snapshot ที่ signed/
มี version guard; ห้ามพึ่ง catalog cache เพียงอย่างเดียวเมื่อ claim หรือ report event
และต้องมี audit event สำหรับ share, revoke, denied dispatch และ policy-race cancellation

## 7. Data model

### 7.0 Common adapter contract

Worker adapters must implement the same logical contract used by existing Cloud
LLM adapters, even though transport and secret ownership differ:

```ts
interface LocalLlmAdapter {
  validateConfig(profile: LocalLlmProviderProfile): ValidationResult;
  testConnection(): Promise<ConnectionTestResult>;
  discoverModels(): Promise<LocalLlmModel[]>;
  invoke(request: NormalizedLlmRequest): Promise<NormalizedLlmResult>;
  stream(request: NormalizedLlmRequest): AsyncIterable<LlmStreamEvent>;
  cancel(requestId: string): Promise<CancelResult>;
  health(): Promise<HealthResult>;
}
```

`NormalizedLlmRequest` carries the server-issued `requestId`, task, canonical
`modelRef`, messages, bounded parameters, optional tools/response format, stream
mode and privacy mode. `NormalizedLlmResult` carries the same request/model IDs,
text or structured output, finish reason, data-only tool calls, nullable usage and
timing. These shared fields are the compatibility boundary; provider-specific
fields stay inside the adapter.

The adapter must normalize base URL/auth, translate request and response formats,
map HTTP/provider errors, gate unsupported parameters before invocation, normalize
stream events and usage, redact secrets, and record dropped parameters. A strict
mode must fail with `WORKER_LLM_CAPABILITY_MISMATCH` instead of silently dropping
required parameters. Native adapters are optional extensions; the
`openai_compatible` adapter is the v1 baseline.

### 7.1 Worker-local provider profiles

เก็บใน Worker App local metadata file หรือ local store ตาม pattern ของ
`comfy_profiles`; ข้อมูล secret เก็บผ่าน OS keyring (`keyring` crate ที่มีอยู่)

```ts
type LocalLlmProviderProfile = {
  localProviderId: string;
  displayName: string;
  adapterId: "openai_compatible" | "ollama_native";
  baseUrl: string;
  endpointScope: "localhost" | "wsl2" | "lan" | "remote";
  authMode: "none" | "bearer" | "basic";
  credentialRef: string | null;
  tlsVerify: boolean;
  timeoutMs: number;
  allowCloudJobs: boolean; // default false; explicit opt-in for worker_relay
  allowLocalOnlyJobs: boolean; // default false; explicit opt-in for local UI
  maxConcurrentJobs: number;
  enabled: boolean;
  revision: number;
};
```

`localProviderId` และ `localModelId` ต้องเป็น opaque, stable, locally generated
IDs ที่ไม่เปลี่ยนเมื่อ display name เปลี่ยน ส่วน `providerModelId` ให้คงค่าและ
case-sensitivity ตาม runtime แต่ต้อง trim/normalize ก่อนใช้สร้าง identity key
และห้ามมี duplicate identity ภายใน provider profile เดียวกัน

ห้าม persist password/token ใน metadata JSON, WebView state, export, crash
report หรือ job payload

### 7.2 Worker-local model inventory

```ts
type LocalLlmModel = {
  localModelId: string;
  localProviderId: string;
  providerModelId: string;
  displayName: string;
  modelKind: "chat" | "vision_chat" | "embedding" | "completion" | "other";
  capabilities: {
    chat: boolean;
    streaming: boolean;
    vision: boolean;
    embeddings: boolean;
    tools: boolean;
    structuredOutput: boolean;
    jsonMode: boolean;
    responses: boolean;
    cancellation: boolean;
  };
  capabilitySources: Record<string, "declared" | "detected" | "overridden" | "unknown">;
  contextWindow: number | null;
  resourceHints: { estimatedVramGb?: number; maxConcurrentJobs?: number };
  enabled: boolean;
  status: "online" | "offline" | "provider_unreachable" | "model_missing" | "capability_changed" | "disabled";
  inventoryRevision: number;
  lastTestedAt: string | null;
};
```

### 7.3 Cloud projection: `worker_llm_models`

เพิ่มตารางใหม่สำหรับข้อมูลที่ Cloud ต้องใช้ในการ catalog/routing โดยไม่เก็บ
endpoint หรือ credential:

| Column | Requirement |
|---|---|
| `id` | UUID/opaque stable `modelRef` primary key |
| `tenantId` | required, indexed |
| `workerId` | required FK to `workers`, indexed |
| `ownerUserId` | required FK to `users`, indexed |
| `localProviderId` | opaque ID matching Worker local profile |
| `providerType` | adapter/provider classification |
| `providerDisplayName` | safe display metadata |
| `providerModelId` | model ID sent to local endpoint |
| `displayName` | user-facing alias |
| `modelKind` | chat/vision/embedding/completion/other |
| `capabilitiesJson` | normalized capability flags and source metadata |
| `resourceHintsJson` | context/VRAM/concurrency hints |
| `status` | inventory status |
| `enabled` | catalog visibility gate |
| `inventoryRevision` | compare-and-swap revision |
| `lastSeenAt` | last inventory observation |
| `lastErrorCode` | sanitized status reason |
| `deletedAt` | nullable; explicit removal tombstone, never used for inventory-missing alone |
| `createdAt`, `updatedAt` | timestamps |

Required indexes:

- `(tenantId, workerId, enabled)`
- `(tenantId, ownerUserId, enabled)`
- `(tenantId, status, lastSeenAt)`
- partial unique `(workerId, localProviderId, providerModelId)` where `deletedAt IS NULL`

Do not add `baseUrl`, `username`, `password`, `apiKey`, `token`, `credentialRef`
or signed local endpoint URLs to this table.

Because the existing foreign keys do not encode a composite tenant relationship,
every projection write/read must additionally verify Worker tenant, owner tenant and
actor tenant in the same transaction/query. A missing or changed
`workers.registeredByUserId` invalidates publication and disables the projection;
it must not be repaired from a client-supplied owner ID.

### 7.4 Cloud inventory sync state

Use a small `worker_llm_inventory_syncs` table or equivalent durable projection
state with:

- `workerId`, `tenantId`
- `inventoryRevision`
- `payloadHash`
- `receivedAt`
- `acceptedAt`
- `rejectedReason`

The same `(workerId, inventoryRevision, payloadHash)` must be idempotent. A lower
revision must not overwrite a newer inventory. A newer inventory marks removed
models as `model_missing`/disabled according to policy, rather than deleting them
immediately, so existing user preferences and job history remain readable.

Inventory ingestion requirements:

- authenticate with a worker execution token that has a dedicated `llm:inventory`
  scope; `workers:report` alone is insufficient for inventory publication
- ignore `workerId`/`tenantId` from the body and derive both from the authenticated token
- require an `Idempotency-Key` and canonical payload hash; same key with a different
  hash is a conflict, same revision with a different hash is rejected
- accept only monotonically increasing revisions; an exact replay returns the prior
  accepted result without rewriting projections
- apply provider/model upserts, tombstones and sync-state update in one transaction
- enforce bounded provider/model counts and payload size before parsing/persisting
- never log raw inventory payload on validation failure

The accepted response returns the authoritative mapping
`[{ localModelId, modelRef, inventoryRevision }]`. Worker App persists this mapping
locally (without secrets). A later `llm_invoke` is executable only when
`modelRef -> localModelId -> localProviderId/providerModelId` matches the current
local inventory and accepted revision; a new local identity receives a new Cloud
`modelRef`, while a missing model keeps its old mapping for history/recovery.

### 7.5 Model reference

Worker model IDs must be opaque Cloud IDs. The client must not construct a model
reference by concatenating worker ID and provider model ID.

```ts
type WorkerLlmModelRef = {
  modelRef: string; // worker_llm_models.id
  sourceType: "worker_app";
  workerId: string;
  localProviderId: string;
  providerModelId: string;
  displayName: string;
  ownerUserId: number;
  tenantId: string;
  status: LocalLlmModel["status"];
  capabilities: LocalLlmModel["capabilities"];
};
```

The API may expose a discriminated union with existing cloud/direct model rows,
but every consumer must use `sourceType` rather than infer source from string
prefixes or display name.

## 8. Inventory discovery and synchronization

### 8.1 Worker App lifecycle

```text
Add provider profile
    -> validate URL/auth/endpoint scope
    -> store non-secret metadata atomically
    -> store secret in OS keyring
    -> test connection
    -> discover /v1/models or provider-native model list
    -> normalize model records
    -> allow manual add/edit
    -> explicit capability overrides
    -> publish inventory metadata to Cloud
```

Publish on first enable, Worker reconnect, provider/model mutation and a bounded
periodic refresh. A failed refresh keeps the last accepted inventory with stale
status; it must not clear the catalog or reset the revision.

Provider discovery must only call the selected endpoint paths; no broad port or
network scan. Manual model add is allowed when discovery is unsupported. Manual
model is `unknown` until tested or explicitly overridden and cannot claim a
capability that was not declared/detected/overridden.

### 8.2 Inventory payload

```json
{
  "protocolVersion": "worker-llm-inventory/1",
  "workerId": "worker_01J",
  "inventoryRevision": 7,
  "providers": [
    {
      "localProviderId": "provider_01J",
      "providerType": "openai_compatible",
      "displayName": "Ollama on Windows",
      "status": "online",
      "models": [
        {
          "localModelId": "model_01J",
          "providerModelId": "qwen3:8b",
          "displayName": "Qwen 3 8B Local",
          "modelKind": "chat",
          "capabilities": {
            "chat": true,
            "streaming": true,
            "vision": false,
            "embeddings": false,
            "tools": false,
            "structuredOutput": true,
            "jsonMode": true,
            "responses": false,
            "cancellation": false
          },
          "capabilitySources": {
            "chat": "detected",
            "structuredOutput": "overridden"
          },
          "contextWindow": 32768,
          "enabled": true,
          "status": "online"
        }
      ]
    }
  ]
}
```

Payload ห้ามมี `baseUrl`, `username`, `password`, `apiKey`, `accessToken`,
`authorizationHeader`, `credentialRef`, local file path หรือ prompt

The inventory endpoint is separate from heartbeat and has explicit rate limiting,
body limit, CSRF-not-applicable worker-token authentication, and the same tenant /
worker binding checks as claim/report routes.

### 8.3 Transport

Heartbeat ส่งได้เฉพาะ LLM capability summary และ inventory revision/digest เพื่อ
ไม่ให้ heartbeat 48 KiB limit ถูกใช้กับ model list จำนวนมาก การส่ง inventory ฉบับ
เต็มใช้ authenticated endpoint ที่มี body limit, idempotency และ revision guard
แยกต่างหาก เช่น:

```text
POST /api/workers/:workerId/llm/inventory
GET  /api/workers/:workerId/llm/inventory/status
```

HTTP polling/claim/event ที่มีอยู่เป็น transport baseline ของ v1; WSS push เป็น
optimization ภายหลัง ไม่ใช่ dependency ของ model execution

### 8.4 Readiness and stale thresholds

Use server-configurable defaults so status behavior is deterministic:

- `workerOfflineAfterSeconds = 90`: derived from the last authenticated heartbeat
- `inventoryStaleAfterSeconds = 300`: model remains visible but is not selectable
  after this interval unless an explicit owner-only diagnostic override is active
- `inventoryMissingGraceSeconds = 600`: a missing model remains visible as
  `model_missing` before optional tombstoning; it is never silently removed
- inventory recovery requires a newer accepted revision and resets stale/error state

The Worker heartbeat summary must include `llmGatewayReady`, inventory revision /
digest, enabled model count, and capability-family summary. It must not be the source
of truth for model IDs or ACL. Claim-time readiness is checked against the server
projection and the Worker-local inventory/model binding.

## 9. Unified actor-aware model catalog

### 9.1 Single catalog contract

สร้าง service กลาง เช่น `listAvailableLlmModelsForActor({ tenantId, userId })`
ซึ่งรวม:

1. Global enabled LLM models ที่ actor มีสิทธิ์ใช้
2. Direct/user connections ที่ actor มีสิทธิ์ใช้ หาก feature นี้เปิดในอนาคต
3. Enabled Worker projections ที่ owner คือ actor
4. Enabled Worker projections ที่ Worker sharing policy มี Group ที่ actor เป็น
   active member

ผลลัพธ์ต้องมี metadata ต่อรายการ:

```ts
type AvailableLlmModel = {
  modelRef: string;
  sourceType: "cloud" | "direct" | "worker_app";
  modelId: string;
  displayName: string;
  providerDisplayName: string;
  worker?: {
    workerId: string;
    displayName: string;
    ownerUserId: number;
    status: "online" | "offline" | "unhealthy" | "disabled" | "draining";
    sharedViaGroupIds: number[];
  };
  modelStatus: string;
  selectable: boolean;
  unavailableReason: string | null;
  capabilities: Record<string, boolean>;
  contextWindow: number | null;
  selectableForTasks: Array<"chat" | "completion" | "vision_chat" | "embedding">;
};
```

### 9.2 Visibility rules

- `enabled = false` rows ไม่แสดงใน selectable list แต่ admin/owner status view อาจเห็น
- Worker offline หรือ model missing ยังแสดงใน owner/group catalog ได้ แต่เป็น disabled
  พร้อม status/reason เพื่อให้ผู้ใช้เห็นว่ามี model กี่ชุดตามที่ตั้งไว้
- Catalog เป็น inventory ที่ actor มองเห็น แต่แต่ละ picker ต้องกรองด้วย task
  capability; เช่น embedding-only model แสดงใน Local AI inventory แต่ไม่ selectable
  ใน Chat และ vision model ต้องไม่ selectable ใน text-only task หาก contract ไม่รองรับ
- Catalog ต้องไม่ duplicate รายการด้วย `providerModelId`; model คนละ Worker หรือคนละ
  provider profile เป็นคนละ model reference แม้ใช้ชื่อ model เดียวกัน
- Sort ให้ Worker models อยู่ใน provider group ที่ชัดเจน เช่น `Local Worker · <name>`
- ห้ามใส่ Worker models เข้า global auto-selection pool โดย default
- User preference ที่ pin `modelRef` สามารถทำให้เป็น default ของ user ได้

### 9.3 ทุก model picker

ทุก UI/API ที่ให้เลือก **LLM** ต้องอ่าน catalog กลางและส่ง `modelRef` เดิมกลับมา
ไม่สร้าง hardcoded options ของตนเอง ได้แก่:

- Chat composer/model selector
- Skill execution/model override
- Agent/Team model selection
- Plugin/MCP `models.list`
- Story, script, translation, planning และ LLM-backed workflow selectors
- Desktop/Worker-connected model selection surfaces

Media image/video/audio model pickers ไม่ต้องแสดง LLM rows เว้นแต่ field นั้น
ประกาศเป็น LLM contract อย่างชัดเจน

Backend ต้อง revalidate `modelRef` ด้วย actor context ทุกครั้ง แม้ browser จะส่ง
รายการที่เคยเห็นมาแล้ว

For a guessed or unauthorized `modelRef`, the external response must not reveal
another tenant's Worker/model metadata; use the existing not-found/permission
abstraction while recording the precise denial reason only in the audit log.

## 10. Routing and worker job protocol

### 10.1 Resolution

```text
request.modelRef
    -> resolveActorLlmModel(actor, modelRef)
    -> sourceType=cloud/direct: existing provider path
    -> sourceType=worker_app: validate worker projection + ACL + status
    -> create llm_invoke worker job
```

For an explicit Worker model, admission is synchronous: if ACL, Worker status,
inventory freshness, model readiness or required capability fails, return the specific
error and do not create a stranded queued job. An optional queue-while-offline mode is
out of v1 scope. The job `runtimeType` must equal the registered Worker row's actual
runtime type; `remotion_executor` in the example is illustrative for the current
Worker App and is not a universal constant.

Worker model ต้องไม่ไหลเข้า `resolveProvidersWithRule()` หรือถูกแปลงเป็น
`providerId` ของ `model_provider_map` เพราะจะส่งไป normal gateway และทำให้
user-specific model ปะปนใน global provider health/routing

### 10.2 Job shape

```json
{
  "jobType": "llm_invoke",
  "runtimeType": "remotion_executor",
  "workerId": "worker_01J",
  "requestedByUserId": 42,
  "capabilityRequirementsJson": {
    "capabilityFamilies": ["llm_gateway", "llm.chat"],
    "modelRef": "worker_llm_model_01J",
    "workerId": "worker_01J"
  },
  "inputJson": {
    "protocolVersion": "worker-llm-invoke/1",
    "modelRef": "worker_llm_model_01J",
    "localProviderId": "provider_01J",
    "providerModelId": "qwen3:8b",
    "task": "chat",
    "messages": [],
    "parameters": {
      "temperature": 0.7,
      "maxTokens": 2048
    },
    "tools": [],
    "responseFormat": null,
    "stream": true,
    "idempotencyKey": "idem_01J"
  },
  "instructionsJson": {
    "privacyMode": "worker_relay",
    "allowFallback": false,
    "maxRuntimeSeconds": 600
  },
  "idempotencyKey": "tenant-42:idem_01J"
}
```

`runtimeType` ใช้ runtime type เดิมของ Worker App ใน v1; `llm_gateway` เป็น
capability family ใหม่ ไม่จำเป็นต้องเพิ่ม enum runtime ใหม่หากไม่จำเป็นต่อการ
ลงทะเบียนและ backward compatibility

The implementation must extend the registration/heartbeat capability schema and the
claim matcher so `llm_invoke` has mandatory server-side assertions for both
`llm_gateway` and the task capability (for example `llm.chat`). Empty
`capabilityHints` or client-supplied capability arrays must never make an LLM job
claimable. The selected `modelRef` must also match the current Worker projection,
inventory revision and local model binding at claim time.

Cloud ต้องสร้าง request snapshot จาก server-resolved model projection ห้ามเชื่อ
`providerModelId`, `workerId` หรือ capability ที่ส่งจาก browser โดยตรง

### 10.3 Worker execution

1. Worker heartbeat advertise `llm_gateway` เฉพาะเมื่อ local adapter registry
   และอย่างน้อยหนึ่ง enabled model พร้อม
2. Worker claim job ผ่าน `/api/workers/:workerId/jobs/claim`
3. Worker ตรวจ job protocol version, worker ID, modelRef/localProviderId และ
   local inventory revision
4. Worker resolve `localProviderId` จาก local metadata และ credential จาก keyring
5. Worker เลือก adapter ตาม local provider profile
6. Adapter ตรวจว่า provider `enabled` และ `allowCloudJobs` อนุญาต `worker_relay`
   ก่อนส่ง request ไป local endpoint; Cloud ไม่ได้รับ credential
7. Worker ใส่ request ไว้ใน bounded local queue ตาม `maxConcurrentJobs`; cancellation
   ก่อนส่ง provider request ต้องไม่เรียก inference และต้องคืน terminal cancellation
8. Worker ส่ง `job.accepted`, `job.running`, `llm.stream.started`, delta events,
   `llm.stream.completed` และ `job.completed`/`job.failed`
9. Cloud ตรวจ sequence, assignment attempt, lease และ terminal transition

ถ้า local model ไม่มี, disabled, capability ไม่ตรง หรือ provider ไม่พร้อม ให้
fail ก่อนเริ่ม inference และรายงาน status ที่แก้ไขได้

### 10.4 Streaming

```json
{
  "eventType": "llm.stream.delta",
  "sequenceNumber": 12,
  "payloadJson": {
    "text": "ผลลัพธ์บางส่วน",
    "finishReason": null
  },
  "leaseOwnerToken": "opaque-lease",
  "assignmentAttempt": "attempt-1"
}
```

Cloud ต้อง deduplicate ด้วย `(jobId, assignmentAttempt, sequenceNumber)` และ
ห้ามนำ event จาก attempt เก่ามาเขียนทับ attempt ใหม่ การ deduplicate ต้องเป็น
atomic ที่ database ไม่ใช่แค่ read-then-insert ใน application memory: เพิ่ม
first-class `assignmentAttempt` และ `sequenceNumber` ให้ `worker_job_events` หรือ
ใช้ equivalent unique expression/transactional lock พร้อม unique partial index สำหรับ
`llm_invoke`; duplicate insert ต้องคืน replay response อย่างปลอดภัย

Use the existing Worker job status vocabulary and transitions: `claimed` may move
to `preparing`/`running`, and an LLM stream may emit neutral events before
`job.completed`, `job.failed` or `job.canceled`. The exact event names are
`job.preparing`, `job.running`, `llm.stream.started`, `llm.stream.delta`,
`llm.stream.completed`, `job.completed`, `job.failed`, and `job.canceled`.
For `llm_invoke`, sequence deduplication must be assignment-scoped even though the
current generic event handler scopes some existing job types differently; this is an
explicit implementation change.

Cancellation is a control-plane operation: queued jobs transition directly to
`canceled`; active jobs receive a cancel request through the existing job polling /
job-summary path or a dedicated authenticated cancel endpoint, the Worker aborts the
adapter request, then emits `job.canceled`. A late completion after cancellation is
rejected by the terminal and assignment guards.

The normalized result must contain `text`/structured output, finish reason,
provider/model identity, usage (nullable), timing and `requestId`; tool calls are
returned as data only. The Worker must not execute tools, plugins or arbitrary
commands from an LLM response. Large prompts/results/deltas use bounded sizes and
chunking; the Web client can reconnect and replay stored events from a sequence
cursor without starting a second inference.

## 11. Execution policy, fallback and billing

### 11.1 Explicit selection

เมื่อ request ระบุ Worker `modelRef`:

- `allowFallback` default เป็น `false`
- Worker offline, disabled, model missing, permission revoked หรือ capability
  mismatch ต้องคืน error ที่บอกสาเหตุ
- ห้าม retry ไป Cloud provider โดยอัตโนมัติ
- UI ต้องแสดง source เป็น Worker และชื่อ Worker/Provider
- `worker_relay` requires the selected local provider's `allowCloudJobs = true`;
  otherwise fail with a policy error before creating the job

`local_only` requires `allowLocalOnlyJobs = true` and is callable only from an
authorized local Worker/Desktop surface; a Web request must never silently change
its privacy mode to local-only.

### 11.2 Preference/automatic routing

รองรับ policy:

```text
cloud_only
worker_only
prefer_worker
prefer_cloud
auto
```

`worker_only` ไม่ fallback เด็ดขาด เช่นเดียวกับ `local_only` หากเปิดใน Desktop
local execution ที่ไม่ relay ผ่าน Cloud

`prefer_worker` และ `auto` อาจ fallback ได้เฉพาะเมื่อผู้ใช้/skill policy
อนุญาต และต้องบันทึก `fallbackFrom`, `fallbackTo`, reason และ execution source
ใน result/audit ให้เห็นชัดเจน

Retry is separate from fallback. Default `llm_invoke` retry policy is one inference
attempt. A retry is allowed only before the local provider accepted the request, or
when the adapter and Worker dedup cache prove the same logical request was not sent;
lease expiry after provider acceptance must not blindly run the prompt again. Any
explicit user retry creates a new attempt/request ID while retaining the parent job
link.

### 11.3 Billing

- Local provider/inference cost default เป็น 0
- Skill fee และ platform fee ใช้ billing policy เดิม
- LLM usage บันทึก modelRef, workerId, requestId, jobId, token usage, queue wait,
  inference time และ GPU time ถ้า Worker รายงาน
- Reservation/debit ต้องเกิดครั้งเดียวต่อ logical request และ idempotency key
- Worker ไม่สร้าง credit event เอง
- enforce per-user, per-Worker and per-provider concurrency/quota before queueing;
  return `WORKER_LLM_BUSY` or quota error instead of allowing unbounded queue growth
- local inference usage may be zero-cost, but request/response token counts and
  runtime timing remain observable when the adapter reports them

## 12. Error and lifecycle contract

Standard error codes เพิ่มเติม:

```text
WORKER_MODEL_NOT_FOUND
WORKER_MODEL_DISABLED
WORKER_MODEL_OFFLINE
WORKER_PROVIDER_UNREACHABLE
WORKER_LLM_CAPABILITY_MISMATCH
WORKER_LLM_PERMISSION_DENIED
WORKER_LLM_INVENTORY_STALE
WORKER_LLM_PROTOCOL_UNSUPPORTED
WORKER_LLM_BUSY
WORKER_LLM_STREAM_INTERRUPTED
WORKER_LLM_EXECUTION_TIMEOUT
```

Error response ต้องมี `requestId`, `jobId` ถ้ามี, `modelRef`, `workerId` ถ้า
ปลอดภัยต่อผู้เรียก, `retryable` และ user-safe message; ห้ามมี endpoint, path,
authorization header, token หรือ raw provider secret

Lifecycle:

```text
inventory: received -> accepted/rejected -> projected
job: queued -> claimed -> preparing -> running
                               |             \-> completed/failed/canceled
                               \-> expired
model: online -> offline/provider_unreachable/model_missing/capability_changed
```

`accepted`, `preparing`, `uploading`, `publishing` and `indexing` are represented by
the existing job lifecycle where applicable; Local LLM normally stops at
`completed`/`failed`/`canceled`. The state machine must reject `completed` after a
terminal state and preserve `assignmentAttempt` on every event.

Inventory stale ไม่ควรทำให้ model หายจาก UI ทันที; ให้ status เปลี่ยนและปิด
selectability เมื่อเกิน stale threshold ที่กำหนด พร้อมแสดง last seen

## 13. Worker App UI

เพิ่มเมนู:

```text
Worker App
  -> Local AI
     -> Providers
     -> Models
     -> Sharing
     -> Resources
     -> Logs
```

### Providers

- Add/Edit/Delete provider
- protocol/adapter type
- base URL และ endpoint scope
- auth mode และ write-only secret field
- test connection
- discover models
- timeout/TLS/concurrency
- allow cloud jobs toggle
- ไม่แสดง secret หลังบันทึก

### Models

- แสดงทุก model ของทุก provider profile
- Discover และ Add Manual Model
- แก้ alias/model ID แบบ explicit
- capability detected/overridden/unknown
- context window และ resource hints
- enable/disable
- test chat/streaming
- status และ last checked
- sync status/revision

### Sharing

Worker ownerเลือก `Private` หรือ `Selected groups` ผ่าน connected-worker settings
ของ Web App ซึ่งใช้ policy เดียวกับ Worker queue claim ปัจจุบัน แสดงชื่อ Group,
จำนวนสมาชิก และ warning ว่าสมาชิกกลุ่มจะส่ง prompt ผ่าน Worker ของเจ้าของ

## 14. Web UX states

ทุก model picker ที่ใช้ unified catalog ต้องรองรับ:

- Loading catalog
- Empty catalog
- Local Worker model group
- Worker offline: แสดงรายการแต่ disable และบอก last seen
- Model missing/capability changed: disable พร้อม action “เปิด Worker App เพื่อตรวจสอบ”
- Group-revoked: รายการหายจาก member catalog หลัง refetch; request เก่าต้องได้ 403
- Selected Worker model: แสดง Worker badge และ privacy/source indicator
- Explicit execution failure: มี Retry และ Change model โดยไม่ auto-switch

## 15. Security requirements

### Cloud

- Query ทุกตัวต้อง scope ด้วย `tenantId` และ actor user ID
- Group IDs ต้อง validate จาก database; ห้ามเชื่อชื่อหรือ group ID จาก client
- Worker owner เท่านั้นแก้ sharing policy หรือ local model projection ที่มาจาก Worker
- Inventory endpoint ตรวจ worker token, tenant, worker ID และ protocol version
- Job dispatch ตรวจ model projection, ACL, worker status และ capability ณ เวลาสร้าง
- Job payload ไม่มี credential หรือ local endpoint
- redact provider error ก่อน persist/log

### Worker

- endpoint รับเฉพาะ `http`/`https`; ห้าม URL userinfo, query secret, file scheme หรือ
  arbitrary command
- localhost เป็นค่าเริ่มต้น; LAN/remote ต้อง explicit และผ่าน connection test
- ไม่ทำ broad network scan
- credential ใช้ Windows Credential Manager/macOS Keychain/Linux Secret Service
  ผ่าน keyring; fallback เป็น encrypted local store ได้เฉพาะมี explicit implementation
- ถ้า secure store ใช้ไม่ได้ ให้ session-only secret หรือปฏิเสธการ save ถาวร
- local credential ใช้เฉพาะหลังตรวจ job lease/model binding
- logs/diagnostics redact bearer/basic credentials และ local file paths
- export config ต้องไม่รวม secret
- remote endpoints require HTTPS by default, reject redirects to a different origin,
  reject URL userinfo/query credentials and insecure TLS except an explicit
  localhost-only development override; LAN/remote access requires an explicit warning
- enforce request/response byte limits, message/tool schema limits, stream rate limits,
  and provider concurrency limits at both Cloud admission and Worker adapter layers

### Data retention and prompt handling

Because `worker_relay` means Cloud can inspect the prompt, the product must disclose
this before a member uses a shared Worker. Cloud persistence follows the existing
tenant/job retention policy but must support a configurable redacted mode: do not put
raw prompt/response text in audit logs, diagnostics, metrics or error messages; retain
only the minimum job payload/result needed for the caller and configured history.
Deletion/export requests must include Local LLM job payloads and results, while
operational metadata may remain only for the documented audit retention period.

### Privacy terminology

Web request ที่ส่งผ่าน Cloud ไป Worker ให้เรียกว่า `worker_relay` ไม่ใช่
`local_only` เพราะ Cloud สามารถเห็น payload ระหว่าง relay ได้ หากต้องการ
`local_only` จริงต้องเริ่มจาก Desktop/Worker local UI หรือเพิ่ม E2E encryption
แยกในอนาคต

## 16. Migration and compatibility

1. ไม่แก้ behavior ของ global `llm_providers` และ `model_provider_map`
2. เพิ่ม migration สำหรับ `worker_llm_models` และ inventory sync state
   โดยต้องสร้าง foreign keys/indexes, partial uniqueness และ rollback ที่เก็บ
   projection/history ไว้โดยไม่เปิดให้ legacy caller ใช้งาน
   รวมถึง event identity columns/index สำหรับ atomic `llm_invoke` stream dedup
3. เพิ่ม actor-aware catalog แบบ backward-compatible; caller เก่าที่ยังส่ง
   legacy model ID ต้อง resolve เฉพาะ global model และไม่สามารถอ้าง Worker model
   โดยเดา ID
4. เพิ่ม feature flags:

```text
llm.worker_gateway
llm.worker_llm_inventory
llm.worker_llm_catalog
llm.worker_llm_group_sharing
llm.worker_llm_jobs
llm.worker_llm_streaming
llm.worker_llm_native_ollama
```

5. Worker เก่าที่ไม่ advertise `llm_gateway` ไม่ถูกเลือกให้รับ `llm_invoke`
6. Worker เก่าต้องยัง claim/render/media jobs ได้เหมือนเดิม
7. protocol negotiation ต้อง fail closed เมื่อ worker ไม่รองรับ schema
8. ปิด feature flag ต้องซ่อน Worker models จาก selectable catalog แต่ไม่ลบ
   projection/history
9. user default ที่ชี้ model ถูกลบ/disabled ต้องเปลี่ยนเป็น unresolved state
   และไม่ fallback เงียบ ๆ เมื่อเป็น explicit pin
10. เพิ่ม `llm:inventory` ใน worker permission registry/presets และ migration ของ
    custom scopes; existing workers ที่ไม่มี scope นี้ยัง claim/report งานเดิมได้
    แต่ไม่สามารถ publish Local LLM inventory
11. Feature flag ต้องถูกตรวจทั้ง inventory route, catalog query, model resolution,
    job admission, claim-time guard และ Worker executor; ปิด flag ระหว่างงานกำลังรัน
    ให้จบตาม terminal policy แต่ห้ามสร้างงานใหม่
12. Catalog cache key ต้องรวม tenant, actor, feature-flag revision และ sharing-policy
    revision; share/membership/model-status changes ต้อง invalidate หรือ bypass cache
    สำหรับ dispatch ทันที

## 17. Implementation work packages

### WP1 — Shared contracts

- shared Zod/TypeScript schemas for model ref, inventory, invoke, result, errors
- protocol/version constants
- capability normalization and source metadata
- test fixtures for one/many providers and one/many models

### WP2 — Cloud projection and inventory

- Drizzle schema/migration/indexes
- inventory endpoint, revision guard, idempotency and stale projection
- owner-scoped read and projection reconciliation
- status projection and sanitized errors

### WP3 — Worker local AI registry

- provider/model metadata persistence
- OS keyring secret adapter
- OpenAI-compatible adapter
- Ollama discovery/native adapter only where needed
- model discovery/manual add/capability override/test

### WP4 — Unified catalog and all selectors

- actor-aware catalog service
- tRPC/API response contract
- audit direct consumers of `enabledLlmModels` and `llmProviders.availableModels`
- update Chat, Skill, Agent, Plugin/MCP and workflow LLM pickers
- preserve media-only picker filtering

### WP5 — Worker execution

- advertise `llm_gateway` capability
- add `llm_invoke` classification and executor path
- server dispatch/admission
- local model resolution and adapter invoke
- stream bridge, cancellation, lease and sequence handling
- result normalization, bounded payload/chunk handling and assignment-scoped event
  deduplication for `llm_invoke`

### WP6 — Sharing, billing and observability

- enforce Worker-owner-created Group policy
- reuse connected-worker sharing policy
- credit reservation/debit integration
- usage/audit events and source/worker metadata
- owner/member/revocation tests

### WP7 — Release and rollout

- tenant/user feature flags
- old Worker compatibility
- migration rehearsal and rollback behavior
- authenticated browser and real Worker smoke test

## 18. Test strategy

### Shared/backend unit tests

- actor-aware catalog includes owner models and active shared-group models
- excludes non-member, removed member, other tenant and revoked group
- owner-created Group validation
- heartbeat/registration cannot overwrite the server-owned sharing policy
- no duplicate model references across workers
- model status/last-seen projection
- inventory revision ordering and idempotency
- secret field rejection in inventory schema
- modelRef source discrimination
- global model routing remains unchanged

### Worker tests

- provider profile atomic save/update/delete
- cloud relay and local-only toggles default disabled until explicitly enabled
- secret never serialized to metadata/export/log
- keyring missing/session-only behavior
- base URL/auth/endpoint validation
- discovery success, unsupported discovery, manual model and malformed response
- accepted inventory mapping persists `localModelId -> modelRef` and rejects stale/mismatched job bindings
- capability detected/overridden/unknown
- multiple provider profiles and multiple model records
- one-model server behavior such as llama.cpp
- local model missing/disabled/provider unreachable
- bounded local queue, cancel-before-send and provider request cancellation
- LLM adapter completion, streaming, tool/structured-output gating and timeout

### Control-plane integration tests

- worker advertises `llm_gateway` only when ready
- claim filters owner and selected active Group members
- non-member job cannot be claimed
- stale/revoked share cannot dispatch new job
- worker/tenant/model binding mismatch is rejected
- cross-tenant Worker/owner projection writes are rejected atomically
- inventory endpoint rejects wrong worker token and cross-tenant access
- `llm_invoke` event sequence deduplicates/rejects stale attempt
- cancellation and expiration remain terminal and retryable where policy allows
- cancel race, late completion, provider-accepted lease expiry and no-double-inference
  retry behavior
- inventory replay, same-key/different-hash conflict, lower revision and concurrent
  accepted revisions
- concurrent duplicate stream-event insertion is one accepted event plus safe replay

### E2E acceptance flow

```text
Pair Worker
  -> add two local providers
  -> discover/add at least three models
  -> sync inventory
  -> owner sees all three in Chat and Skill selectors
  -> create Group and add member
  -> owner shares Worker to Group
  -> member sees all enabled models with Worker badge
  -> member selects one model
  -> Cloud creates llm_invoke job
  -> Worker claims and calls local endpoint
  -> stream appears in Web
  -> usage/audit records source worker
  -> revoke Group share
  -> member can no longer see/use model
```

### Required security tests

- User A cannot read User B Worker model projection
- User A cannot dispatch using User B modelRef
- Group member outside selected Group cannot use model
- Group from another tenant cannot be selected
- changing Group membership affects new catalog reads and dispatch
- no local endpoint/credential in Cloud API response or inventory payload
- no prompt/provider secret in diagnostics or error
- prompt/response retention, deletion/export and shared-Worker privacy disclosure
- HTTPS/redirect/TLS/URL validation, payload limits, rate limits and concurrency quotas
- explicit Worker model never falls back to Cloud
- worker token cannot invoke a different worker model
- old Worker cannot claim `llm_invoke`

## 19. Acceptance criteria

Feature 172 is complete only when all conditions below pass:

1. Worker owner adds at least two provider profiles and at least three local model
   records without creating global provider rows.
2. Worker App can discover models where supported and manually add a model where
   discovery is unavailable.
3. Every enabled model is represented by a stable Cloud `modelRef` and appears in
   the owner’s LLM selectors.
4. The same models appear for active members of every explicitly selected Group.
5. Models remain visible with clear disabled status when Worker/model is offline;
   they do not disappear merely because the Worker missed one heartbeat.
6. Non-members, removed members, users from other Tenants and revoked shares do not
   see selectable Worker models and cannot dispatch by guessing a modelRef.
7. Selecting a Worker model creates `llm_invoke` and calls the selected Worker;
   normal Cloud gateway is not called for that request.
8. Completion, streaming, cancellation, timeout, retry and duplicate event paths
   preserve existing Worker lease/sequence/idempotency rules.
9. Explicit Worker selection never silently falls back to Cloud; preference-based
   fallback is visible and policy-controlled.
10. Cloud inventory has no endpoint, username, password, API key, token, credential
    reference or local path.
11. Local credentials are stored in OS secure storage or are session-only; they
    never appear in WebView state, export, logs, crash reports or job payload.
12. Chat, Skill, Agent, Plugin/MCP and every other LLM selector use the same
    actor-aware catalog and preserve the Worker source metadata.
13. Global LLM provider/model routing and media model selection remain compatible.
14. Credit/usage/audit records charge and record the logical request once and show
    `sourceType=worker_app` and the selected Worker/model.
15. Feature flags can disable Worker LLM selection without deleting projection or
    history data.
16. Focused backend, Worker Rust, shared schema and authenticated browser tests
    pass; live local runtime tests must be reported separately from mocked tests.
17. A tenant-mode Worker cannot expose Local LLM models under v1 policy, and queued
    jobs are re-evaluated when sharing policy or membership changes.
18. Inventory replay/revision guards, cancellation races, bounded payload handling,
    retry safety, retention behavior and quota/concurrency limits have executable tests.
19. The Worker receives and validates the authoritative `localModelId`/`modelRef`
    mapping, and a heartbeat cannot alter sharing policy or claim a mismatched model.

## 20. Operational and rollout notes

- Start with one tenant/user feature flag and one supported adapter (`openai_compatible`)
- Enable Ollama discovery only after real endpoint smoke tests; do not infer support
  from the provider name alone
- Record inventory and model status transitions with worker/model/request IDs
- Monitor queue wait, model missing, provider unreachable, stream interruption,
  and claim-denied metrics separately
- Validate the exact active Worker ID and latest heartbeat when diagnosing queued jobs
- Before production enablement, perform a real Worker App run with at least two
  local models and one Group member; unit tests alone do not prove local endpoint
  connectivity, OS keyring behavior, browser catalog rendering or deployment
