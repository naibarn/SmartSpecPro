# Feature 032: Browser Automation Copilot — GPT-5.4 Integration + Live Research

## Overview

เพิ่มศักยภาพ Browser Automation Copilot (Feature 031) และ LLM Gateway ของ SmartSpecPro ให้รองรับ GPT-5.4 ผ่าน OpenAI Responses API พร้อม built-in `web_search` tool และ custom `browser.execute_actions` function tool เพื่อให้ระบบสามารถ:

1. **ค้นข้อมูลสดจากเว็บ** ผ่าน `web_search` tool ของ GPT-5.4 โดยตรง
2. **ควบคุมเบราว์เซอร์จริง** ผ่าน Playwright runner ใน OpenSandbox (แทน stub ที่มีอยู่)
3. **วิเคราะห์ intent + สร้าง script อัตโนมัติ** โดยเปิดใช้งาน LLM calls ที่ยังเป็น `NotImplementedError`
4. **เชื่อมต่อ Agencies workflow** ให้เรียก browser/search tools ผ่าน MCP/internal-tool registry

Feature นี้ไม่ได้สร้างระบบใหม่ — แต่ **ยกระดับระบบเดิมที่มีอยู่แล้ว** ให้ทำงานได้จริงและฉลาดขึ้น

---

## Current State Analysis

### สิ่งที่มีอยู่แล้วและทำงานได้

| Component | File | Status |
|-----------|------|--------|
| LLM Gateway (`/v1/chat/completions`) | `apps/web/server/_core/llmRoutes.ts` | Working — credit/rate-limit/streaming |
| URL resolver (รองรับ `responses` style) | `llmRoutes.ts:resolveApiUrl()` | Working — มี case `'responses'` แล้ว |
| Browser Tool Route (Node) | `apps/web/server/routes/browserTool.ts` | Working — credit reserve/refund + concurrency via Redis |
| Python Browser API | `python-backend/app/api/browser.py` | Working — internal token auth + BrowserSession |
| BrowserSession (SSRF/caps/allowlist) | `python-backend/app/services/tools/browser_tool.py` | Working — guards ทำงาน, `execute_actions()` เป็น stub |
| OpenSandbox Dispatcher | `python-backend/app/services/sandbox_dispatcher.py` | Working — รองรับ `execution_mode="browser"` แล้ว |
| Sandbox Job Worker | `python-backend/app/workers/sandbox_job_worker.py` | Working — process jobs from Celery queue |
| Sandbox Execution Modes | `python-backend/app/models/sandbox.py` | Working — `SandboxExecutionMode.BROWSER` มีอยู่แล้ว |
| Automation Copilot orchestrator | `python-backend/app/services/automation_copilot.py` | Partial — pipeline flow ออกแบบแล้ว |
| Script Generator (vision overlay) | `python-backend/app/services/playwright_script_generator.py` | Partial — overlay JS + models พร้อม |
| Self-Healing Executor | `python-backend/app/services/self_healing_executor.py` | Partial — retry loop พร้อม |
| Selector Cache | `python-backend/app/services/selector_cache.py` | Working |
| Browser Pool | `python-backend/app/services/browser_pool.py` | Working |
| URL Validator (SSRF) | `python-backend/app/services/url_validator.py` | Working — DNS rebinding defense |
| Automation Copilot tRPC Router | `apps/web/server/routers/automationCopilot.ts` | Working — analyze/execute/status/cancel/templates |
| AutomationChatModal UI | `apps/web/client/src/components/automation/AutomationChatModal.tsx` | Working — chat interface |
| Automation Copilot FastAPI | `python-backend/app/api/automation_copilot.py` | Working — POST analyze/execute, GET status, POST cancel |
| Automation Celery Tasks | `python-backend/app/tasks/automation_copilot_task.py` | Working — `automation_analyze_task`, `automation_execute_task` |
| Internal MCP Router | `python-backend/app/api/internal_mcp.py` | Working — tool dispatch + auth |
| Agency Orchestrator | `python-backend/app/orchestrator/agency_orchestrator.py` | Working — graph walker |
| Web Automation Executor (workflow node) | `python-backend/app/orchestrator/node_executors/web_automation_executor.py` | Stub — `NotImplementedError` |

### สิ่งที่ยังเป็น NotImplementedError (ต้องเปิดใช้งาน)

| Method | File | Line | ต้องทำอะไร |
|--------|------|------|-----------|
| `AutomationCopilot._analyze_intent()` | `automation_copilot.py:130` | LLM call วิเคราะห์ intent จาก prompt | เรียก LLM gateway ด้วย structured output |
| `PlaywrightScriptGenerator._vision_llm_call()` | `playwright_script_generator.py:243` | Vision LLM วิเคราะห์ screenshot + สร้าง actions | เรียก LLMGatewayClient → `/v1/chat/completions` ด้วย image input |
| `SelfHealingExecutor._diagnose_failure()` | `self_healing_executor.py:185` | Vision LLM วินิจฉัยปัญหาและแนะนำ selector ใหม่ (ปัจจุบัน return stub confidence=0.0) | เรียก LLMGatewayClient → `/v1/chat/completions` ด้วย failure screenshot |
| `WebAutomationExecutor.execute()` | `web_automation_executor.py:40` | Workflow node สำหรับ web automation | เรียก AutomationCopilot pipeline |

### สิ่งที่ยังไม่มี (ต้องสร้างใหม่)

| Component | Description |
|-----------|-------------|
| `/v1/responses` endpoint ใน LLM Gateway | Proxy สำหรับ OpenAI Responses API (REST+SSE) |
| Responses API usage parser | Parse `usage` จาก Responses API format เพื่อคิดเครดิต |
| Tool-call loop handler | จัดการ `function_call_output` round-trips |
| OpenSandbox browser runner image | Docker image + entrypoint สำหรับ Playwright ใน sandbox |
| MCP tool definitions สำหรับ browser/search | ลงทะเบียน tools ใน internal MCP router |
| `LLMGatewayClient` (Python → Node HTTP) | `app/services/llm_gateway_client.py` — HTTP client สำหรับ Python services เรียก Node gateway |
| Search result cache layer | Redis cache สำหรับ web_search results (TTL-based) |

---

## Architecture

### Design Principles

