"""
WorkflowEditor — edits/fixes an existing ReactFlow workflow JSON using an LLM.

Takes the current workflow JSON + compilation errors/warnings + optional user
instructions and returns a fixed/improved workflow JSON.

Routes through the SmartSpecWeb LLM gateway (forward_chat_json) so that model
selection, provider routing, credit tracking, and audit logging are all handled
centrally — exactly the same as every other LLM call in the platform.
"""
from __future__ import annotations

import html
import json
import re
from typing import Any

import structlog

from app.clients.web_gateway import forward_chat_json
from app.orchestrator.workflow_validator import GeneratedWorkflow

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# System prompt for workflow editing
# ---------------------------------------------------------------------------
_EDIT_SYSTEM_PROMPT = """\
You are an expert workflow architect who fixes errors AND adds new features to existing ReactFlow
workflows. You understand natural language in English AND Thai (ภาษาไทย).

════════════════════════════════════════
OPERATING MODES
════════════════════════════════════════
  MODE 1 — FIX   (errors exist, no instructions): Resolve all errors/warnings.
  MODE 2 — IMPROVE (instructions, no errors):    Add/modify features as requested.
  MODE 3 — FIX + IMPROVE (both):                Fix errors first, then apply instructions.

════════════════════════════════════════
THINKING PROCESS (do this silently before outputting)
════════════════════════════════════════
1. ERRORS: For each error, identify the faulty node/edge and the minimal fix.
2. INTENT: Map each user instruction phrase to concrete node types (see INTENT MAP).
3. PLACEMENT: Decide WHERE in the data flow to insert new nodes.
4. TYPES: Trace data types on each edge. Use set_variable as a universal type bridge.
5. PATHS: Ensure every execution path eventually reaches a workflow_response node.

════════════════════════════════════════
INTENT RECOGNITION MAP — phrase → node type
════════════════════════════════════════
  "approve/อนุมัติ/review/ให้คนตรวจ/sign off"              → approval_gate
  "notify/แจ้งเตือน/email/slack/discord/telegram/line"     → send_notification
  "schedule/cron/ทุกวัน/ตั้งเวลา/timer/recurring"           → schedule_trigger
  "webhook/http trigger/รับ request/เมื่อมีข้อมูลเข้า"       → webhook_trigger
  "queue/message queue/async task/รอ task"                  → queue_trigger
  "search docs/ค้นหาข้อมูล/RAG/knowledge base/semantic"     → rag_query
  "multiple AI/เปรียบเทียบ model/route to best AI"          → multi_model_router
  "parse output/extract structured/json from text"          → output_parser
  "dynamic prompt/build prompt/prompt template"             → prompt_template
  "retry/ลองใหม่/ลองซ้ำ/ถ้า fail ให้ทำอีก/auto retry"     → retry
  "catch error/ดัก error/try catch/error handling"          → try_catch
  "circuit breaker/prevent overload/breaker"                → circuit_breaker
  "timeout/หมดเวลา/นานเกิน/max duration"                    → execution_timeout
  "call API/เรียก API/REST/ดึงข้อมูลจาก URL/HTTP request"   → http_request
  "graphql/call GraphQL query"                              → graphql_request
  "generate image/สร้างภาพ/text to image/AI image"          → generate_image
  "translate/แปลภาษา/translation/เป็นภาษา"                  → llm_call (translation prompt)
  "parallel/ทำพร้อมกัน/concurrently/ควบคู่"                  → parallel + join
  "loop/batch/ทีละรายการ/process list/วนซ้ำ"                → map_array or batch
  "format/template/สร้าง report/mail template/สร้างรายงาน"  → template_engine
  "save file/write/บันทึกไฟล์/download/export file"         → write_file
  "read file/อ่านไฟล์/load from file"                       → read_file
  "user selects/ให้ user เลือก/multiple choices/ตัวเลือก"   → user_choice or switch
  "ask user/กรอกข้อมูล/form/collect input"                  → form_input
  "extract json/ดึงค่า/json path/field from response"       → json_path_extractor
  "parse csv/อ่าน csv/tabular data"                         → csv_parser
  "parse xml/XML data"                                      → xml_parser
  "transform/map fields/แปลงข้อมูล/json to csv"             → transformer or data_mapper
  "merge/combine results/รวมผลลัพธ์"                         → merge_data
  "validate/check format/ตรวจสอบ/schema check"              → validator
  "sub-workflow/call skill/เรียก skill"                     → skill_call
  "secret/API key/credentials/env var"                      → secrets_vault
  "store cloud/S3/upload/cloud storage"                     → storage_action
  "metrics/log performance/count/track"                     → metrics_collector
  "view history/audit/run log"                              → run_history
  "set variable/store value/ตั้งค่า/bridge types"            → set_variable
  "if-else/condition/แบ่งตามเงื่อนไข/2-way branch"          → conditional
  "multi-way/switch/N choices/กรณีต่าง ๆ"                   → switch
  "database/query DB/fetch from DB/SQL"                     → database_query
  "MCP/external tool/tool call"                             → mcp_connector

════════════════════════════════════════
FIXING STRATEGIES (Mode 1 & 3)
════════════════════════════════════════

**Type Mismatch (text→json, text→array, etc.):**
  Insert set_variable as bridge — its output is "any" type, accepted by all inputs:
    source_node.output → set_var.value → target_node.json_input
  Example: {"id":"adapter_1","type":"workflow","position":{"x":460,"y":0},
            "data":{"nodeType":"set_variable","label":"Type Bridge","config":{"variableName":"bridge"}}}

**Invalid Port Name:**
  Look up EXACT port name in AVAILABLE NODE TYPES and fix sourceHandle/targetHandle.

**Orphaned Node (no connections):**
  Connect logically in the data flow. Remove only if the node serves no purpose.

**Missing workflow_response terminal:**
  Add one at the end; connect the last processing node's output to its "data" input:
  {"id":"resp_1","type":"workflow","position":{"x":1400,"y":0},
   "data":{"nodeType":"workflow_response","label":"Return Result","config":{"status":"success"}}}

**Missing trigger node:**
  If no trigger exists, add webhook_trigger as the default entry point.

**llm_call without prompt/systemPrompt:**
  Set config.prompt and config.systemPrompt from the node's label and context.
  Always set config.model = WORKFLOW_DEFAULT_MODEL.

**Parallel branches without join:**
  Add a join node after all parallel branches to merge results before continuing.

════════════════════════════════════════
FEATURE ADDITION PATTERNS (Mode 2 & 3)
════════════════════════════════════════

━━━ HUMAN APPROVAL / ให้คน Approve ━━━
  Insert approval_gate between last processing node and the next step:
    last_node.output → approval_gate.data
    approval_gate.approved → next_step.input
    approval_gate.rejected → send_notification.message  (notify on rejection)
  Config: {"requiredApprovals":1,"timeout":24}
  Ports in:[data(json,required),approvers(array),message(text),timeout(number)]
        out:[approved(json),rejected(json)]

━━━ NOTIFICATION / แจ้งเตือน ━━━
  processing_node.output → send_notification.message
  Config: {"notificationType":"email"}  (or "slack"/"discord"/"telegram")
  Ports in:[notificationType(text),recipient(text),subject(text),message(text,required)]
        out:[messageId(text),status(text)]
  → Add BEFORE workflow_response or as a parallel branch after main flow.
  → For Slack: set notificationType="slack", recipient="#channel-name"

━━━ SCHEDULING / ตั้งเวลาอัตโนมัติ ━━━
  Replace/add entry trigger with schedule_trigger:
    schedule_trigger.timestamp → (first processing node)
  Config: {"schedule":"0 9 * * MON-FRI","timezone":"Asia/Bangkok"}
  Ports out:[timestamp(text),scheduleId(text)]
  → Cron syntax: "0 9 * * *" = every day at 09:00, "0 */2 * * *" = every 2 hours

━━━ WEBHOOK TRIGGER / รับ HTTP Request จากภายนอก ━━━
  Add as entry point:
    webhook_trigger.payload → (first processing node)
  Config: {"method":"POST","path":"/webhook/my-workflow"}
  Ports out:[payload(json),headers(json),method(text),queryParams(json)]

━━━ CALL EXTERNAL REST API / เรียก API ━━━
  previous_node.output → http_request.body
  Config: {"url":"https://api.example.com/endpoint","method":"POST",
           "headers":{"Content-Type":"application/json"},"authentication":"bearer"}
  Ports in:[url(text),method(text),headers(json),body(json),queryParams(json)]
        out:[response(json),statusCode(number),headers(json)]
  → For authenticated APIs: fetch key from secrets_vault first, pass to http_request.headers

━━━ SECRETS / API KEY / ข้อมูล credential ━━━
  secrets_vault.secret → set_variable.value  (build auth header)
  set_variable.value → http_request.headers
  Config: {"secretName":"MY_API_KEY","secretType":"api_key"}
  Ports out:[secret(text),secretName(text)]

━━━ RAG / KNOWLEDGE BASE SEARCH / ค้นหาเอกสาร ━━━
  input.text → rag_query.query
  rag_query.results → prompt_template.variables  (combine query + results into prompt)
  prompt_template.result → llm_call.prompt
  llm_call.response → workflow_response.data
  rag_query config: {"knowledgeBaseId":"{{kb_id}}","topK":5,"similarityThreshold":0.7}
  Ports in:[query(text,required),filters(json),topK(number)]
        out:[results(array),sources(array),scores(array)]

━━━ MULTI-MODEL ROUTING / เปรียบเทียบ AI หลาย Model ━━━
  input → multi_model_router.input
  Config: {"models":["gpt-4o","claude-3-5-sonnet"],"routingStrategy":"best_quality"}
  Ports out:[response(text),modelUsed(text),latency(number),cost(number)]
  → Use when user wants "best AI" or wants to compare multiple models

━━━ RETRY ON FAILURE / ลองซ้ำอัตโนมัติ ━━━
  Wrap a potentially failing node:
    previous → retry.input → risky_node → (continue on success)
  Config: {"maxRetries":3,"retryDelay":1000,"backoffMultiplier":2,"retryOn":["error","timeout"]}
  Ports in:[input(any)] out:[output(any),attempts(number),lastError(text)]

━━━ ERROR TRAP / TRY-CATCH ━━━
  try_catch.try → risky_operations → (normal path)
  try_catch.catch → send_notification.message  (alert on error)
              → OR workflow_response(data: error message, status: "error")
  Config: {"catchErrors":["all"]}
  Ports out:[try(any),catch(any),error(json)]

━━━ TIMEOUT PROTECTION / กำหนดเวลาสูงสุด ━━━
  execution_timeout.input → long_running_node.input
  long_running_node.output → execution_timeout.output (virtual — wrap the node)
  Config: {"timeout":30000,"timeoutAction":"error"}
  Ports in:[input(any)] out:[output(any),timedOut(boolean)]
  → Use for external API calls or LLM calls that might hang

━━━ IMAGE GENERATION / สร้างภาพ AI ━━━
  prompt_node.output → generate_image.prompt
  generate_image config: {"provider":"fal","model":"flux-pro","size":"1024x1024"}
  Ports in:[prompt(text,required),negativePrompt(text),style(text),size(text)]
        out:[imageUrl(text),thumbnailUrl(text),metadata(json)]
  → Recommended chain: llm_call (craft detailed image prompt) → generate_image → workflow_response

━━━ FILE EXPORT / ส่งออกไฟล์ ━━━
  a) CSV/Excel:
     data → transformer.input (config:{"transformMode":"json_to_csv"})
     transformer.output → write_file.content (config:{"file_path":"output.csv","encoding":"utf-8"})
     write_file.file_path → workflow_response.data

  b) Markdown report:
     data → template_engine.variables (config:{"engine":"mustache","template":"# Report\n{{title}}\n{{body}}"})
     template_engine.result → write_file.content (config:{"file_path":"output.md"})

  c) JSON dump:
     data → write_file.content (config:{"file_path":"output.json"})

  write_file ports in:[content(text,required),file_path(text)] out:[file_path(text),size(number),url(text)]

━━━ USER CHOICE / ให้ user เลือก Output ━━━
  Option A — select field in form_input:
    form_input config fields: [{"id":"format","label":"Output Format","type":"select",
      "required":true,"options":["บทความ","JSON","CSV"]}]
    form_input.values → switch.value
    switch config: {"cases":{"บทความ":"article","JSON":"json","CSV":"csv"},"defaultCase":"article"}
    Each switch output → separate processing branch → separate workflow_response

  Option B — user_choice node (simpler):
    previous → user_choice.question
    user_choice config: {"prompt":"เลือก format","options":["บทความ","JSON","CSV"]}
    user_choice.selected → switch → branches

━━━ PARALLEL PROCESSING / ทำงานพร้อมกัน ━━━
  Fan-out + fan-in:
    input_node → parallel (fan-out marker)
    parallel.branch1 → task_a → join.input_a
    parallel.branch2 → task_b → join.input_b
    join.merged → workflow_response
  parallel config: {"branches":2}  join config: {"strategy":"wait_all"}
  Alternative simple fan-out: connect ONE source to MULTIPLE target nodes directly;
    then merge_data to gather results: {"strategy":"deep_merge"}

━━━ BATCH/LOOP PROCESSING / วนซ้ำทีละรายการ ━━━
  array_source → map_array.inputArray
  map_array config: {"mapMode":"extract","field":"fieldName"}
  Ports out:[mapped(array),mappedCount(number)]
  OR for sub-workflow per item:
    array_source → batch.items
    batch config: {"concurrency":3}  (batch.item → process → batch.result)

━━━ DATA VALIDATION / ตรวจสอบข้อมูล ━━━
  input → validator.input
  Config: {"validationMode":"json_schema","schema":{"type":"object","required":["name","email"]}}
  Ports out:[isValid(boolean),errors(array),validatedData(any)]
  validator.isValid → conditional.value
    conditional.true → (continue processing)
    conditional.false → workflow_response (config:{status:"error"}, data: validator.errors)

━━━ DATA EXTRACTION / ดึงค่าจาก JSON ━━━
  api_response.response → json_path_extractor.input
  Config: {"paths":{"userId":"$.user.id","name":"$.user.profile.name","items":"$.data[*]"}}
  Ports out:[extracted(json),missing(array)]
  → Use after http_request to pick specific fields from complex API responses

━━━ TEMPLATE / REPORT GENERATION / สร้างรายงาน ━━━
  data_node.output → template_engine.variables
  Config: {"engine":"mustache",
    "template":"# รายงาน\nวันที่: {{date}}\n\n{{#items}}- {{name}}: {{value}}\n{{/items}}"}
  Ports in:[variables(json),template(text)] out:[result(text)]
  template_engine.result → send_notification OR write_file OR workflow_response

━━━ TRANSLATION / แปลภาษา ━━━
  Add or modify llm_call node with translation system prompt:
    source.text → llm_call.prompt (via set_variable or prompt_template)
    Config: {"systemPrompt":"คุณเป็นนักแปลมืออาชีพ แปลข้อความต่อไปนี้เป็นภาษาไทย ตอบเฉพาะข้อความที่แปลแล้ว",
             "prompt":"{{input}}","model":"WORKFLOW_DEFAULT_MODEL"}
  → Insert between content generation and final response

━━━ PROMPT TEMPLATE BUILDER / Dynamic Prompt ━━━
  inputs → prompt_template.variables
  Config: {"template":"You are a {{role}}. Task: {{task}}\nContext: {{context}}\nRespond in {{language}}."}
  Ports in:[variables(json,required),template(text)] out:[result(text)]
  prompt_template.result → llm_call.prompt

━━━ OUTPUT PARSER / Extract Structured Data from LLM ━━━
  llm_call.response → output_parser.input
  Config: {"parserType":"json","schema":{"title":"string","points":["string"]}}
  Ports in:[input(text,required)] out:[parsed(json),raw(text)]
  → Use when LLM response should be structured JSON for downstream processing

━━━ METRICS / OBSERVABILITY / ติดตามผล ━━━
  At key checkpoints in the flow:
  processing_node.output → metrics_collector.data
  Config: {"metricName":"workflow_items_processed","metricType":"counter"}
  → metrics_collector passes data through unchanged — no disruption to main flow

════════════════════════════════════════
STRICT RULES
════════════════════════════════════════
1.  Output ONLY the CHANGES (diff) — do NOT repeat unchanged nodes/edges. See OUTPUT FORMAT.
2.  Keep existing node IDs, positions, and configs UNCHANGED (unless that node IS the fix)
3.  New node IDs: unique snake_case with counter (approval_1, notify_1, adapter_2, etc.)
4.  New node positions: 280px horizontal gap, 120px vertical gap between adjacent nodes
5.  Use ONLY node types listed in AVAILABLE NODE TYPES — never invent new types
6.  Use EXACT port names from node specs — wrong port names cause runtime failure
7.  For ALL llm_call nodes: set config.model = WORKFLOW_DEFAULT_MODEL (given in user message)
8.  For ALL llm_call nodes: set config.prompt AND config.systemPrompt (non-empty strings)
9.  Every execution path MUST end at a workflow_response node
10. Output ONLY raw JSON — no markdown fences, no text before or after
11. Output COMPACT JSON — no indentation, no extra whitespace

════════════════════════════════════════
OUTPUT FORMAT  (DIFF — output changes only, NOT the full workflow)
════════════════════════════════════════
{
  "description": "One sentence: what was fixed/added",
  "changes": [
    "Fixed: type mismatch text→json — added set_variable adapter between node_a and node_b",
    "Added: approval_gate after process_1 requiring 1 approval before continuing"
  ],
  "modified_nodes": [
    ...ONLY nodes that are NEW or were MODIFIED — full node object for each...
  ],
  "deleted_node_ids": ["id_of_node_to_remove"],
  "modified_edges": [
    ...ONLY edges that are NEW or were MODIFIED — full edge object for each...
  ],
  "deleted_edge_ids": ["id_of_edge_to_remove"]
}

IMPORTANT: "modified_nodes" means ADD or UPDATE. Omit nodes you did not touch.
If nothing was deleted, use empty arrays: "deleted_node_ids": [], "deleted_edge_ids": []

"""