- **Single Gateway, Multiple Tools**: LLM Gateway เป็นจุดเดียวสำหรับเครดิต/policy/logging — ทุก LLM call ต้องผ่าน gateway
- **Tools are Capabilities**: GPT-5.4 เรียก 2 ประเภท:
  - Built-in: `web_search` — ค้นข้อมูลสดผ่าน OpenAI
  - Custom function: `browser.execute_actions` — ควบคุมเบราว์เซอร์ผ่าน sandbox
- **Execution Isolation**: เบราว์เซอร์และคำสั่งระบบต้องรันใน OpenSandbox เท่านั้น
- **Converged Substrate**: Browser tool และ Automation Copilot ใช้ execution substrate เดียวกัน (OpenSandbox + Playwright) เพื่อลด attack surface

### Target Architecture

```
                              +-------------+
                              |   Nginx     | :80/:443
                              | (SSL/proxy) |
                              +------+------+
                     +---------------+---------------+
                     v               v               v
              +-----------+   +----------+   +--------------+
              | Web :3000 |   | Python   |   | Control      |
              | React+tRPC|   | Backend  |   | Plane :7070  |
              +-----+-----+   | :8000    |   +--------------+
                    |         +----+-----+
                    v              v
              +-----------+  +----------+
              | LLM GW    |  | Internal |
              | /v1/resp  |  | MCP      |
              | /v1/chat  |  | /tools   |
              +-----+-----+  +----+-----+
                    |              |
           +--------+--------+    |
           v                 v    v
   +---------------+  +----------+--------+
   | OpenAI API    |  | Browser Tool Route |
   | GPT-5.4       |  | /api/internal/     |
   | web_search    |  | tools/browser      |
   +---------------+  +--------+----------+
                               |
                        +------v------+
                        | Python API  |
                        | /api/browser|
                        | /execute    |
                        +------+------+
                               |
                      +--------v--------+
                      | SandboxDispatch |
                      | execution_mode= |
                      | "browser"       |
                      +--------+--------+
                               |
                      +--------v--------+
                      | OpenSandbox     |
                      | Playwright      |
                      | Runner          |
                      +--------+--------+
                               |
                      +--------v--------+
                      | Public Websites |
                      +-----------------+
```

### Sequence: "ค้นข้อมูลสด + browse + สรุป"

**สำคัญ**: `web_search` เป็น **hosted/built-in tool** ของ OpenAI — OpenAI ดำเนินการ search ภายในและส่งผลลัพธ์กลับมาใน response โดยตรง Gateway ไม่ต้อง dispatch web_search เอง ต่างจาก custom function tool (`browser.execute_actions`) ที่ต้อง dispatch ด้วย tool-call loop

```
UI -> Node LLM Gateway: POST /v1/responses
    {model: "gpt-5.4", tools: [web_search, browser.execute_actions], store: false}

Node LLM Gateway -> OpenAI: responses.create (store=false)

--- web_search (hosted tool — OpenAI จัดการเอง) ---
OpenAI (internal): ดำเนินการ web_search, ส่งผลลัพธ์กลับพร้อม web_search_call items
OpenAI --> Node LLM Gateway: response มี web_search_call (status: completed) + citations
    (Gateway ไม่ต้อง dispatch — แค่นับจำนวน search calls เพื่อคิดค่าใช้จ่าย)

--- browser.execute_actions (custom function tool — ต้อง dispatch) ---
OpenAI --> Node LLM Gateway: function_call: browser.execute_actions(actions=[...])
Node LLM Gateway -> Browser Tool Route: POST /api/internal/tools/browser
    (reserve credits, check concurrency)
Browser Tool Route -> Python /api/browser/execute: X-Internal-Token
Python -> SandboxDispatcher: dispatch(execution_mode="browser")
SandboxDispatcher -> Celery -> OpenSandbox: Playwright runner
OpenSandbox --> Python: results (screenshots/extracted data)
Python --> Browser Tool Route: actual_cost + results
Browser Tool Route --> Node LLM Gateway: tool_output

Node LLM Gateway -> OpenAI: function_call_output (structured result)
OpenAI --> Node LLM Gateway: final response (with citations + extracted data)
Node LLM Gateway --> UI: stream/JSON response
```

---

## Implementation Sections

### Section 1: Responses API Proxy (`/v1/responses`)

**หมายเหตุ: ไม่ใช่เส้นทาง LLM ใหม่** — เป็นส่วนขยายของ gateway เดิม ใช้ infrastructure เดียวกับ `/v1/chat/completions` ทั้งหมด (credit deduction, rate limiting, audit logging) แค่รองรับ Responses API request/response format เพิ่มเติม

**Files to modify:**
- `apps/web/server/_core/llmRoutes.ts` — เพิ่ม endpoint ใน gateway เดิม

**What to do:**
- เพิ่ม `POST /v1/responses` ใน `registerLLMRoutes()` ข้าง `/v1/chat/completions`
- **ใช้ infrastructure เดิมทุกอย่าง**: `llmLimiter`, `guardWithCredits()`, `getActiveLlmProvider()`, `resolveProviderModelAny()`, `deductCreditsForUsage()`
- `resolveApiUrl()` มี case `'responses'` อยู่แล้ว — ใช้ได้เลย
- **Model availability**: ใช้ `resolveProviderModelAny(model)` → ตรวจ `model_provider_map` ว่า model enabled → ถ้า model ไม่มีหรือ disabled → reject request พร้อมแจ้ง available models
- สร้าง `sanitizeResponsesBody(body)`:
  - enforce `store: false` เป็น default (ZDR compliance)
  - validate: ต้องมี `model` + `input`
  - strip fields ที่ไม่อนุญาต
- สร้าง `proxyResponsesStreamWithCredits()`:
  - SSE streaming คล้าย `proxyChatWithCredits()` แต่ parse Responses API event format
  - สะสม usage จาก `response.completed` event
- สร้าง `proxyResponsesJsonWithCredits()`:
  - สำหรับ non-streaming mode
  - parse `usage` จาก response body
- **Tool-call loop handler** (เฉพาะ **custom function tools** เท่านั้น):
  - **สำคัญ**: `web_search` เป็น hosted/built-in tool — OpenAI ดำเนินการภายใน ไม่ส่ง function_call กลับมา → ไม่ต้อง dispatch, แค่นับจำนวน `web_search_call` items จาก response เพื่อ track cost
  - เมื่อ response มี `output` ที่เป็น `function_call` items (เฉพาะ custom tools เช่น `browser.execute_actions`):
    - dispatch ไปที่ internal tool handler (browser tool route)
    - ส่ง `function_call_output` กลับไป OpenAI
    - วน loop จนได้ final response
  - ตั้ง max tool rounds (default 10) เพื่อป้องกัน infinite loop
  - **Error handling ระหว่าง loop**:
    - ถ้า tool call fail (browser error, timeout, SSRF block): ส่ง `function_call_output` กลับ OpenAI พร้อม `{ "error": "<message>" }` เพื่อให้ model ตัดสินใจ (retry/skip/report)
    - ถ้า credit หมดกลาง loop: ส่ง error output + หยุด loop, return partial results ที่มี
    - ถ้า OpenAI return HTTP error ระหว่าง loop (5xx/429): retry ตาม exponential backoff (max 3), ถ้ายังไม่ได้ → abort loop + return partial
    - ทุก tool round ต้องสะสม usage/credits — ถ้า abort กลาง loop ต้อง deduct credits ตาม usage จริง
- **Usage parsing** สำหรับ Responses API:
  - `response.usage.input_tokens`, `output_tokens`
  - คำนวณเครดิตเหมือน chat completions (reuse `deductCreditsForUsage()`)
  - เพิ่ม `web_search` cost tracking: นับจำนวน search calls จาก tool_call events

**Constraints:**
- ห้าม client เรียก OpenAI โดยตรง — ต้องผ่าน gateway เสมอ
- `store=false` เป็น default; ถ้า policy อนุญาตจึงจะ `store=true` ได้
- timeout 600 วินาที (เหมือน chat completions)

### Section 2: Browser Runner ใน OpenSandbox

**Files to modify:**
- `python-backend/app/services/tools/browser_tool.py` — เปลี่ยน stub เป็น real dispatch
- `python-backend/app/services/sandbox_profiles.py` — เพิ่ม profile mapping
- สร้างใหม่: `docker/sandbox-runners/browser-runner/` — Dockerfile + entrypoint

**What to do:**

#### 2.1 Browser Runner Docker Image
- สร้าง `Dockerfile` ที่ install Playwright + Chromium headless
- สร้าง `entrypoint.py` ที่:
  - รับ manifest JSON จาก stdin/file
  - สร้าง Playwright browser instance
  - execute actions ตาม manifest (goto, click, type, extract, screenshot)
  - output results เป็น JSON ไปยัง stdout/file
  - enforce caps: `MAX_ACTIONS`, `MAX_PAGES`, `MAX_SCREENSHOTS`, `MAX_OUTPUT_SIZE`
  - **ห้าม** `page.evaluate()` ด้วย input จาก user/LLM — ใช้ locator built-in เท่านั้น

#### 2.2 BrowserSession.execute_actions() — Real Implementation
- แทน stub ด้วยการเรียก `SandboxDispatcher.dispatch()`:
  ```python
  job_id = await dispatcher.dispatch(
      feature_type="connector",
      execution_mode="browser",
      tenant_id=self.tenant_id,
      user_id=self.user_id,
      inputs=manifest,
  )
  result = await wait_job(job_id)
  ```
- คงไว้: SSRF guard (`validate_url_with_dns`), allowlist check, concurrency guard, caps validation
- Return: screenshots (signed URL), extracted data, metrics, `actual_cost`

#### 2.3 Sandbox Profile Mapping
- เพิ่ม mapping ใน `FEATURE_PROFILE_MAP`:
  ```python
  "connector-browser-default": profile_id
  ```
- สร้าง sandbox profile record ใน DB (หรือ seed script)

**Constraints:**
- Playwright ต้องรันใน sandbox เท่านั้น — ห้ามรันบน host
- Network ใน sandbox: default deny, อนุญาตเฉพาะ domains ใน allowlist
- ห้าม `page.evaluate()` ด้วย user/LLM-generated JS
- Max concurrent browser sessions: per-user=1, per-tenant=2 (ตาม Redis semaphore ใน `browserTool.ts`)
- Browser tool pre-reserve: 20 credits (ตาม `BROWSER_RESERVE_CREDITS`)
- เพิ่ม `MAX_ACTIONS` (50) และ `MAX_PAGES` (5) caps ที่ยังไม่มีใน `browser_tool.py`

**Gap to fix (Node-side validation):**
- ปัจจุบัน Node route หักเครดิตก่อนที่ Python จะ validate domains — ถ้า domain ไม่ถูกต้อง เครดิตถูก refund แต่เสียเวลา
- แนะนำ: เพิ่ม allowlist validation ที่ Node layer ก่อน `deductCredits()` เพื่อ fail fast

### Section 3: เปิดใช้งาน LLM Calls ใน Automation Copilot

**Files to modify:**
- `python-backend/app/services/automation_copilot.py`
- `python-backend/app/services/playwright_script_generator.py`
- `python-backend/app/services/self_healing_executor.py`
- `python-backend/app/orchestrator/node_executors/web_automation_executor.py`

**What to do:**

#### 3.0 LLM Call Path สำหรับ Python Services (สำคัญ — ต้องตัดสินใจก่อน)

**หลักการ: ห้ามสร้างเส้นทาง LLM ใหม่ — ทุก LLM call ต้องผ่าน gateway เดิม**

Python services (automation_copilot, script_generator, self_healing_executor) ต้องเรียก LLM ผ่าน **Node gateway `/v1/chat/completions` ที่มีอยู่เดิม** เพื่อ:
- ✅ หักเครดิตถูกต้องผ่าน `guardWithCredits()` → `deductCreditsForUsage()`
- ✅ Rate-limit ผ่าน `llmLimiter` + `acquireProviderSlot()`
- ✅ Audit logging ผ่าน `costTracker.logRequest()`
- ✅ Model availability check ผ่าน `model_provider_map` (isEnabled + apiStyle)
- ❌ **ห้ามเรียก OpenAI API โดยตรงจาก Python** — จะ bypass credit/audit ทั้งหมด

**ตัดสินใจ: สร้าง `LLMGatewayClient`** — HTTP client ที่เรียก **endpoint เดิม** `/v1/chat/completions` ผ่าน internal HTTP

**Model Availability Enforcement:**
Gateway เดิมมีระบบ resolve model อยู่แล้ว:
1. Client ส่ง `model: "gpt-5.4"` → gateway เรียก `resolveProviderModelAny(modelId)`
2. Query `model_provider_map` WHERE `isEnabled=true` ORDER BY `priority`
3. ได้ `providerModelId` + `apiStyle` (เช่น `'chat-completions'` หรือ `'responses'`)
4. `resolveApiUrl()` ใช้ `apiStyle` เลือก upstream endpoint ที่ถูกต้อง
5. ถ้า model ไม่มีใน `model_provider_map` หรือ disabled → ใช้ default model