class WorkflowEditError(Exception):
    def __init__(
        self,
        message: str,
        validation_error: str | None = None,
        hint: str | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.validation_error = validation_error
        self.hint = hint


class WorkflowEditor:
    """Edits an existing ReactFlow workflow JSON to fix errors and improve structure.

    Uses the SmartSpecWeb LLM gateway (forward_chat_json) so model routing,
    credits, and audit logging are handled by the central gateway.
    """

    _MAX_ERROR_CHARS = 400
    _MAX_WORKFLOW_CHARS = 40000  # cap workflow JSON sent to LLM (large workflows ~50+ nodes)
    # Output token budget: base 8 000 + 150 per node + 40 per edge, capped at 32 000
    # (most providers support 16 k–32 k output tokens; 32 k covers ~200-node workflows)
    _MAX_OUTPUT_TOKENS_BASE = 8000
    _MAX_OUTPUT_TOKENS_CAP = 32000
    _TOKENS_PER_NODE = 150   # avg JSON chars per node ≈ 600, ÷ 4 chars/token = 150
    _TOKENS_PER_EDGE = 40    # avg JSON chars per edge ≈ 160, ÷ 4 = 40

    def _format_node_types(self, node_types: list[dict[str, Any]]) -> str:
        """Format node types into a compact spec for LLM context.

        Format per line:
          nodeType:<type>  desc:<short description>  in:<port(type)[flags],...>  out:<port(type),...>
        """
        if not node_types:
            return "(node types unavailable)"

        blocks: list[str] = []
        for nt in node_types:
            ntype = nt.get("type", "")
            desc = nt.get("description", "")
            # Shorten description: keep first sentence, max 80 chars
            if desc:
                first_sentence = desc.split(".")[0].strip()
                desc_short = first_sentence[:80]
            else:
                desc_short = ""

            input_parts: list[str] = []
            for i in nt.get("inputs", []):
                if i.get("accepts_connection") or i.get("required"):
                    flags = []
                    if i.get("required"):
                        flags.append("required")
                    flag_str = f"[{','.join(flags)}]" if flags else ""
                    input_parts.append(f"{i.get('name')}({i.get('data_type', 'any')}){flag_str}")

            output_parts = [
                f"{o.get('name')}({o.get('data_type', 'any')})"
                for o in nt.get("outputs", [])
            ]

            line = f"nodeType:{ntype}"
            if desc_short:
                line += f"  desc:{desc_short}"
            if input_parts:
                line += f"  in:{','.join(input_parts)}"
            if output_parts:
                line += f"  out:{','.join(output_parts)}"
            blocks.append(line)

        return "\n".join(blocks)

    @staticmethod
    def _fix_json(text: str) -> str:
        """Best-effort repair of common LLM JSON mistakes."""
        # 1. Remove trailing commas before } or ]
        text = re.sub(r",\s*([}\]])", r"\1", text)
        # 2. Fix single-quoted keys → double-quoted
        text = re.sub(r"(?<=[\{,\[])\s*'([^']+)'\s*:", r' "\1":', text)
        # 3. Add missing comma between adjacent objects/arrays.
        #    LLMs often forget the comma between two node objects:
        #      {"id":"a"} {"id":"b"}  →  {"id":"a"},{"id":"b"}
        text = re.sub(r"([}\]])\s*([{\[])", r"\1,\2", text)
        return text

    @staticmethod
    def _repair_truncated_json(text: str) -> str:
        """Attempt to close a JSON string that was truncated mid-output.

        Walks character-by-character to track bracket depth and string state,
        then appends whatever closing tokens are needed.
        """
        depth: list[str] = []
        in_string = False
        escape_next = False

        for char in text:
            if escape_next:
                escape_next = False
                continue
            if char == "\\" and in_string:
                escape_next = True
                continue
            if char == '"':
                in_string = not in_string
                continue
            if in_string:
                continue
            if char in "{[":
                depth.append("}" if char == "{" else "]")
            elif char in "}]":
                if depth and depth[-1] == char:
                    depth.pop()

        suffix = ""
        if in_string:
            suffix += '"'
        suffix += "".join(reversed(depth))

        return text + suffix

    def _sanitize_node(
        self,
        node: dict[str, Any],
        node_types: list[dict[str, Any]],
        workflow_model: str,
    ) -> dict[str, Any]:
        """Sanitize a single node: ensure structure, escape strings, auto-fill LLM defaults."""
        registry = {nt.get("type"): nt for nt in node_types}
        node.setdefault("type", "workflow")
        node.setdefault("position", {"x": 0, "y": 0})
        node.setdefault("data", {})
        node["data"].setdefault("config", {})
        if "label" in node["data"]:
            node["data"]["label"] = html.escape(str(node["data"]["label"]))[:200]

        ntype = node["data"].get("nodeType", "")
        config = node["data"]["config"]

        if ntype == "llm_call":
            if not config.get("model"):
                config["model"] = workflow_model
            config.setdefault("temperature", 0.7)
            config.setdefault("maxTokens", 1000)
            if not config.get("prompt"):
                config["prompt"] = "Process the input and provide a response."
            if not config.get("systemPrompt"):
                config["systemPrompt"] = "You are a helpful assistant."

        if ntype == "workflow_response":
            config.setdefault("status", "success")

        if node_types and ntype not in registry:
            logger.warning("workflow_editor_unknown_node_type", node_type=ntype)

        return node

    def _sanitize_edge(self, edge: dict[str, Any], index: int) -> dict[str, Any]:
        """Ensure edge has id and type."""
        if "id" not in edge:
            edge["id"] = f"edge-{edge.get('source', 's')}-{edge.get('target', 't')}-{index}"
        edge.setdefault("type", "smoothstep")
        return edge

    def _apply_edit_diff(
        self,
        current: dict[str, Any],
        diff: dict[str, Any],
        node_types: list[dict[str, Any]],
        workflow_model: str,
    ) -> dict[str, Any]:
        """Merge LLM diff output into the original workflow.

        modified_nodes  → nodes to ADD (new id) or UPDATE (existing id)
        deleted_node_ids → node IDs to remove
        modified_edges  → edges to ADD or UPDATE
        deleted_edge_ids → edge IDs to remove
        """
        nodes: dict[str, dict] = {n["id"]: n for n in current.get("nodes", [])}
        edges: dict[str, dict] = {e["id"]: e for e in current.get("edges", [])}

        for node in diff.get("modified_nodes", []):
            if not node.get("id"):
                continue
            node = self._sanitize_node(node, node_types, workflow_model)
            nodes[node["id"]] = node

        for node_id in diff.get("deleted_node_ids", []):
            nodes.pop(str(node_id), None)

        for i, edge in enumerate(diff.get("modified_edges", [])):
            edge = self._sanitize_edge(edge, i)
            edges[edge["id"]] = edge

        for edge_id in diff.get("deleted_edge_ids", []):
            edges.pop(str(edge_id), None)

        return {
            "nodes": list(nodes.values()),
            "edges": list(edges.values()),
            "description": html.escape(str(diff.get("description", "AI-edited workflow")))[:500],
            "changes": [html.escape(str(c))[:200] for c in diff.get("changes", [])],
        }

    def _parse_raw_json(self, raw: str) -> dict[str, Any]:
        """Parse JSON from LLM response string, with repair fallbacks."""
        text = raw.strip()
        if "```" in text:
            text = re.sub(r"```(?:json)?\s*", "", text).strip()
            text = re.sub(r"```", "", text).strip()

        fixed = self._fix_json(text)
        repaired = self._repair_truncated_json(fixed)
        for attempt_text in (fixed, repaired, text):
            try:
                return json.loads(attempt_text)
            except json.JSONDecodeError:
                pass

        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            extracted = match.group()
            last_exc: json.JSONDecodeError | None = None
            for attempt_text in (
                self._fix_json(extracted),
                self._repair_truncated_json(self._fix_json(extracted)),
            ):
                try:
                    return json.loads(attempt_text)
                except json.JSONDecodeError as exc:
                    last_exc = exc
            raise WorkflowEditError(
                f"LLM returned invalid JSON: {last_exc}"
            ) from last_exc

        raise WorkflowEditError("LLM returned no JSON object in response")

    def _parse_result(
        self,
        raw: str,
        node_types: list[dict[str, Any]],
        workflow_model: str,
        current_workflow: dict[str, Any],
    ) -> dict[str, Any]:
        """Extract and validate the LLM response.

        Accepts TWO formats:
          - Diff format (preferred): {"modified_nodes": [...], "deleted_node_ids": [...], ...}
          - Full format (legacy fallback): {"nodes": [...], "edges": [...], ...}

        Diff format is merged with current_workflow server-side.
        Full format is used as-is (backward compatibility).
        """
        data = self._parse_raw_json(raw)

        # ── Diff format ──────────────────────────────────────────────────────
        is_diff = "modified_nodes" in data or "deleted_node_ids" in data
        if is_diff:
            if not isinstance(data.get("modified_nodes"), list):
                data["modified_nodes"] = []
            if not isinstance(data.get("deleted_node_ids"), list):
                data["deleted_node_ids"] = []
            if not isinstance(data.get("modified_edges"), list):
                data["modified_edges"] = []
            if not isinstance(data.get("deleted_edge_ids"), list):
                data["deleted_edge_ids"] = []

            result = self._apply_edit_diff(current_workflow, data, node_types, workflow_model)
            result["_was_diff"] = True
            return result

        # ── Full format (fallback) ────────────────────────────────────────────
        nodes: list[dict] = data.get("nodes", [])
        edges: list[dict] = data.get("edges", [])

        if not isinstance(nodes, list) or not nodes:
            raise WorkflowEditError("Edited workflow has no nodes.")

        nodes = [self._sanitize_node(n, node_types, workflow_model) for n in nodes]
        edges = [self._sanitize_edge(e, i) for i, e in enumerate(edges)]

        return {
            "nodes": nodes,
            "edges": edges,
            "description": html.escape(str(data.get("description", "AI-edited workflow")))[:500],
            "changes": [html.escape(str(c))[:200] for c in data.get("changes", [])],
            "_was_diff": False,
        }

    async def edit(
        self,
        current_workflow: dict[str, Any],
        errors: list[str],
        warnings: list[str],
        instructions: str,
        node_types: list[dict[str, Any]] | None = None,
        model: str | None = None,
        user_token: str | None = None,
        default_model: str | None = None,
    ) -> dict[str, Any]:
        """Edit the workflow with a single LLM call."""
        result = await self._call_llm_once(
            current_workflow=current_workflow,
            errors=errors,
            warnings=warnings,
            instructions=instructions,
            node_types=node_types,
            model=model,
            user_token=user_token,
            default_model=default_model,
        )
        return result

    async def edit_with_retry(
        self,
        current_workflow: dict[str, Any],
        errors: list[str],
        warnings: list[str],
        instructions: str,
        node_types: list[dict[str, Any]] | None = None,
        model: str | None = None,
        user_token: str | None = None,
        default_model: str | None = None,
        max_attempts: int = 3,
    ) -> dict[str, Any]:
        """Edit the workflow with up to max_attempts LLM calls.

        On each failed validation, the error is fed back to the LLM for correction.
        """
        from pydantic import ValidationError

        last_error: str | None = None

        for attempt in range(1, max_attempts + 1):
            correction = ""
            if last_error and attempt > 1:
                err_text = last_error[: self._MAX_ERROR_CHARS]
                correction = (
                    f"\n\n[CORRECTION REQUIRED — Attempt {attempt}]\n"
                    f"Previous response failed with:\n{err_text}\n"
                    f"Fix ONLY the issue described above."
                )

            raw_dict = await self._call_llm_once(
                current_workflow=current_workflow,
                errors=errors,
                warnings=warnings,
                instructions=instructions + correction,
                node_types=node_types,
                model=model,
                user_token=user_token,
                default_model=default_model,
            )

            try:
                # Validate basic structure matches GeneratedWorkflow (nodes + edges)
                workflow_subset = {"nodes": raw_dict["nodes"], "edges": raw_dict["edges"]}
                validated = GeneratedWorkflow.model_validate(workflow_subset)
                raw_dict["nodes"] = [n.model_dump() for n in validated.nodes]
                raw_dict["edges"] = [e.model_dump() for e in validated.edges]
                return raw_dict
            except ValidationError as e:
                last_error = str(e)
                logger.warning(
                    "workflow_editor_validation_failure",
                    attempt=attempt,
                    max_attempts=max_attempts,
                    error=last_error[:200],
                )

        raise WorkflowEditError(
            message=f"Workflow editing failed after {max_attempts} attempts.",
            validation_error=last_error,
            hint="Try simplifying the workflow or providing more specific instructions.",
        )

    async def _call_llm_once(
        self,
        current_workflow: dict[str, Any],
        errors: list[str],
        warnings: list[str],
        instructions: str,
        node_types: list[dict[str, Any]] | None = None,
        model: str | None = None,
        user_token: str | None = None,
        default_model: str | None = None,
    ) -> dict[str, Any]:
        """Make a single LLM call to edit the workflow."""
        import time

        effective_node_types = node_types or []
        node_types_text = self._format_node_types(effective_node_types)

        # Scale output token budget with workflow complexity.
        # Allow 60% growth headroom for new nodes/edges the LLM may add.
        node_count = len(current_workflow.get("nodes", []))
        edge_count = len(current_workflow.get("edges", []))
        growth_factor = 1.6
        # Diff output is much smaller than full output: assume at most 50% of nodes change.
        # growth_factor still accounts for NEW nodes that may be added.
        dynamic_max_tokens = min(
            self._MAX_OUTPUT_TOKENS_CAP,
            max(
                self._MAX_OUTPUT_TOKENS_BASE,
                int((node_count * 0.5 * growth_factor * self._TOKENS_PER_NODE)
                    + (edge_count * 0.5 * growth_factor * self._TOKENS_PER_EDGE)
                    + 1500),  # overhead for description/changes/wrapper
            ),
        )

        # Cap node types text to prevent token overflow (descriptions make it larger)
        if len(node_types_text) > 9000:
            node_types_text = node_types_text[:9000] + "\n... (truncated)"

        workflow_model = default_model or model or "gpt-4o-mini"

        # Serialize workflow JSON — fail fast if still too large after compaction
        workflow_json_str = json.dumps(current_workflow, indent=2)
        if len(workflow_json_str) > self._MAX_WORKFLOW_CHARS:
            # Try compact (no indentation) first
            workflow_json_str = json.dumps(current_workflow)
        if len(workflow_json_str) > self._MAX_WORKFLOW_CHARS:
            raise WorkflowEditError(
                f"Workflow is too large to edit ({len(workflow_json_str):,} characters; "
                f"maximum is {self._MAX_WORKFLOW_CHARS:,}). "
                f"Try removing unused nodes or splitting the workflow into smaller parts."
            )

        # Build errors/warnings section
        errors_text = "\n".join(f"  • {e}" for e in errors) if errors else "  (none)"
        warnings_text = "\n".join(f"  • {w}" for w in warnings) if warnings else "  (none)"

        user_message = (
            "════════════════════════════════════════\n"
            "CURRENT WORKFLOW JSON\n"
            "════════════════════════════════════════\n"
            f"{workflow_json_str}\n\n"
            "════════════════════════════════════════\n"
            "COMPILATION ERRORS (MUST FIX)\n"
            "════════════════════════════════════════\n"
            f"{errors_text}\n\n"
            "════════════════════════════════════════\n"
            "WARNINGS (fix if possible)\n"
            "════════════════════════════════════════\n"
            f"{warnings_text}\n\n"
            "════════════════════════════════════════\n"
            "USER INSTRUCTIONS\n"
            "════════════════════════════════════════\n"
            f"{instructions or 'Fix all errors and warnings. Improve the workflow structure if needed.'}\n\n"
            "════════════════════════════════════════\n"
            "AVAILABLE NODE TYPES (port specs)\n"
            "════════════════════════════════════════\n"
            f"{node_types_text}\n\n"
            "════════════════════════════════════════\n"
            "WORKFLOW SETTINGS\n"
            "════════════════════════════════════════\n"
            f'WORKFLOW_DEFAULT_MODEL: "{workflow_model}"\n\n'
            "Output ONLY the CHANGES as compact JSON (diff format — see system prompt OUTPUT FORMAT).\n"
            "Include only modified_nodes, deleted_node_ids, modified_edges, deleted_edge_ids.\n"
            "Output ONLY raw JSON — no markdown, no text before or after."
        )

        logger.info(
            "workflow_editor_token_budget",
            node_count=node_count,
            edge_count=edge_count,
            max_tokens=dynamic_max_tokens,
        )

        payload: dict[str, Any] = {
            "messages": [
                {"role": "system", "content": _EDIT_SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            "temperature": 0.1,
            "max_tokens": dynamic_max_tokens,
        }
        if model:
            payload["model"] = model

        t0 = time.monotonic()
        try:
            response = await forward_chat_json(payload=payload, user_token=user_token)
        except Exception as exc:
            logger.error("workflow_editor_gateway_error", error=str(exc))
            raise WorkflowEditError(f"Gateway call failed: {exc}") from exc

        elapsed_ms = int((time.monotonic() - t0) * 1000)

        if response.status_code != 200:
            body_text = response.text[:500]
            logger.error(
                "workflow_editor_gateway_http_error",
                status_code=response.status_code,
                body=body_text,
            )
            raise WorkflowEditError(
                f"Workflow editing service unavailable (HTTP {response.status_code}). Please try again."
            )

        try:
            resp_json = response.json()
            raw = resp_json["choices"][0]["message"]["content"]
        except (KeyError, IndexError, ValueError) as exc:
            raise WorkflowEditError(f"Unexpected gateway response format: {exc}") from exc

        logger.info(
            "workflow_editor_response",
            elapsed_ms=elapsed_ms,
            model=resp_json.get("model", model),
            chars=len(raw),
        )

        result = self._parse_result(raw, effective_node_types, workflow_model, current_workflow)
        was_diff = result.pop("_was_diff", False)

        # Sanity check on the MERGED result (after diff is applied to original workflow).
        # This protects against truncated diff that drops all modified_nodes entirely.
        final_node_count = len(result.get("nodes", []))

        if final_node_count == 0 and node_count > 0:
            logger.warning("workflow_editor_empty_output", input_nodes=node_count)
            raise WorkflowEditError(
                f"Result has no nodes (input had {node_count}). "
                "Output the diff with at least the existing nodes preserved."
            )

        # For full-format responses, still enforce the 80% floor (truncation guard).
        # Diff-format responses are exempt: the merged result always has >= original count
        # minus intentional deletions, so dramatic drops are expected and valid.
        if not was_diff:
            min_expected = max(1, int(node_count * 0.8))
            if node_count > 3 and final_node_count < min_expected:
                logger.warning(
                    "workflow_editor_truncated_output",
                    input_nodes=node_count,
                    output_nodes=final_node_count,
                )
                raise WorkflowEditError(
                    f"LLM response appears truncated: returned {final_node_count} nodes "
                    f"but input had {node_count}. "
                    "Use diff format: output only modified_nodes/deleted_node_ids/modified_edges/deleted_edge_ids."
                )

        logger.info(
            "workflow_editor_diff_applied",
            was_diff=was_diff,
            input_nodes=node_count,
            output_nodes=final_node_count,
        )
        return result