`LLMGatewayClient` ควรเพิ่ม method สำหรับ query available models:
```python
async def list_available_models(self, category: str = None) -> list[dict]:
    """Query gateway for enabled models from model_provider_map."""
```

เพื่อให้ Python services เลือกใช้เฉพาะ model ที่ enabled ใน gateway เท่านั้น

**Model Fallback Strategy:**
```
_analyze_intent():  gpt-5.4 → gpt-4o → gpt-4o-mini (ตาม priority ใน model_provider_map)
_vision_llm_call(): gpt-4o (vision-capable, ตาม vision_model setting)
_diagnose_failure(): gpt-4o (vision-capable)
```
ถ้า model ที่ต้องการ disabled ใน `model_provider_map` → ใช้ model ถัดไปตาม priority

**Auth สำหรับ Internal Calls:**
Codebase มี 2 token patterns:
- `X-Internal-Token` → ตรวจกับ `ENV.webGatewayToken` (ใช้ใน `browserTool.ts`)
- `X-Proxy-Token` → ตรวจกับ `SMARTSPEC_PROXY_TOKEN` (ใช้ใน `internal_mcp.py`, `automationCopilot.ts`)

Gateway `/v1/chat/completions` ปัจจุบันใช้ JWT auth (session/bearer) → ต้องเพิ่ม internal token check:
- เพิ่ม `X-Internal-Token` check ใน `guardWithCredits()` เพื่อรองรับ service-to-service calls
- เมื่อ request มาจาก internal token: ใช้ service account userId สำหรับ credit deduction
- **ทางเลือก**: สร้าง service account ใน DB ที่มี JWT token ถาวร + credit pool สำหรับ internal calls

```python
# python-backend/app/services/llm_gateway_client.py
class LLMGatewayClient:
    """HTTP client สำหรับเรียก Node.js LLM gateway จาก Python services.

    ใช้ endpoint เดิม /v1/chat/completions — ห้ามสร้าง LLM path ใหม่
    """

    async def chat_completion(self, messages, model, response_format=None) -> dict:
        """Call /v1/chat/completions via internal HTTP.

        Gateway จะ resolve model จาก model_provider_map
        และหักเครดิตอัตโนมัติ
        """

    async def vision_call(self, messages_with_images, model) -> dict:
        """Call /v1/chat/completions with base64 image inputs."""

    async def list_available_models(self, category: str = None) -> list[dict]:
        """Query available models from model_provider_map via gateway."""
```

#### 3.1 `_analyze_intent()` — Intent Analysis via LLM
- แทน `NotImplementedError` ด้วย LLM call ผ่าน `LLMGatewayClient`:
  - เรียก `gateway_client.chat_completion()` → Node `/v1/chat/completions`
  - System prompt: "Analyze user automation request and return structured AutomationIntent"
  - Output: JSON ตาม `AutomationIntent` schema (intent_type, confidence, browser_tasks, etc.)
  - ใช้ `response_format: { type: "json_schema" }` หรือ structured output
- Fallback: ถ้า LLM ไม่ตอบ JSON ที่ถูกต้อง → return `needs_clarification` พร้อม generic questions
- **Model fallback**: ใช้ `model_provider_map` priority — ถ้า primary model ไม่ available (disabled/error) → gateway เลือก model ถัดไปตาม priority อัตโนมัติ. `LLMGatewayClient` ควร retry ด้วย model ถัดไปจาก `list_available_models()` ถ้า request fail

#### 3.2 `_vision_llm_call()` — Vision-based Element Identification
- แทน `NotImplementedError` ด้วย Vision LLM call ผ่าน `LLMGatewayClient`:
  - เรียก `gateway_client.vision_call()` → Node `/v1/chat/completions` ด้วย image content
  - ส่ง screenshot (base64) + numbered overlay ของ page
  - System prompt: "Identify interactive elements in the screenshot that match the user's goal"
  - Output: list of `IdentifiedElement` (element_index, action_type, value, confidence)
- Model: ใช้ `vision_model` จาก config (default: gpt-4o — vision-capable model)
- ค่าความมั่นใจ: ใช้ `CONFIDENCE_THRESHOLD = 0.7` ที่กำหนดไว้แล้ว
- **หมายเหตุ**: vision call ใช้ `/v1/chat/completions` (ไม่ใช่ `/v1/responses`) เพราะเป็น single-turn call ไม่ต้องการ tool loop

#### 3.3 `_diagnose_failure()` — Self-Healing Diagnosis
- ปัจจุบัน return `FailureDiagnosis` stub ที่มี `confidence=0.0` (ไม่ใช่ NotImplementedError แต่ไม่มีประโยชน์เพราะ confidence=0 ทำให้ self-heal ไม่ทำงาน)
- เปลี่ยนจาก stub เป็น real Vision LLM call ผ่าน `LLMGatewayClient`:
  - เรียก `gateway_client.vision_call()` ด้วย failure screenshot + error message + failed action
  - Output: `FailureDiagnosis` (root_cause, suggested_new_selector, confidence)
  - **ห้าม** แนะนำ JS arbitrary evaluate — ให้แนะนำเฉพาะ CSS/aria/data-testid selectors
- Max heal attempts: 3 (คงตาม logic ที่มีอยู่)
- Invalidate selector cache เมื่อ heal สำเร็จ

#### 3.4 `WebAutomationExecutor.execute()` — Workflow Node Integration
- แทน `NotImplementedError` ด้วย:
  ```python
  copilot = AutomationCopilot(script_generator, executor)
  result = await copilot.analyze(inputs["prompt"], context["tenant_id"], context["user_id"])
  if result.status == "needs_clarification":
      return {"status": "needs_input", "questions": result.questions}
  build = await copilot.build(...)
  exec_result = await copilot.execute(...)
  return {"extracted_data": exec_result.extracted_data, "screenshots": exec_result.screenshots}
  ```

**Constraints:**
- ทุก LLM call ต้องผ่าน gateway (ไม่เรียก OpenAI API โดยตรง)
- ไม่ log ค่า secrets ที่ใส่ในช่อง fill/type
- Vision model ต้อง configurable per-tenant ผ่าน system_settings

### Section 4: web_search Integration + Cache

**Files to create/modify:**
- สร้างใหม่: `apps/web/server/services/searchResultCache.ts`
- `apps/web/server/_core/llmRoutes.ts` — เพิ่ม search cost tracking

**What to do:**

#### 4.1 Search Result Cache

**สำคัญ**: `web_search` เป็น built-in tool ของ OpenAI — SmartSpecPro ไม่ได้เรียก search engine เอง แต่ OpenAI ทำ search แล้วส่งผลลัพธ์กลับมาใน tool output ดังนั้น cache ที่ SmartSpecPro ทำได้คือ **cache ผลลัพธ์ที่เคยเห็น** เพื่อ:
1. ลดค่าใช้จ่ายเมื่อ user ค้นหาซ้ำ (ส่ง cached result แทนทำ Responses API call ใหม่)
2. ให้ agent recall ข้อมูลที่เคยค้นมาแล้วใน conversation

- Redis-based cache:
  - Key: `search_cache:{hash(query)}` → result snippets + citations + timestamp
  - TTL: 15-60 นาที (ปรับตาม topic type)
  - Bypass cache เมื่อ user ระบุ "ล่าสุด/วันนี้" หรือ freshness requirement
  - **Cache population**: extract search results จาก Responses API tool output events แล้วเก็บ
- Track source metadata: `source_url`, `retrieved_at`, `content_hash` สำหรับ audit

#### 4.2 Search Cost Tracking
- นับจำนวน `web_search` tool calls จาก Responses API output
- คำนวณค่าใช้จ่าย: $10/1k calls + search content tokens ตาม model input rate
- บันทึกใน `provider_usage_log` แยก line item สำหรับ search costs
- ตั้ง per-run quota: max search calls per request (default 5, configurable)

#### 4.3 Freshness Policy
- ถ้า user prompt มี keyword ที่บ่งบอก freshness ("ล่าสุด", "วันนี้", "ราคาปัจจุบัน"):
  - bypass cache
  - ระบุ `retrieved_at` timestamp ใน output
- ระบุ citations/source URLs ใน response เสมอ

### Section 5: MCP/Tool Registry สำหรับ Agencies

**Files to modify:**
- `python-backend/app/api/internal_mcp.py` — เพิ่ม tool definitions
- `apps/web/server/routes/browserTool.ts` — ปรับให้รับ context จาก MCP calls

**What to do:**

#### 5.1 เพิ่ม Tool Definitions ใน Internal MCP
- ลงทะเบียน tool `browser.execute_actions`:
  - Parameters schema: `allowed_domains`, `actions[]`, `session_id?`, `timeout_seconds?`
  - Dispatch: เรียกกลับไปที่ Node browser tool route (เพื่อ reuse credit/concurrency controls)
  - Context: ต้องส่ง `user_id`, `tenant_id` ทุกครั้ง
- ลงทะเบียน tool `sandbox.exec_command`:
  - Parameters schema: `command`, `working_dir?`, `timeout_seconds?`
  - Dispatch: เรียก `SandboxDispatcher` ด้วย `execution_mode="command"`
- Tool definitions ต้อง return ผ่าน `/tools` endpoint ที่มีอยู่

#### 5.2 Agency Integration
- เมื่อ agency workflow มี node ที่ต้องการ browser/search:
  - เรียกผ่าน MCP tool call → Node browser tool route → Python → Sandbox
  - Credit/concurrency ถูก enforce ที่ Node layer เหมือนเดิม
- `persona_prefix` injection guard ที่มีอยู่ต้องไม่ถูก bypass เมื่อเพิ่ม tools

### Section 6: Automation Copilot Credit Flow + Frontend UI

**Files to modify:**
- `apps/web/server/routers/automationCopilot.ts` — ปรับ credit flow
- `apps/web/client/src/components/automation/AutomationChatModal.tsx` — เพิ่ม web_search + browse mode

**What to do:**

#### 6.1 Credit Flow Clarification
สถานะปัจจุบัน (ต้องเข้าใจก่อน implement):
- **Analyze**: ตรวจ balance ≥ `MIN_CREDITS_TO_START` (10) แต่ **ไม่หักเครดิต** — เป็น balance check เท่านั้น
- **Execute**: pre-reserve `CREDIT_RESERVE_AMOUNT` (100 credits) ด้วย `deductCredits()` แล้ว refund ส่วนเกินเมื่อเสร็จ
- **Browser Tool**: pre-reserve 20 credits (แยกจาก execute), refund ตาม `actual_cost`

เพิ่มเติมสำหรับ Feature 032:
- เมื่อ execute ใช้ browser tool ภายใน: ต้อง coordinate credit reserve ระหว่าง automation copilot (100) กับ browser tool (20) ไม่ให้หักซ้ำ
- เมื่อใช้ web_search: เพิ่ม cost tracking สำหรับ search calls ($0.01/call) ใน credit deduction
- แนะนำ: เพิ่ม `cost_estimate` ใน analyze response เพื่อให้ user เห็นประมาณการก่อน execute

#### 6.2 Frontend UI Enhancements
AutomationChatModal มีอยู่แล้ว — เพิ่ม:
- **Research + Browse mode**: toggle ให้ user เลือก "แค่ค้นข้อมูล" vs "ค้น + เปิดเว็บ"
- **Cost estimate display**: แสดงประมาณการเครดิตก่อน execute
- **Live progress**: แสดง tool calls ที่กำลังทำ (web_search, browser action) แบบ real-time ผ่าน status polling
- **Citations panel**: แสดง source URLs + retrieved_at จาก web_search results
- **Allowed domains input**: ให้ user ระบุ domains ที่อนุญาต (ข้าง tenant allowlist)

### Section 7: Security Controls + Audit

**Files to modify:**
- `python-backend/app/services/tools/browser_tool.py` — เพิ่ม audit events
- `apps/web/server/_core/llmRoutes.ts` — เพิ่ม audit สำหรับ /v1/responses

**What to do:**

#### 7.1 Prompt Injection Mitigation
- ทุก tool output ที่มาจาก web_search หรือ browser extract:
  - ถือว่าเป็น untrusted content
  - ไม่นำไปใช้เป็น system prompt โดยตรง
  - Log tool outputs สำหรับ audit (redact PII/secrets)
- `tool_choice` enforcement: limit ให้ agent เรียกได้เฉพาะ tools ที่ registered
- Sanitize tool outputs ก่อนส่งกลับ OpenAI

#### 7.2 SSRF Defense-in-Depth (คงตามที่มี + เสริม)
- Pre-check: `validate_url_with_dns()` ก่อน dispatch — มีอยู่แล้ว
- Runtime: `page.route()` intercept ใน sandbox runner — ต้องเพิ่มใน entrypoint
- Block CIDRs: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.169.254/32`
- DNS rebinding: resolve DNS ก่อน request + block ถ้า resolve เป็น private IP

#### 7.3 Audit Logging
- เพิ่ม audit events สำหรับ:
  - `browser_tool_call`: domains, action count, cost, outcome
  - `web_search_call`: query (redacted), result count, latency
  - `responses_api_call`: model, tool_calls count, total tokens, cost
- Format: JSONL ตาม pattern ที่มีอยู่ใน `apps/web/logs/audit/`
- OpenSandbox มี audit JSONL อยู่แล้ว — คง lifecycle events ไว้

#### 7.4 Redaction Policy
- ไม่ log ค่า `type/fill` actions ที่เป็น password/token
- Screenshots: จำกัดจำนวนต่อ session ตาม caps
- สามารถ blur `input[type=password]` ใน screenshots (optional, phase 2)

#### 7.5 Data Retention
- Responses API: `store=false` เป็น default
- หลีกเลี่ยง background mode ถ้าต้องการ ZDR (background mode เก็บข้อมูล ~10 นาที)
- Browser screenshots: เก็บตาม media retention policy (12 วัน)

---

## Browser Action Schema

อ้างอิง schema ที่มีอยู่ใน `browser_tool.py` + เพิ่มเติม:

| type | fields | Security notes |
|------|--------|---------------|
| `goto` | `url` | ต้องผ่าน allowlist + DNS rebinding check |
| `click` | `selector` / `role`+`name` | แนะนำ aria/data-testid/text locators |
| `type` / `fill` | `selector`, `text` | ห้าม log ค่า text ที่เป็น secret |
| `select` | `selector`, `value` | |
| `wait` | `ms` | จำกัด max เพื่อป้องกัน stall |
| `screenshot` | `label?` | จำกัดจำนวนต่อ session |
| `extract` | `selector`, `format` (`text`/`attr`/`html`) | จำกัดขนาด output |
| `open_tab` | `url?` | นับรวมใน pages_loaded cap |
| `close_tab` | `tab_id?` | |
| `focus_tab` | `tab_id` | |

### Validation Rules (must enforce)

ค่า caps ปัจจุบัน (จาก `browser_tool.py`):

| Constant | Current Value | Notes |
|----------|--------------|-------|
| `MAX_TEXT_LENGTH` | 50,000 chars | ต่อ extract action |
| `MAX_SCREENSHOTS` | 5 | ต่อ session |
| `MAX_LINKS` | 200 | ต่อ extract action |
| `MAX_SCREENSHOT_SIZE` | 1 MB | ต่อ screenshot |
| `MAX_TOTAL_OUTPUT` | 200 KB | ผลรวม extracted data ต่อ session |
| `SESSION_TIMEOUT` | 300 s | per-session timeout |
| `MAX_ACTIONS` | ไม่มี cap — ต้องเพิ่ม | แนะนำ default 50 |
| `MAX_PAGES` | ไม่มี cap — ต้องเพิ่ม | แนะนำ default 5 |

- ค่าเหล่านี้ปรับได้ตาม tenant policy หรือ admin settings
- **ห้าม** `page.evaluate()` ด้วย JS ที่มาจาก user/LLM — ใช้ locator built-in เท่านั้น

---

## Responses API Payload Examples

### Request (REST/SSE)

```json
{
  "model": "gpt-5.4",
  "store": false,
  "stream": true,
  "input": [
    {
      "role": "developer",
      "content": [
        { "type": "input_text", "text": "You are a research + browser agent. Use tools safely. Always cite sources." }
      ]
    },
    {
      "role": "user",
      "content": [
        { "type": "input_text", "text": "ค้นหาราคาสินค้า X จากเว็บไซต์การค้า แล้วเปิดเว็บเพื่อยืนยัน จากนั้นสรุปเป็นตาราง" }
      ]
    }
  ],
  "tools": [
    { "type": "web_search" },
    {
      "type": "function",
      "name": "browser.execute_actions",
      "description": "Execute safe browser actions in sandboxed Playwright. Returns screenshots and extracted data.",
      "parameters": {
        "type": "object",
        "properties": {
          "session_id": { "type": "string", "description": "Optional session ID for reuse" },
          "allowed_domains": {
            "type": "array",
            "items": { "type": "string" },
            "description": "Domains allowed to navigate (supports wildcards like *.example.com)"
          },
          "actions": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "type": { "type": "string", "enum": ["goto", "click", "type", "fill", "select", "wait", "screenshot", "extract", "open_tab", "close_tab", "focus_tab"] },
                "url": { "type": "string" },
                "selector": { "type": "string" },
                "text": { "type": "string" },
                "value": { "type": "string" },
                "ms": { "type": "number" },
                "label": { "type": "string" },
                "format": { "type": "string", "enum": ["text", "attr", "html"] },
                "tab_id": { "type": "string" }
              },
              "required": ["type"]
            }
          }
        },
        "required": ["allowed_domains", "actions"]
      }
    }
  ]
}
```

### Tool Output (browser.execute_actions)

```json
{
  "sessionId": "sess_abc123",
  "results": [
    { "ok": true, "type": "goto", "url": "https://example.com" },
    { "ok": true, "type": "click", "selector": "text=Pricing" },
    { "ok": true, "type": "extract", "data": { "text": "Basic Plan: $29/mo" } },
    { "ok": true, "type": "screenshot", "url": "https://storage.example.com/screenshots/ss_001.png" }
  ],
  "actualCost": 37,
  "screenshotsTaken": 1,
  "pagesLoaded": 1,
  "wallTimeMs": 4500
}
```

---

## Cost Model

### GPT-5.4 Token Pricing

| Type | Rate |
|------|------|
| Input tokens | $2.50 / 1M |
| Cached input | $1.25 / 1M |
| Output tokens | $15.00 / 1M |
| Input >272K context | 2x input rate |
| Output >272K context | 1.5x output rate |

### web_search Tool Costs

| Type | Rate |
|------|------|
| Search calls | $10 / 1k calls |
| Search content tokens | Billed at model input rate |

### Credit Conversion

- ใช้ `creditService` / `deductCreditsForUsage()` ที่มีอยู่ (`apps/web/server/services/creditService.ts`)
- Exchange rate: **1 credit = $0.001 USD** (ตัวคูณ 1000x) — `calculateCreditsFromCost(costUsd)` = `costUsd * 1000`
- Dynamic pricing: query `model_provider_map` table (columns: `pricingInput`, `pricingOutput` per 1M tokens)
- ต้องเพิ่ม GPT-5.4 entry ใน `model_provider_map` ด้วยราคาข้างต้น
- เพิ่ม web_search cost เป็น separate line item ใน `provider_usage_log`
- sourceType สำหรับ browser automation: `browser_automation` (มีอยู่แล้วใน creditTransactions enum)

---

## Configuration Keys

### Feature Flags + System Settings

ระบบ feature flags ของ SmartSpecPro มี 2 ระดับ:
1. **Global flags** — Redis-backed (`feature-flag:{name}`) + env var fallback → ใช้สำหรับ infrastructure toggles
2. **Tenant flags** — `tenants.featureFlags` JSON column (validated against `ALLOWED_FEATURE_FLAGS`) → ใช้สำหรับ per-tenant capabilities

สำหรับ settings ที่ซับซ้อนกว่า boolean ใช้ `system_settings` table ด้วย key pattern `{key}_{tenantId}` (เนื่องจากไม่มี `tenantId` column):

| Key / Flag | Storage | Default | Description |
|------------|---------|---------|-------------|
| `browserTool` | `tenants.featureFlags` (JSON) | `false` | Feature flag per-tenant (มีอยู่แล้ว) |
| `allowed_domains_{tenantId}` | `system_settings` (category: `automation`) | `[]` | Tenant allowlist (JSON array, มีอยู่แล้ว) |
| `vision_model_{tenantId}` | `system_settings` (category: `automation`) | `gpt-4o` | Vision model for copilot (ต้อง vision-capable) |
| `max_browser_sessions_{tenantId}` | `system_settings` (category: `automation`) | `3` | Max concurrent sessions |
| `max_search_calls_per_request` | `system_settings` (category: `llm`) | `5` | Global default |
| `responses_api_enabled` | Redis feature flag (`feature-flag:*`) | `false` | Global flag for /v1/responses (infrastructure-level, ไม่ใช่ per-tenant เพราะเป็น endpoint toggle) |

---

## Testing Plan

### Existing Tests (102 tests จาก Feature 031)

Feature 031 มี test suite อยู่แล้ว — ต้องไม่ break:
- `tests/test_automation_copilot.py`
- `tests/test_playwright_script_generator.py`
- `tests/test_self_healing_executor.py`
- `tests/test_web_automation_node.py`
- `tests/test_sandbox_dispatcher.py`
- `tests/test_sandbox_job_worker.py`

### New Tests to Add

#### Gateway `/v1/responses`
- Schema validation: reject invalid payload (missing `model`/`input`)
- Credit accounting: success / partial-fail / tool-call-heavy
- SSE streaming: delta events proxied correctly
- Tool-call loop: function_call → dispatch → output → continue
- Max tool rounds: ตัดที่ limit
- `store=false` enforcement

#### web_search
- Cache hit/miss behavior
- Freshness bypass keywords
- Cost tracking (search calls counted correctly)
- Per-run quota enforcement

#### Browser Tool Runner (OpenSandbox)
- Allowlist enforcement: domain นอก allowlist ถูก block
- DNS rebinding: hostname resolve เป็น private IP → fail
- Caps enforcement: เกิน MAX_ACTIONS/OUTPUT/SCREENSHOTS → 422
- Redaction: ไม่ log secrets ใน fill/type actions

#### Automation Copilot Integration
- `_analyze_intent()`: return valid AutomationIntent JSON
- `_vision_llm_call()`: return valid IdentifiedElement list
- `_diagnose_failure()`: return valid FailureDiagnosis (ไม่แนะนำ JS evaluate)
- Self-heal loop: เปลี่ยน selector แล้ว retry ≤3 ครั้ง + invalidate cache

#### Agencies Workflow
- MCP tool call → browser.execute_actions → ผ่าน gateway → ผลลัพธ์ถูกต้อง
- persona_prefix injection guard ไม่ถูก bypass

---

## Rollout Plan

### Phase 1: Foundation (Week 1)
1. เพิ่ม `/v1/responses` endpoint ใน LLM Gateway (Section 1)
2. สร้าง Responses API usage parser + credit tracking
3. Feature flag: `responses_api_enabled` (default off)

### Phase 2: Browser Execution (Week 1-2)
4. สร้าง OpenSandbox browser runner Docker image (Section 2.1)
5. เปลี่ยน `BrowserSession.execute_actions()` จาก stub เป็น real dispatch (Section 2.2)
6. เพิ่ม sandbox profile mapping (Section 2.3)

### Phase 3: Copilot Intelligence (Week 2-3)
7. สร้าง `LLMGatewayClient` (Section 3.0) — prerequisite สำหรับทุก step ที่เหลือ
8. Implement `_analyze_intent()` via LLM (Section 3.1)
9. Implement `_vision_llm_call()` via Vision LLM (Section 3.2)
10. Implement `_diagnose_failure()` via Vision LLM (Section 3.3)
11. Implement `WebAutomationExecutor.execute()` (Section 3.4)

### Phase 4: Integration + Polish (Week 3-4)
12. web_search cache layer (Section 4)
13. MCP tool registry for browser/search (Section 5)
14. Credit flow coordination + Frontend UI enhancements (Section 6)
15. Audit logging + security hardening (Section 7)
16. Staged rollout per tenant via feature flags

### Verification at Each Phase
- Run existing 102 tests — ต้อง pass ทั้งหมด
- Run new tests สำหรับ section ที่เพิ่ม
- TypeScript typecheck: `pnpm check`
- Python checks: `pytest`, `mypy app/`, `ruff check app/`

---

## Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Prompt injection จากเว็บ/เอกสาร ทำให้ agent เรียก tools ผิดปกติ | สูง | สูง | tool allowlist, least-privilege tool_choice, sanitize outputs, audit + human approval |
| SSRF/DNS rebinding | กลาง | สูง | validate_url_with_dns + block CIDRs + page.route defense-in-depth |
| RCE/escape จาก browser runner | กลาง | สูง | Run ใน OpenSandbox, deny network by default, no arbitrary eval, tenant policy |
| ค่าใช้จ่ายบานปลายจาก web_search/tool loops | กลาง | กลาง-สูง | quotas per run, caching, cost estimate/stop rules, per-run budget |
| ZDR/retention ไม่เป็นไปตามข้อกำหนด | กลาง | กลาง | default store=false, หลีกเลี่ยง background mode |
| Config keys ไม่ consistent ต่อ tenant | กลาง | กลาง | ยึด key pattern `{key}_{tenantId}`, migration/repair script |
| GPT-5.4 rate limits/availability | กลาง | กลาง | LLM provider fallback ที่มีอยู่, circuit breaker, queue |

---

## Files Change Summary

| Area | Path | Change | Notes |
|------|------|--------|-------|
| LLM Gateway | `apps/web/server/_core/llmRoutes.ts` | Modify | เพิ่ม `/v1/responses`, tool-call loop, usage parser |
| Search Cache | `apps/web/server/services/searchResultCache.ts` | Create | Redis cache สำหรับ web_search |
| LLM Gateway Client | `python-backend/app/services/llm_gateway_client.py` | Create | Python HTTP client เรียก Node gateway (Section 3.0) |
| Browser Tool Route | `apps/web/server/routes/browserTool.ts` | Minor | ปรับ MCP context support |
| Automation tRPC | `apps/web/server/routers/automationCopilot.ts` | Minor | แก้ config key patterns |
| Python Browser API | `python-backend/app/api/browser.py` | Minor | เพิ่ม metrics fields |
| BrowserSession | `python-backend/app/services/tools/browser_tool.py` | Major | stub → real OpenSandbox dispatch |
| Sandbox Profiles | `python-backend/app/services/sandbox_profiles.py` | Minor | เพิ่ม browser profile mapping |
| Automation Copilot | `python-backend/app/services/automation_copilot.py` | Major | implement `_analyze_intent()` |
| Script Generator | `python-backend/app/services/playwright_script_generator.py` | Major | implement `_vision_llm_call()` |
| Self-Healing | `python-backend/app/services/self_healing_executor.py` | Major | implement `_diagnose_failure()` |
| Web Automation Node | `python-backend/app/orchestrator/node_executors/web_automation_executor.py` | Major | implement `execute()` |
| Internal MCP | `python-backend/app/api/internal_mcp.py` | Modify | เพิ่ม browser/sandbox tools |
| Browser Runner | `docker/sandbox-runners/browser-runner/` | Create | Dockerfile + Playwright entrypoint |
| Automation Copilot API | `python-backend/app/api/automation_copilot.py` | Minor | เพิ่ม cost_estimate ใน analyze response |
| Automation Celery Tasks | `python-backend/app/tasks/automation_copilot_task.py` | Modify | ใช้ LLM gateway จริงแทน stub |
| AutomationChatModal | `apps/web/client/src/components/automation/AutomationChatModal.tsx` | Modify | เพิ่ม research+browse mode, citations, cost estimate |
| model_provider_map | DB seed/migration | Create | เพิ่ม GPT-5.4 entry พร้อมราคา |
| Tests | `apps/web/server/__tests__/`, `python-backend/tests/` | Create | Tests ตาม testing plan |

---

## Known Gaps & Pre-requisites

### Gaps ที่ต้องแก้ก่อนหรือระหว่าง implement

| Gap | Severity | Where | Action |
|-----|---------|-------|--------|
| `MAX_ACTIONS` cap ไม่มี | Medium | `browser_tool.py` | เพิ่ม constant + enforce ใน `execute_actions()` |
| `MAX_PAGES` cap ไม่มี | Medium | `browser_tool.py` | เพิ่ม constant + enforce ใน `navigate()` |
| Node-side domain validation ก่อนหักเครดิต | Low | `browserTool.ts` | เพิ่ม allowlist check ก่อน `deductCredits()` |
| `_diagnose_failure()` return stub confidence=0.0 | High | `self_healing_executor.py:185` | เปลี่ยนเป็น real Vision LLM call (Section 3.3) |
| GPT-5.4 ไม่มีใน `model_provider_map` | High | DB seed | เพิ่ม entry พร้อม pricing |
| Selector cache TTL อาจต้องปรับตาม use case | Low | `selector_cache.py` | ปัจจุบัน TTL = 7 วัน (604800s, line 37) + invalidation via `invalidate()` — พิจารณาว่าเหมาะสมหรือไม่ |
| Concurrency semaphore ไม่มี heartbeat | Low | `browserTool.ts` + `browser_tool.py` | Session อาจ timeout ที่ Python (300s) ขณะ Node ยังถือ semaphore (310s TTL) |

### Pre-requisites

1. **OpenAI API key ที่รองรับ GPT-5.4** — ต้องมี API access ก่อนเริ่ม Phase 1
2. **OpenSandbox enabled** — `opensandbox_settings.is_enabled` ต้องเป็น `true` สำหรับ browser execution
3. **Feature 031 tests ผ่าน** — 102 tests ต้อง pass ก่อนเริ่ม implement
4. **Docker build environment** — สำหรับ build browser runner image

### Dependencies on Feature 031

Feature 032 สร้างบน Feature 031 (`specs/feature/031-PlaywrightVision/spec.md`, Draft v0.5):
- ใช้ pipeline เดิม: intent → screenshot overlay → vision LLM → selectors → execute + self-heal
- ใช้ Pydantic models เดิม: `AutomationIntent`, `PlaywrightScript`, `PlaywrightAction`, `IdentifiedElement`, `FailureDiagnosis`, `ExecutionResult`
- ใช้ services เดิม: `BrowserPool`, `SelectorCache`, `BrowserSSRFGuard`, `ConcurrencyGuard`
- ใช้ endpoints เดิม: tRPC `automationCopilot.*`, FastAPI `/api/v1/automation-copilot/*`

Feature 032 **เพิ่มเติม** (ไม่แก้ไข architecture ของ 031):
- LLM gateway endpoint ใหม่ (`/v1/responses`)
- Implementation จริงแทน stub/NotImplementedError
- web_search integration + cache
- MCP tool registry สำหรับ agencies

---

## WebSocket Mode (Future — Optional)

OpenAI Responses API รองรับ WebSocket mode สำหรับ workflow ที่มี tool round-trips จำนวนมาก:
- ลด latency ~40% สำหรับ 20+ tool calls
- ใช้ `previous_response_id` + incremental `input` items
- **ข้อควรระวัง**: เมื่อ `store=false` + `previous_response_id` หลุดจาก cache → `previous_response_not_found` error

ยังไม่ implement ใน phase นี้ — รอ evaluate จาก production usage patterns ก่อน ถ้า tool calls เฉลี่ย >10 per request จึงค่อยเพิ่ม WebSocket mode
