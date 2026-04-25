"""
isc/creator.py — Multi-agent skill creator for Intelligence Skill Creator v0.5.0

Pipeline (7 phases):
  Phase 1 — PLAN:      Understand intent, design architecture (language, I/O, algorithms)
  Phase 2 — SCHEMAS:   Generate input.schema.json, output.schema.json, ui.schema.json
  Phase 3 — SKILL_MD:  Generate skill.md with YAML frontmatter
  Phase 4 — CODE:      Generate skill implementation (Python or JavaScript)
  Phase 5 — CRITIC:    LLM reviews and fixes generated code for correctness & safety
  Phase 6 — TESTS:     Generate comprehensive test cases
  Phase 7 — WRITE:     Write ALL artifacts to disk (schemas ALWAYS mandatory)

Mandatory output for every created skill:
  schemas/input.schema.json   — validated inputs
  schemas/output.schema.json  — structured output spec
  schemas/ui.schema.json      — SmartAIHub UI form (Thai + English)
  skill.md                    — manifest with YAML frontmatter
  python/skill.py OR js/skill.js OR skill.manifest.json + src/index.mjs
  tests/tests.json
"""
from __future__ import annotations

import ast
import json
import re
import sys
import time
from pathlib import Path
from typing import Any

from isc.llm import OpenAICompatibleClient
from isc.models import CreatedSkill
from isc.artifact_validation import (
    collect_creation_validation_results,
    raise_for_validation_errors,
)
from isc.exemplars import format_exemplar_context, select_relevant_skill_exemplars
from isc.native_bundle import (
    build_native_skill_files,
    normalize_skill_plan as normalize_native_skill_plan,
    validate_native_skill_bundle,
    write_native_skill_bundle,
)

# ── System prompts ──────────────────────────────────────────────────────────────

_SYS_PLANNER = """You are an expert SmartAIHub skill architect.

Your job: analyze a user description and design a complete, production-quality skill.

SmartAIHub skill conventions:
- Python skill: respond(input, context=None) -> str in python/skill.py
- JavaScript classic skill: async respond(input, context=null) -> str in js/skill.js
- JavaScript GenJS bundle: sandbox-command bundle with skill.manifest.json + src/index.mjs
- Schemas ALWAYS go in schemas/: input.schema.json, output.schema.json, ui.schema.json
- skill.md has YAML frontmatter

Language selection heuristic:
- Python: math/stats, NLP, text processing, data parsing, complex algorithms, CSV/JSON analysis
- JavaScript: strong JSON/object structure work, schema/prompt pipelines, async APIs, web stack glue,
  event-driven logic, templating, URL manipulation, Node.js automation, and libraries like PptxGenJS

When JavaScript is selected, also choose a runtime profile:
- classic: CommonJS skill at js/skill.js
- genjs: modern Node.js ESM bundle with skill.manifest.json + src/index.mjs, better for complex schema/API/pipeline work

RETURN: valid JSON only (no markdown fences, no preamble, no explanation)."""

_SYS_SCHEMA = """You are an expert JSON Schema and SmartAIHub UI schema designer.

JSON Schema rules (draft-07):
- input.schema.json: validates skill inputs; use enum, pattern, minimum/maximum where helpful
- output.schema.json: describes the structured output object the skill returns

SmartAIHub ui.schema.json rules:
- Sections group related fields; first section collapsed=false, rest collapsed=true
- Field types: text | textarea | select | boolean | slider | number | file | files | array
- For file/image uploads: use type="file" (single string URL) or type="files" (array of strings)
- For array of complex objects: use type="array" and define "itemFields" (array of sub-fields)
- Every field MUST have: id, type, label, labelTh, helpText, helpTextTh
- Select fields MUST have: options (array of {value, label, labelTh})
- Slider/number MUST have: min, max, step (all numeric)
- boolean MUST have: default (true/false, NOT string)
- Icons: sparkles, settings, zap, search, palette, camera, music, layers,
         type, video, code, brain, target, globe, filter, sliders, box

RETURN: valid JSON only (no markdown fences, no explanation)."""

_SYS_PYTHON = """You are an expert Python developer creating SmartAIHub skill implementations.

MANDATORY conventions:
1. `from __future__ import annotations` at top
2. `from typing import Any` import
3. Entry point: `def respond(input: Any, context: Any = None) -> str`
4. Handle input as BOTH dict AND JSON string
5. Validate ALL required inputs; return error JSON if missing
6. ALWAYS return a valid JSON string — never raise, never return None
7. On ANY exception: return `json.dumps({"success": False, "output": f"Error: {e}"})`
8. ONLY use Python stdlib: json, re, os, sys, pathlib, datetime, math, collections,
   itertools, functools, hashlib, base64, urllib.parse, urllib.request, html, csv, io,
   textwrap, string, random, time, uuid, typing, dataclasses, contextlib, copy, struct, zlib
9. HTTP: use `urllib.request` (NOT requests, NOT httpx, NOT aiohttp)
10. CRITICAL SECURITY RULE 1: NO DIRECT DATABASE ACCESS. Never import sqlite3, psycopg2, pg, mysql. Use HTTP APIs (or MCP) only.
11. CRITICAL SECURITY RULE 2: NO LOCAL FILESYSTEM ACCESS. Never use open(), os.remove, or pathlib for the local host. Use HTTP APIs or MCP only.
12. CRITICAL SECURITY RULE 3: NEVER CALL EXTERNAL LLMs DIRECTLY. Do not use api.openai.com, anthropic.com, or any external LLM providers.
    Instead, you MUST use the internal LLM gateway: `POST {context.get("publicUrl", "http://localhost:3000")}/api/llm/chat` with header `Authorization: Bearer {context.get("userToken", "")}`. 
    Payload format: `{"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "..."}]}`
13. Add full docstrings and type hints everywhere
11. Helper functions for complex sub-tasks
12. Make output SMART: validate, transform, format beautifully

RETURN: ONLY the complete Python code (no markdown fences, no explanation)."""

_SYS_JS = """You are an expert JavaScript developer creating SmartAIHub skill implementations.

MANDATORY conventions:
1. `"use strict";` at top
2. Entry point: `async function respond(input, context = null)`
3. Handle input as BOTH object AND JSON string
4. Validate ALL required inputs; return error JSON if missing
5. ALWAYS return a valid JSON string — never throw, never return null/undefined
6. On ANY exception: return JSON.stringify({success: false, output: "Error: " + e.message})
7. ONLY use Node.js built-ins: path, fs, crypto, url, os, child_process, util,
   http, https, querystring, buffer, stream, events, string_decoder, zlib, timers
8. HTTP: use built-in `https`/`http` modules (NOT axios, NOT node-fetch unless Node 18+)
9. async/await throughout; no callbacks unless unavoidable
10. CRITICAL SECURITY RULE 1: NO DIRECT DATABASE ACCESS. Never require sqlite3, pg, mysql, etc. Use HTTP APIs (or MCP) only.
11. CRITICAL SECURITY RULE 2: NO LOCAL FILESYSTEM ACCESS. Never use fs.readFile, fs.writeFile, or manipulate local disks directly. Use HTTP APIs or MCP.
12. CRITICAL SECURITY RULE 3: NEVER CALL EXTERNAL LLMs DIRECTLY. Do not use api.openai.com, SDKs, or external LLM endpoints. 
    Instead, you MUST use the internal LLM gateway: `POST ${context.publicUrl || "http://localhost:3000"}/api/llm/chat` with header `Authorization: Bearer ${context.userToken || ""}`.
    Payload format: `{"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "..."}]}`
13. JSDoc comments on all functions
11. Helper functions for complex sub-tasks
12. `module.exports = { respond };` at bottom

RETURN: ONLY the complete JavaScript code (no markdown fences, no explanation)."""

_SYS_JS_GEN = """You are an expert JavaScript developer creating SmartAIHub GenJS skill implementations.

MANDATORY conventions:
1. Use modern Node.js ESM (`.mjs`) syntax
2. Entry point: `export async function respond(input, context = null)`
3. Handle input as BOTH object AND JSON string
4. Validate ALL required inputs; return error JSON if missing
5. ALWAYS return a valid JSON string — never throw, never return null/undefined
6. On ANY exception: return JSON.stringify({success: false, output: "Error: " + e.message})
7. Prefer JavaScript for JSON/object modeling, schema-driven transforms, prompt pipelines, API orchestration,
   web stack automation, and workloads that may later integrate tools like PptxGenJS
8. ONLY use Node.js built-ins unless the prompt explicitly allows a package integration scaffold
9. HTTP: use built-in `https`/`http` modules unless the plan explicitly requires a package placeholder
10. CRITICAL SECURITY RULE 1: NO DIRECT DATABASE ACCESS. Never import sqlite, pg, mysql, mongodb, etc.
11. CRITICAL SECURITY RULE 2: NO LOCAL FILESYSTEM ACCESS for host data. Do not read/write arbitrary local files.
12. CRITICAL SECURITY RULE 3: NEVER CALL EXTERNAL LLMs DIRECTLY. Use the internal gateway at `/api/llm/chat`.
13. JSDoc comments on all functions
14. Keep the module easy to extend into a larger Node.js bundle later if needed

15. The bundle includes helper modules such as `./parse.mjs`, `./classify.mjs`, `./normalize.mjs`,
    `./planner.mjs`, `./renderer.mjs`, and optionally `./orchestration.mjs`; import and use them cleanly
16. Export `respond(input, context = null)` for evaluator/runtime compatibility AND support CLI execution for sandbox-command

RETURN: ONLY the complete JavaScript code for `src/index.mjs` (no markdown fences, no explanation)."""

_SYS_CRITIC = """You are a senior code reviewer specializing in SmartAIHub skills.

Review the code against these criteria:
1. CONTRACT: Does respond() ALWAYS return a valid JSON string? Never throws?
2. CORRECTNESS: Does it implement ALL logic steps from the plan?
3. VALIDATION: Are ALL required inputs checked at the start?
4. EDGE CASES: Empty input, null/undefined fields, large inputs, invalid types?
5. SECURITY (CRITICAL): No eval(), no shell injection from untrusted input.
6. SECURITY (CRITICAL): NO direct database access imports (sqlite3, pg, etc.).
7. SECURITY (CRITICAL): NO local filesystem reads/writes (`open`, `fs.readFile`).
8. SECURITY (CRITICAL): NO direct external LLM API calls (openai, anthropic). MUST use `POST <publicUrl>/api/llm/chat` with `Authorization: Bearer <token>`.
9. QUALITY: No dead code, clear variable names, readable logic?
10. ERROR HANDLING: Every exception caught and returned as error JSON?

RETURN: valid JSON only:
{"issues": ["issue description", ...], "fixed_code": "...COMPLETE corrected code..."}
- issues: list (empty if none)
- fixed_code: the ENTIRE corrected file content (not a diff, not a snippet)."""

SUPPORTED_SKILL_CATEGORY_GUIDE = """
Supported categories and execution modes:
- article_generation -> llm-only
- slide_generation -> sandbox-command or sandbox-code or llm-only
- image_prompt_generation -> llm-only or enhance-prompt
- video_prompt_generation -> llm-only or enhance-prompt
- prompt_enhancement -> llm-only or enhance-prompt
- image_generation -> media-generate
- video_generation -> media-generate
- image_video_generation -> media-generate
- audio_generation -> media-generate
- sound_effects -> media-generate
- automation, code_assistant, document_analysis, web_search, data_analysis, translation, summarization, chat_assistant, other
  -> llm-only or python or sandbox-command or sandbox-code or sandbox-browser or sandbox-file

execution_mode describes runtime behavior, not the implementation language.
Use the dedicated prompt categories for prompt-creation skills instead of generic prompt_enhancement whenever possible.
"""


# ── Helpers ─────────────────────────────────────────────────────────────────────

def _log(msg: str) -> None:
    print(f"[ISC:creator] {msg}", file=sys.stderr, flush=True)


def _slugify(text: str) -> str:
    text = re.sub(r"[^\w\s-]", "", text.lower())
    text = re.sub(r"[\s_]+", "-", text.strip())
    return re.sub(r"-+", "-", text).strip("-")[:64]


def _normalize_javascript_runtime(plan: dict) -> str:
    runtime = str(plan.get("javascript_runtime", "auto")).strip().lower()
    if runtime in {"classic", "genjs"}:
        return runtime

    if str(plan.get("language", "python")).strip().lower() != "javascript":
        return "classic"

    complexity = str(plan.get("complexity", "moderate")).strip().lower()
    categories = {str(item).strip().lower() for item in plan.get("categories", []) if str(item).strip()}
    if complexity == "complex" or "slide_generation" in categories:
        return "genjs"
    return "classic"


def _javascript_code_relpath(plan: dict) -> str:
    return "src/index.mjs" if _normalize_javascript_runtime(plan) == "genjs" else "js/skill.js"


def _plan_text_blob(plan: dict) -> str:
    values = [
        plan.get("skill_title", ""),
        plan.get("description", ""),
        plan.get("purpose", ""),
        " ".join(str(item) for item in plan.get("logic_steps", [])),
        " ".join(str(item.get("name", "")) for item in plan.get("outputs", [])),
        " ".join(str(item) for item in plan.get("categories", [])),
    ]
    return " ".join(part for part in values if part).lower()


def _genjs_supports_pptx(plan: dict) -> bool:
    blob = _plan_text_blob(plan)
    return any(keyword in blob for keyword in ("pptx", "pptxgenjs", "powerpoint", "presentation", "slide", "deck", "storyboard"))


def _genjs_supported_outputs(plan: dict) -> list[str]:
    outputs = ["json", "md"]
    if _genjs_supports_pptx(plan):
        outputs.append("pptx")
    return outputs


def _build_genjs_package_json(plan: dict) -> str:
    package_json: dict[str, Any] = {
        "name": plan.get("skill_name", "generated-skill"),
        "version": "1.0.0",
        "private": True,
        "type": "module",
        "description": plan.get("description", "Generated GenJS skill bundle"),
        "scripts": {
            "start": "node src/index.mjs ./examples/demo.input.json ./dist",
            "build": "node src/index.mjs",
        },
        "dependencies": {},
    }
    if _genjs_supports_pptx(plan):
        package_json["dependencies"]["pptxgenjs"] = "^3.12.0"
    if not package_json["dependencies"]:
        package_json.pop("dependencies")
    return json.dumps(package_json, ensure_ascii=False, indent=2) + "\n"


def _build_genjs_command_manifest(plan: dict) -> str:
    manifest = {
        "name": plan.get("skill_name", "generated-skill"),
        "version": "1.0.0",
        "entry": "src/index.mjs",
        "runtimeProfile": "genjs",
        "executionMode": plan.get("execution_mode", "sandbox-command"),
        "skillFile": "SKILL.md",
        "schemas": {
            "input": "schemas/input.schema.json",
            "output": "schemas/output.schema.json",
            "ui": "schemas/ui.schema.json",
        },
        "pipelineStages": ["parse", "classify", "normalize", "plan", "render"],
        "orchestration": {
            "defaultMode": "local",
            "supportedModes": ["local", "skill-handoff", "agency-swarm", "hybrid"],
        },
        "supportedOutputs": _genjs_supported_outputs(plan),
    }
    return json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"


def _build_genjs_support_files(plan: dict) -> dict[str, str]:
    demo_request: dict[str, Any] = {
        "request": {
            "requestId": "demo-request",
            "prompt": plan.get("description", "") or plan.get("purpose", ""),
            "artifactType": "presentation" if _genjs_supports_pptx(plan) else "document",
            "outputFormats": _genjs_supported_outputs(plan),
            "content": {
                "rawText": plan.get("purpose", "") or plan.get("description", ""),
                "sections": [
                    {
                        "title": "Overview",
                        "text": plan.get("description", "") or plan.get("skill_title", "Generated Skill"),
                    },
                    {
                        "title": "Workflow",
                        "text": " -> ".join(str(step) for step in plan.get("logic_steps", [])) or "parse -> classify -> normalize -> plan -> render",
                    },
                ],
            },
            "renderOptions": {
                "jsonFileName": "result.json",
                "mdFileName": "result.md",
                "pptxFileName": "result.pptx",
            },
            "orchestration": {
                "mode": "local",
                "parallel": True,
                "objective": plan.get("purpose", "") or plan.get("description", ""),
                "skillTargets": [],
                "agencyTargets": [],
            },
        }
    }
    plan_json = json.dumps(
        {
            "skillName": plan.get("skill_name", "generated-skill"),
            "skillTitle": plan.get("skill_title", "Generated Skill"),
            "description": plan.get("description", ""),
            "purpose": plan.get("purpose", ""),
            "categories": plan.get("categories", []),
            "logicSteps": plan.get("logic_steps", []),
            "outputs": plan.get("outputs", []),
            "supportedOutputs": _genjs_supported_outputs(plan),
        },
        ensure_ascii=False,
        indent=2,
    )
    pptx_enabled_literal = "true" if _genjs_supports_pptx(plan) else "false"
    return {
        "src/parse.mjs": """export function parseSkillInput(rawInput) {
  if (typeof rawInput === "string") {
    try {
      return JSON.parse(rawInput);
    } catch {
      return {
        request: {
          prompt: rawInput,
        },
      };
    }
  }

  if (rawInput && typeof rawInput === "object") {
    return rawInput;
  }

  return {};
}

export function extractRequestPayload(parsedInput) {
  if (parsedInput && typeof parsedInput.request === "object" && !Array.isArray(parsedInput.request)) {
    return parsedInput.request;
  }
  return parsedInput && typeof parsedInput === "object" ? parsedInput : {};
}
""",
        "src/classify.mjs": """function normalizeFormatList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean);
}

export function classifyRequest(parsedInput, skillDefinition = {}) {
  const request = parsedInput && typeof parsedInput.request === "object" ? parsedInput.request : parsedInput;
  const requestedFormats = normalizeFormatList(request?.outputFormats || request?.formats || []);
  const joinedText = [
    skillDefinition.skillTitle,
    skillDefinition.description,
    request?.artifactType,
    request?.prompt,
    request?.requestType,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");

  const wantsSlides = /slide|deck|presentation|ppt|storyboard/.test(joinedText);
  const wantsAnalysis = /analysis|report|document|brief/.test(joinedText);

  return {
    artifactProfile: wantsSlides ? "slide-artifact" : wantsAnalysis ? "analysis-artifact" : "structured-artifact",
    pipelineStages: ["parse", "classify", "normalize", "plan", "render"],
    requestedFormats,
  };
}
""",
        "src/schema-helpers.mjs": """export function getRequiredFields(inputSchema = {}) {
  return Array.isArray(inputSchema.required) ? inputSchema.required : [];
}

export function ensureObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  return {};
}

export function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

export function isBlank(value) {
  return value == null || (typeof value === "string" && value.trim().length === 0);
}

export function pickKnownFields(payload, inputSchema = {}) {
  const source = ensureObject(payload);
  const properties = ensureObject(inputSchema.properties);
  const picked = {};
  for (const key of Object.keys(properties)) {
    if (key in source) {
      picked[key] = source[key];
    }
  }
  return picked;
}
""",
        "src/normalize.mjs": """import { ensureArray, ensureObject, getRequiredFields, isBlank, pickKnownFields } from "./schema-helpers.mjs";

function collectContentBlocks(requestPayload) {
  const request = ensureObject(requestPayload);
  const blocks = [];

  if (typeof request.prompt === "string" && request.prompt.trim()) {
    blocks.push({ type: "prompt", text: request.prompt.trim() });
  }

  const content = ensureObject(request.content);
  if (typeof content.rawText === "string" && content.rawText.trim()) {
    blocks.push({ type: "raw_text", text: content.rawText.trim() });
  }

  for (const item of ensureArray(content.sections || content.items || content.blocks)) {
    if (item && typeof item === "object") {
      const title = typeof item.title === "string" ? item.title.trim() : "";
      const body = typeof item.text === "string" ? item.text.trim() : typeof item.body === "string" ? item.body.trim() : "";
      if (title || body) {
        blocks.push({ type: "section", title, text: body });
      }
    } else if (typeof item === "string" && item.trim()) {
      blocks.push({ type: "section", text: item.trim() });
    }
  }

  for (const page of ensureArray(request.pages || content.pages)) {
    const pageObj = ensureObject(page);
    const title = typeof pageObj.title === "string" ? pageObj.title.trim() : "";
    const summary = typeof pageObj.summary === "string" ? pageObj.summary.trim() : "";
    const body = typeof pageObj.text === "string" ? pageObj.text.trim() : typeof pageObj.body === "string" ? pageObj.body.trim() : "";
    if (title || summary || body) {
      blocks.push({ type: "page", title, summary, text: body });
    }
  }

  return blocks;
}

export function normalizeRequest(parsedInput, classification, inputSchema = {}, skillDefinition = {}) {
  const request = parsedInput && typeof parsedInput.request === "object" ? parsedInput.request : parsedInput;
  const requestObject = ensureObject(request);
  const requiredFields = getRequiredFields(inputSchema);
  const fields = pickKnownFields(requestObject, inputSchema);
  const missingFields = requiredFields.filter((field) => isBlank(fields[field]) && isBlank(requestObject[field]));
  const contentBlocks = collectContentBlocks(requestObject);

  const requestedFormats = classification.requestedFormats.length
    ? classification.requestedFormats
    : Array.isArray(skillDefinition.supportedOutputs) && skillDefinition.supportedOutputs.length
      ? skillDefinition.supportedOutputs
      : ["json"];

  const renderOptions = ensureObject(requestObject.renderOptions);
  return {
    request: requestObject,
    fields,
    missingFields,
    orchestration: ensureObject(requestObject.orchestration),
    requestedFormats,
    renderOptions: {
      jsonFileName: typeof renderOptions.jsonFileName === "string" ? renderOptions.jsonFileName : "result.json",
      mdFileName: typeof renderOptions.mdFileName === "string" ? renderOptions.mdFileName : "result.md",
      pptxFileName: typeof renderOptions.pptxFileName === "string" ? renderOptions.pptxFileName : "result.pptx",
    },
    normalizedContent: {
      requestId: String(requestObject.requestId || skillDefinition.skillName || "generated-request"),
      prompt: typeof requestObject.prompt === "string" ? requestObject.prompt : "",
      blocks: contentBlocks,
      metadata: ensureObject(requestObject.metadata),
      source: parsedInput,
    },
  };
}
""",
        "src/orchestration.mjs": """function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function ensureObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function resolveEndpointUrl(rawUrl, context) {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    return "";
  }

  if (/^https?:\\/\\//i.test(rawUrl)) {
    return rawUrl;
  }

  const baseUrl = context && typeof context === "object" && typeof context.publicUrl === "string"
    ? context.publicUrl.replace(/\\/$/, "")
    : "";
  if (!baseUrl) {
    return rawUrl;
  }

  return new URL(rawUrl, baseUrl + "/").toString();
}

async function postJson(url, payload, authToken) {
  if (typeof fetch !== "function") {
    throw new Error("Global fetch is unavailable in this runtime");
  }

  const headers = {
    "content-type": "application/json",
  };
  if (authToken) {
    headers.authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }

  if (!response.ok) {
    throw new Error(parsed?.error || parsed?.message || `HTTP ${response.status}`);
  }

  return parsed;
}

async function runTasks(taskFactories, executeInParallel) {
  if (executeInParallel) {
    return Promise.all(taskFactories.map((factory) => factory()));
  }

  const results = [];
  for (const factory of taskFactories) {
    results.push(await factory());
  }
  return results;
}

export function buildOrchestrationState({ normalizedRequest, executionPlan }) {
  const orchestration = ensureObject(normalizedRequest.orchestration);
  return {
    mode: String(orchestration.mode || "local").trim().toLowerCase(),
    executeInParallel: orchestration.parallel !== false,
    skillExecutionEndpoint: typeof orchestration.skillExecutionEndpoint === "string" ? orchestration.skillExecutionEndpoint : "",
    agencyExecutionEndpoint: typeof orchestration.agencyExecutionEndpoint === "string" ? orchestration.agencyExecutionEndpoint : "",
    skillTargets: ensureArray(orchestration.skillTargets),
    agencyTargets: ensureArray(orchestration.agencyTargets),
    objective: typeof orchestration.objective === "string" ? orchestration.objective : executionPlan.skillDefinition.description || "",
  };
}

export async function maybeExecuteOrchestration({ orchestrationState, normalizedRequest, executionPlan, context }) {
  if (!orchestrationState || orchestrationState.mode === "local" || orchestrationState.mode === "none") {
    return {
      executed: false,
      mode: "local",
      results: [],
    };
  }

  const authToken = context && typeof context === "object" ? context.userToken || context.authToken || "" : "";
  const output = {
    executed: false,
    mode: orchestrationState.mode,
    results: [],
    warnings: [],
  };
  const resolvedSkillEndpoint = resolveEndpointUrl(orchestrationState.skillExecutionEndpoint, context);
  const resolvedAgencyEndpoint = resolveEndpointUrl(orchestrationState.agencyExecutionEndpoint, context);

  if ((orchestrationState.mode === "skill-handoff" || orchestrationState.mode === "hybrid") && orchestrationState.skillTargets.length > 0) {
    if (!resolvedSkillEndpoint) {
      output.warnings.push("skill handoff requested but skillExecutionEndpoint is missing");
    } else {
      const taskFactories = orchestrationState.skillTargets.map((target) => () =>
        postJson(
          resolvedSkillEndpoint,
          {
            skillId: target.skillId,
            prompt: target.prompt || normalizedRequest.request.prompt || executionPlan.skillDefinition.description || "",
            input: ensureObject(target.input || target.params || normalizedRequest.request),
            extraParams: target.input || target.params || {},
            normalizedContent: normalizedRequest.normalizedContent,
            layoutSpec: executionPlan.layoutSpec,
          },
          authToken
        )
      );
      output.results.push(...(await runTasks(taskFactories, orchestrationState.executeInParallel)));
      output.executed = true;
    }
  }

  if ((orchestrationState.mode === "agency-swarm" || orchestrationState.mode === "hybrid") && orchestrationState.agencyTargets.length > 0) {
    if (!resolvedAgencyEndpoint) {
      output.warnings.push("agency swarm requested but agencyExecutionEndpoint is missing");
    } else {
      const taskFactories = orchestrationState.agencyTargets.map((target) => () =>
        postJson(
          resolvedAgencyEndpoint.replace(/\\/$/, "") + `/${encodeURIComponent(String(target.agencyId || target.id || ""))}/stream`,
          {
            message: target.message || orchestrationState.objective,
            metadata: {
              sourceSkill: executionPlan.skillDefinition.skillName,
              objective: orchestrationState.objective,
            },
          },
          authToken
        )
      );
      output.results.push(...(await runTasks(taskFactories, orchestrationState.executeInParallel)));
      output.executed = true;
    }
  }

  return output;
}
""",
        "src/planner.mjs": f"""const SKILL_DEFINITION = {plan_json};

function makeSlideTitle(block, index) {{
  const title = typeof block.title === "string" && block.title.trim() ? block.title.trim() : "";
  return title || `Section ${{index + 1}}`;
}}

export function buildExecutionPlan({{ classification, normalizedRequest }}) {{
  const blocks = Array.isArray(normalizedRequest.normalizedContent.blocks) ? normalizedRequest.normalizedContent.blocks : [];
  const slidePlan = blocks.map((block, index) => {{
    const text = typeof block.text === "string" ? block.text : "";
    const summary = typeof block.summary === "string" ? block.summary : text.slice(0, 220);
    return {{
      id: `slide-${{index + 1}}`,
      title: makeSlideTitle(block, index),
      summary,
      body: text,
      renderMode: classification.artifactProfile,
      objectHints: {{
        emphasis: index === 0 ? "hero" : "body",
        layout: classification.artifactProfile === "slide-artifact" ? "editorial-card" : "structured-section",
      }},
    }};
  }});

  const layoutSpec = {{
    version: "1.0",
    skill: SKILL_DEFINITION.skillName,
    title: SKILL_DEFINITION.skillTitle,
    artifactProfile: classification.artifactProfile,
    pipelineStages: classification.pipelineStages,
    normalizedContent: normalizedRequest.normalizedContent,
    slidePlan,
  }};

  return {{
    skillDefinition: SKILL_DEFINITION,
    layoutSpec,
    slidePlan,
    normalizedContent: normalizedRequest.normalizedContent,
    orchestrationMode: normalizedRequest.orchestration?.mode || "local",
  }};
}}
""",
        "src/renderer.mjs": f"""import fs from "node:fs/promises";
import path from "node:path";

const PPTX_ENABLED = {pptx_enabled_literal};

function toMarkdown(executionPlan) {{
  const lines = [
    `# ${{executionPlan.skillDefinition.skillTitle || executionPlan.skillDefinition.skillName}}`,
    "",
    `Artifact profile: ${{executionPlan.layoutSpec.artifactProfile}}`,
    "",
  ];

  for (const slide of executionPlan.slidePlan) {{
    lines.push(`## ${{slide.title}}`);
    if (slide.summary) lines.push(slide.summary);
    if (slide.body) {{
      lines.push("");
      lines.push(slide.body);
    }}
    lines.push("");
  }}

  return lines.join("\\n").trim() + "\\n";
}}

async function writeFileIfRequested(outDir, fileName, content) {{
  if (!outDir) return null;
  await fs.mkdir(outDir, {{ recursive: true }});
  const targetPath = path.join(outDir, fileName);
  await fs.writeFile(targetPath, content, "utf8");
  return targetPath;
}}

async function tryWritePptx(executionPlan, outDir, fileName) {{
  if (!outDir || !PPTX_ENABLED) return null;
  try {{
    const module = await import("pptxgenjs");
    const PptxGenJS = module.default || module;
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    for (const slidePlan of executionPlan.slidePlan.length ? executionPlan.slidePlan : [{{ title: executionPlan.skillDefinition.skillTitle, body: executionPlan.skillDefinition.description }}]) {{
      const slide = pptx.addSlide();
      slide.addText(String(slidePlan.title || executionPlan.skillDefinition.skillTitle || "Generated Slide"), {{
        x: 0.5, y: 0.4, w: 12.2, h: 0.6, fontSize: 24, bold: true,
      }});
      slide.addText(String(slidePlan.summary || slidePlan.body || executionPlan.skillDefinition.description || ""), {{
        x: 0.7, y: 1.3, w: 11.6, h: 4.8, fontSize: 15, color: "333333", valign: "top",
      }});
    }}
    await fs.mkdir(outDir, {{ recursive: true }});
    const targetPath = path.join(outDir, fileName);
    await pptx.writeFile({{ fileName: targetPath }});
    return targetPath;
  }} catch (error) {{
    return {{
      skipped: true,
      reason: String(error && error.message ? error.message : error),
    }};
  }}
}}

export async function renderArtifacts({{ normalizedRequest, executionPlan, outDir }}) {{
  const jsonText = JSON.stringify(executionPlan.layoutSpec, null, 2);
  const markdownText = toMarkdown(executionPlan);
  const result = {{
    normalizedContent: normalizedRequest.normalizedContent,
    slidePlan: executionPlan.slidePlan,
    layoutSpec: executionPlan.layoutSpec,
    files: {{}},
    warnings: [],
  }};

  const formats = normalizedRequest.requestedFormats;
  if (formats.includes("json")) {{
    const written = await writeFileIfRequested(outDir, normalizedRequest.renderOptions.jsonFileName, jsonText);
    if (written) result.files.json = written;
  }}

  if (formats.includes("md")) {{
    const written = await writeFileIfRequested(outDir, normalizedRequest.renderOptions.mdFileName, markdownText);
    if (written) result.files.md = written;
  }}

  if (formats.includes("pptx")) {{
    const written = await tryWritePptx(executionPlan, outDir, normalizedRequest.renderOptions.pptxFileName);
    if (written && typeof written === "string") {{
      result.files.pptx = written;
    }} else if (written && typeof written === "object") {{
      result.warnings.push(`pptx render skipped: ${{written.reason}}`);
    }}
  }}

  return result;
}}
""",
        "examples/demo.input.json": json.dumps(demo_request, ensure_ascii=False, indent=2) + "\n",
    }


def _write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _llm_json(client: OpenAICompatibleClient, system: str, user: str) -> Any:
    """Call LLM expecting JSON; retries 3× with exponential backoff."""
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]
    last_err: Exception | None = None
    raw = ""
    for attempt in range(3):
        try:
            raw = client.chat(messages)
            clean = re.sub(r"^```(?:json)?\s*\n?", "", raw.strip())
            clean = re.sub(r"\n?```\s*$", "", clean.strip())
            return json.loads(clean)
        except Exception as e:
            last_err = e
            _log(f"  JSON parse attempt {attempt + 1}/3 failed: {e}")
            if attempt < 2:
                time.sleep(2 ** attempt)
    raise RuntimeError(
        f"LLM JSON parse failed after 3 attempts: {last_err}\nRaw (first 500): {raw[:500]}"
    )


def _llm_text(client: OpenAICompatibleClient, system: str, user: str) -> str:
    """Call LLM expecting plain text; returns stripped string."""
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]
    return client.chat(messages).strip()


# ── SkillCreator ────────────────────────────────────────────────────────────────

class SkillCreator:
    """
    Multi-agent pipeline that creates a complete SmartAIHub skill from a description.

    Always produces:
      schemas/input.schema.json   (MANDATORY)
      schemas/output.schema.json  (MANDATORY)
      schemas/ui.schema.json      (MANDATORY)
      skill.md
      python/skill.py  OR  js/skill.js  OR  skill.manifest.json + src/index.mjs
      tests/tests.json
    """

    def __init__(
        self,
        llm_client: OpenAICompatibleClient,
        skills_root: Path,
        safety_cfg: dict | None = None,
    ) -> None:
        self.client = llm_client
        self.skills_root = Path(skills_root)
        self._active_exemplar_context = "(no exemplar context prepared)"
        self.safety_cfg = safety_cfg or {
            "restrict_paths_under_skills": True,
            "disallow_new_deps_in_skill_py": True,
            "require_respond_signature": True,
        }

    # ── Public entry ────────────────────────────────────────────────────────────

    def create(
        self,
        description: str,
        skill_name: str | None = None,
        language: str = "auto",
        complexity: str = "moderate",
        target_platform: str = "classic",
        native_authoring: dict | None = None,
    ) -> CreatedSkill:
        """
        Run the 7-phase creation pipeline.

        Args:
            description: Natural language description of what the skill should do.
            skill_name:  Optional slug override; auto-generated from description if None.
            language:    "python" | "javascript" | "auto"
            complexity:  "simple" | "moderate" | "complex"

        Returns:
            CreatedSkill with paths and summary.
        """
        target_platform = str(target_platform or "classic").strip().lower()
        if target_platform in {"agents_python", "native", "native_bundle", "native-bundle"}:
            return self.create_native_bundle(
                description=description,
                skill_name=skill_name,
                complexity=complexity,
                native_authoring=native_authoring,
            )

        # Phase 1: Plan
        self._active_exemplar_context = self._build_exemplar_context(description)
        _log("Phase 1/7 — Planning skill architecture")
        plan = self._phase_plan(description, language, complexity)
        if skill_name:
            plan["skill_name"] = _slugify(skill_name)
        elif not plan.get("skill_name"):
            # LLM omitted skill_name — derive a safe fallback from the description
            plan["skill_name"] = _slugify(description[:40]) or "generated-skill"

        _log(f"  → skill_name='{plan['skill_name']}' language={plan.get('language')} complexity={plan.get('complexity')}")

        # Phase 2: Schemas (all 3, mandatory)
        _log("Phase 2/7 — Designing schemas (input + output + ui)")
        input_schema = self._phase_input_schema(plan)
        output_schema = self._phase_output_schema(plan)
        ui_schema = self._phase_ui_schema(plan, input_schema)

        # Phase 3: skill.md
        _log("Phase 3/7 — Generating skill.md")
        skill_md = self._phase_skill_md(plan)

        # Phase 4: Code generation
        _log(f"Phase 4/7 — Generating {plan.get('language', 'python')} code")
        skill_code = self._phase_code(plan, input_schema, output_schema)

        # Phase 5: Critic review
        _log("Phase 5/7 — Critic reviewing & fixing code")
        skill_code, critic_issues = self._phase_critic(plan, skill_code)
        if critic_issues:
            _log(f"  Critic found {len(critic_issues)} issue(s); applied fixes")

        # Phase 5.5: Security Check
        _log("Phase 5.5/7 — Enforcing Security Constraints")
        self._phase_security_check(skill_code, plan.get('language', 'python'))

        # Phase 6: Tests
        _log("Phase 6/7 — Generating test cases")
        tests = self._phase_tests(plan, input_schema)

        # Phase 6.5: Test-Driven Creation (Self-Correction)
        _log("Phase 6.5/7 — Test-Driven Creation (Self-Correction)")
        skill_code, tests = self._phase_tdc(
            plan,
            plan['skill_name'],
            skill_code,
            tests,
            output_schema,
        )

        # Phase 6.7: Dependencies
        _log("Phase 6.7/7 — Generating dependencies")
        dependencies = self._phase_dependencies(plan, skill_code)

        # Validation gate before writing anything to disk
        _log("Phase 6.9/7 — Validating generated artifacts")
        self._phase_validate_artifacts(
            plan=plan,
            input_schema=input_schema,
            output_schema=output_schema,
            ui_schema=ui_schema,
            skill_md=skill_md,
            tests=tests,
        )

        # Phase 7: Write to disk
        _log(f"Phase 7/7 — Writing to {self.skills_root / plan['skill_name']}")
        return self._phase_write(
            plan, input_schema, output_schema, ui_schema,
            skill_md, skill_code, tests, critic_issues, dependencies
        )

    def create_native_bundle(
        self,
        description: str,
        skill_name: str | None = None,
        complexity: str = "moderate",
        native_authoring: dict | None = None,
    ) -> CreatedSkill:
        """
        Create an OpenAI Agents Python native bundle scaffold.

        This path is optimized for native bundle compatibility rather than
        classic skill source generation. It produces the bundle contract files
        required by the native runtime and mirrors `skill.md` for registry
        compatibility.
        """
        self._active_exemplar_context = self._build_exemplar_context(description)
        _log("Phase 1/4 — Planning native bundle contract")
        plan = self._phase_plan(description, "python", complexity)
        plan["target_platform"] = "agents_python"
        plan["execution_mode"] = "sandbox-command"
        plan["category"] = "automation"
        skill_title = str(plan.get("skill_title") or "").strip()
        skill_name_value = str(plan.get("skill_name") or "").strip()
        plan["trigger_patterns"] = plan.get("trigger_patterns") or [
            skill_title.lower(),
            skill_name_value.replace("-", " "),
            "openai agents python",
            "native bundle",
        ]

        if skill_name:
            plan["skill_name"] = _slugify(skill_name)
        elif not plan.get("skill_name"):
            plan["skill_name"] = _slugify(description[:40]) or "generated-skill"

        native_authoring = native_authoring or {}
        if isinstance(native_authoring.get("subagents"), list):
            plan["subagents"] = native_authoring.get("subagents")
        if isinstance(native_authoring.get("orchestrator"), dict):
            plan["orchestrator"] = native_authoring.get("orchestrator")
        if isinstance(native_authoring.get("routing"), list):
            plan["routing"] = native_authoring.get("routing")
        for policy_key in ("checkpointPolicy", "verificationPolicy", "fallbackPolicy", "securityPolicy"):
            if isinstance(native_authoring.get(policy_key), dict):
                plan[policy_key] = native_authoring.get(policy_key)

        native_plan = normalize_native_skill_plan(
            {
                "skill_name": plan["skill_name"],
                "skill_title": plan.get("skill_title", plan["skill_name"].replace("-", " ").title()),
                "description": plan.get("description", description),
                "version": "1.0.0",
                "category": plan.get("category", "automation"),
                "execution_mode": plan.get("execution_mode", "sandbox-command"),
                "inputs": plan.get("inputs", []),
                "outputs": plan.get("outputs", []),
                "workflow": plan.get("logic_steps", []),
                "guardrails": [
                    "Use the native OpenAI Agents Python bundle contract.",
                    "Keep run/verify scripts deterministic and shell-safe.",
                    "Prefer structured outputs and resumable artifacts.",
                ],
                "verification": "scripts/verify.sh",
                "final_response_checklist": [
                    "Native bundle contract files exist.",
                    "scripts/verify.sh passes.",
                    "No secret or environment leakage in bundle files.",
                ],
                "trigger_patterns": plan.get("trigger_patterns", []),
                "subagents": plan.get("subagents", []),
                "orchestrator": plan.get("orchestrator", {}),
                "routing": plan.get("routing", []),
                "checkpointPolicy": plan.get("checkpointPolicy", {}),
                "verificationPolicy": plan.get("verificationPolicy", {}),
                "fallbackPolicy": plan.get("fallbackPolicy", {}),
                "securityPolicy": plan.get("securityPolicy", {}),
                "subagent_manifest_version": plan.get("subagent_manifest_version", "1"),
                "model_compatibility": {
                    "tier": "Tier A - Agents SDK ready",
                    "hard_minimum": [
                        "OpenAI Agents SDK sandbox Skills mounting",
                        "tool calling or handoff-compatible runtime",
                        "deterministic run / verify scripts",
                    ],
                    "recommended": [
                        "structured outputs",
                        "explicit context injection",
                        "trace-friendly logs",
                    ],
                    "optional": [
                        "handoffs",
                        "multi-agent orchestration",
                    ],
                    "caveats": [
                        "Keep bundle scripts deterministic and side-effect clear.",
                    ],
                },
            }
        )

        _log(f"  → skill_name='{native_plan['skill_name']}' target_platform=agents_python")
        _log("Phase 2/4 — Writing native bundle files")
        skill_dir = self.skills_root / native_plan["skill_name"]
        written_paths = write_native_skill_bundle(skill_dir, native_plan, overwrite=True)
        validation_results = validate_native_skill_bundle(skill_dir)
        errors = [error for result in validation_results if not result.ok for error in result.errors]
        if errors:
            raise RuntimeError("Native bundle validation failed: " + "; ".join(errors))

        summary = "\n".join(
            [
                "Target platform: agents_python",
                f"Files written: {len(written_paths)}",
                "Bundle validated: yes",
                "OpenAI Agents SDK ready: yes",
            ]
        )
        return CreatedSkill(
            skill_name=native_plan["skill_name"],
            skill_path=str(skill_dir),
            files_written=[str(path.relative_to(skill_dir)) for path in written_paths],
            language="python",
            summary=summary,
            warnings=[],
        )

    def convert_from_workflow(
        self,
        workflow: dict,
        description: str,
        skill_name: str | None = None,
        language: str = "auto",
        complexity: str = "moderate",
    ) -> CreatedSkill:
        """
        Convert a Virtual Workflow (ReactFlow JSON) to a complete SmartAIHub skill.

        The pipeline runs the same 7 phases as `create()` but the planner
        receives the full workflow structure so it can faithfully translate
        nodes and edges into equivalent skill logic.

        Args:
            workflow:    Parsed Virtual Workflow dict {nodes, edges}.
            description: Human-readable summary of the workflow (pre-built by caller).
            skill_name:  Optional slug override.
            language:    "python" | "javascript" | "auto"
            complexity:  "simple" | "moderate" | "complex"

        Returns:
            CreatedSkill with paths and summary.
        """
        nodes: list = workflow.get("nodes", [])
        edges: list = workflow.get("edges", [])

        # Build a concise workflow spec for the planner
        workflow_spec = {
            "node_count": len(nodes),
            "edge_count": len(edges),
            "nodes": [
                {
                    "id": n.get("id"),
                    "nodeType": n.get("data", {}).get("nodeType", n.get("type")),
                    "label": n.get("data", {}).get("label", ""),
                    "config": n.get("data", {}).get("config", {}),
                }
                for n in nodes
            ],
            "edges": [
                {"source": e.get("source"), "target": e.get("target")}
                for e in edges
            ],
        }

        # Phase 1: Plan (workflow-aware)
        self._active_exemplar_context = self._build_exemplar_context(description)
        _log("Phase 1/7 — Planning skill architecture from workflow")
        plan = self._phase_plan_from_workflow(description, workflow_spec, language, complexity)
        if skill_name:
            plan["skill_name"] = _slugify(skill_name)
        elif not plan.get("skill_name"):
            plan["skill_name"] = _slugify(description[:40]) or "workflow-skill"

        _log(f"  → skill_name='{plan['skill_name']}' language={plan.get('language')}")

        # Phases 2-7: same as regular create()
        _log("Phase 2/7 — Designing schemas (input + output + ui)")
        input_schema = self._phase_input_schema(plan)
        output_schema = self._phase_output_schema(plan)
        ui_schema = self._phase_ui_schema(plan, input_schema)

        _log("Phase 3/7 — Generating skill.md")
        skill_md = self._phase_skill_md(plan)

        _log(f"Phase 4/7 — Generating {plan.get('language', 'python')} code")
        skill_code = self._phase_code_from_workflow(plan, input_schema, output_schema, workflow_spec)

        _log("Phase 5/7 — Critic reviewing & fixing code")
        skill_code, critic_issues = self._phase_critic(plan, skill_code)
        if critic_issues:
            _log(f"  Critic found {len(critic_issues)} issue(s); applied fixes")

        _log("Phase 5.5/7 — Enforcing Security Constraints")
        self._phase_security_check(skill_code, plan.get('language', 'python'))

        _log("Phase 6/7 — Generating test cases")
        tests = self._phase_tests(plan, input_schema)

        _log("Phase 6.5/7 — Test-Driven Creation (Self-Correction)")
        skill_code, tests = self._phase_tdc(
            plan,
            plan['skill_name'],
            skill_code,
            tests,
            output_schema,
        )

        _log("Phase 6.7/7 — Generating dependencies")
        dependencies = self._phase_dependencies(plan, skill_code)

        _log("Phase 6.9/7 — Validating generated artifacts")
        self._phase_validate_artifacts(
            plan=plan,
            input_schema=input_schema,
            output_schema=output_schema,
            ui_schema=ui_schema,
            skill_md=skill_md,
            tests=tests,
        )

        _log(f"Phase 7/7 — Writing to {self.skills_root / plan['skill_name']}")
        return self._phase_write(
            plan, input_schema, output_schema, ui_schema,
            skill_md, skill_code, tests, critic_issues, dependencies
        )

    # ── Phase 1: Plan ───────────────────────────────────────────────────────────

    def _phase_plan(self, description: str, language: str, complexity: str) -> dict:
        prompt = f"""Analyze this skill request and design the complete architecture.

DESCRIPTION: {description}
PREFERRED LANGUAGE: {language}  (auto = choose best between python and javascript)
COMPLEXITY: {complexity}

LOCAL SKILL EXEMPLARS:
{self._active_exemplar_context}

{SUPPORTED_SKILL_CATEGORY_GUIDE}

Return this EXACT JSON structure (no omissions):
{{
  "skill_name": "kebab-case-unique-slug",
  "skill_title": "Human Readable Title (max 60 chars)",
  "description": "One concise sentence — what this skill does",
  "language": "python",
  "javascript_runtime": "classic",
  "complexity": "moderate",
  "execution_mode": "llm-only",
  "purpose": "2-3 sentences explaining value, typical use cases, and who benefits",
  "inputs": [
    {{"name": "field_name", "type": "string|number|boolean|array|object", "required": true,
      "description": "clear description of this input", "example": "example value"}},
    ...
  ],
  "outputs": [
    {{"name": "field_name", "type": "string|number|boolean|array|object",
      "description": "what this output field contains"}},
    ...
  ],
  "logic_steps": [
    "Step 1: Parse and validate inputs",
    "Step 2: ...",
    "Step N: Format and return result as JSON"
  ],
  "algorithms": ["specific algorithm or approach used"],
  "external_apis": [],
  "categories": ["automation"],
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "trigger_patterns": ["en pattern|en variant", "thai pattern|thai variant"]
}}

Language selection:
- Python: math/stats, NLP, text processing, data parsing, CSV/JSON analysis, algorithms
- JavaScript: JSON/object structure, schema/prompt pipelines, async/API-like work, URL manipulation,
  templating, event logic, web automation, Node.js integration, PptxGenJS-friendly workflows

JavaScript runtime selection:
- Use `classic` for straightforward respond()-style skills in `js/skill.js`
- Use `genjs` for more complex Node.js ESM sandbox-command bundles with `skill.manifest.json` + `src/index.mjs`
- Prefer `genjs` when the task is heavy on structured JSON, schema mapping, prompt pipelines,
  APIs, web stack orchestration, or future package integrations

Category selection:
- Choose exactly one primary category from the supported list above.
- Set execution_mode to match that category.
- If the skill's main job is creating prompts for image/video models, use the dedicated prompt categories.

Be thorough with inputs and outputs — design a comprehensive, production-ready interface."""

        return _llm_json(self.client, _SYS_PLANNER, prompt)

    def _phase_plan_from_workflow(
        self, description: str, workflow_spec: dict, language: str, complexity: str
    ) -> dict:
        """Phase 1 variant: plan from a Virtual Workflow structure."""
        workflow_json = json.dumps(workflow_spec, ensure_ascii=False, indent=2)
        prompt = f"""Analyze this Virtual Workflow and design a self-contained skill that replicates its logic.

WORKFLOW STRUCTURE:
{workflow_json}

PREFERRED LANGUAGE: {language}  (auto = choose best)
COMPLEXITY: {complexity}

LOCAL SKILL EXEMPLARS:
{self._active_exemplar_context}

{SUPPORTED_SKILL_CATEGORY_GUIDE}

The skill must replicate EVERY node's logic as code — triggers become inputs,
AI/LLM nodes become function calls, data nodes become transformations, etc.

Return the EXACT same JSON structure as a standard skill plan:
{{
  "skill_name": "kebab-case-unique-slug",
  "skill_title": "Human Readable Title (max 60 chars)",
  "description": "One concise sentence — what this skill does",
  "language": "python",
  "javascript_runtime": "classic",
  "complexity": "moderate",
  "execution_mode": "llm-only",
  "purpose": "2-3 sentences — what the workflow does and who benefits from having it as a skill",
  "inputs": [
    {{"name": "field_name", "type": "string|number|boolean|array|object", "required": true,
      "description": "input derived from workflow trigger/input nodes", "example": "example value"}},
    ...
  ],
  "outputs": [
    {{"name": "field_name", "type": "string|number|boolean|array|object",
      "description": "output derived from workflow output nodes"}},
    ...
  ],
  "logic_steps": [
    "Step 1: Accept inputs (mapped from workflow trigger nodes)",
    "Step 2: [Each workflow node becomes a logic step]",
    "Step N: Return results from workflow output nodes"
  ],
  "algorithms": ["algorithms/approaches used by the workflow nodes"],
  "external_apis": ["any external services referenced in workflow configs"],
  "categories": ["automation"],
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "trigger_patterns": ["en pattern", "thai pattern"]
}}"""
        return _llm_json(self.client, _SYS_PLANNER, prompt)

    # ── Phase 2: Schemas ────────────────────────────────────────────────────────

    def _phase_input_schema(self, plan: dict) -> dict:
        genjs_hint = ""
        if plan.get("language") == "javascript" and _normalize_javascript_runtime(plan) == "genjs":
            genjs_hint = """

GENJS RUNTIME HINTS:
- Prefer JSON-heavy object structures that work naturally in Node.js pipelines
- For complex artifact skills, it is good to expose nested request objects such as:
  - `request.content`
  - `request.outputFormats`
  - `request.renderOptions`
  - `request.metadata`
- Add an OPTIONAL `request.orchestration` object when appropriate with fields such as:
  - `mode`: enum of `local`, `skill-handoff`, `agency-swarm`, `hybrid`
  - `parallel`: boolean
  - `objective`: string
  - `skillExecutionEndpoint`, `agencyExecutionEndpoint`: strings
  - `skillTargets`, `agencyTargets`: arrays of objects
- Favor schemas that make parse -> classify -> normalize -> plan -> render workflows explicit and modular
"""
        prompt = f"""Create input.schema.json for this SmartAIHub skill.

PLAN:
{json.dumps(plan, ensure_ascii=False, indent=2)}

LOCAL SKILL EXEMPLARS:
{self._active_exemplar_context}
{genjs_hint}

Return a COMPLETE JSON Schema (draft-07):
- "$schema": "http://json-schema.org/draft-07/schema#"
- "title": skill title
- "description": skill description
- "type": "object"
- "required": [array of required field names]
- "properties": every input from the plan PLUS useful optional parameters
  - Each property: type, description, [enum/minimum/maximum/pattern/default as appropriate]
  - For enum: add "enumDescriptions" object mapping each value to a description
  - For numbers: add minimum, maximum, multipleOf as appropriate
  - For file/image uploads: use type="string" (for single URL output) or type="array" with items type="string" (for multiple URLs)
- "examples": array with 2-3 complete valid example input objects
- "additionalProperties": false

Be comprehensive — add sensible optional parameters beyond the plan's basic inputs."""

        return _llm_json(self.client, _SYS_SCHEMA, prompt)

    def _phase_output_schema(self, plan: dict) -> dict:
        genjs_hint = ""
        if plan.get("language") == "javascript" and _normalize_javascript_runtime(plan) == "genjs":
            genjs_hint = """

GENJS OUTPUT HINTS:
- For artifact-oriented GenJS bundles, prefer structured outputs such as `layoutSpec`, `normalizedContent`, `slidePlan`, `files`, and `warnings`
- If orchestration is relevant, include a structured orchestration result object instead of flattening everything into `output`
- Keep the output schema friendly to APIs, frontends, and automation services that consume JSON directly
"""
        prompt = f"""Create output.schema.json for this SmartAIHub skill.

PLAN:
{json.dumps(plan, ensure_ascii=False, indent=2)}

LOCAL SKILL EXEMPLARS:
{self._active_exemplar_context}
{genjs_hint}

Return a COMPLETE JSON Schema (draft-07):
- "$schema": "http://json-schema.org/draft-07/schema#"
- "title": "{plan.get('skill_title', 'Skill')} Output"
- "description": "Output schema for {plan.get('skill_title', 'Skill')}"
- "type": "object"
- "required": ["success", "output"]
- "properties" MUST include:
  - "success": {{"type": "boolean", "description": "Whether execution succeeded"}}
  - "output": {{"type": "string", "description": "Human-readable result summary"}}
  - All output fields from the plan with full type specifications
  - Nested objects described as subschemas
- "examples": array with one success example and one failure example"""

        return _llm_json(self.client, _SYS_SCHEMA, prompt)

    def _phase_ui_schema(self, plan: dict, input_schema: dict) -> dict:
        skill_name = plan.get("skill_name", "skill")
        skill_title = plan.get("skill_title", "Skill")
        required_fields = input_schema.get("required", [])
        genjs_hint = ""
        if plan.get("language") == "javascript" and _normalize_javascript_runtime(plan) == "genjs":
            genjs_hint = """

GENJS UI HINTS:
- Put core JSON/content inputs in the first visible section
- Place advanced render/orchestration controls in collapsed sections
- If the schema includes orchestration settings, expose them as optional advanced controls rather than required fields
"""

        prompt = f"""Create ui.schema.json for this SmartAIHub skill's UI form.

PLAN:
{json.dumps(plan, ensure_ascii=False, indent=2)}

LOCAL SKILL EXEMPLARS:
{self._active_exemplar_context}

INPUT SCHEMA properties:
{json.dumps(input_schema.get('properties', {}), ensure_ascii=False, indent=2)}

Required fields: {json.dumps(required_fields)}
{genjs_hint}

Return this EXACT top-level structure:
{{
  "version": "1.0",
  "skillId": "{skill_name}",
  "title": "{skill_title}",
  "titleTh": "[Thai translation]",
  "description": "[English description]",
  "descriptionTh": "[Thai description]",
  "sections": [...],
  "outputMapping": {{}}
}}

Section design rules:
- First section: REQUIRED fields, collapsed=false (always visible)
- Additional sections: OPTIONAL/ADVANCED fields, collapsed=true
- Each section needs: id, title, titleTh, icon, collapsed, fields

Field design rules:
- EVERY field needs: id, type, label, labelTh, helpText, helpTextTh
- select: add "options": [{{"value": "v", "label": "L", "labelTh": "T"}}]
- slider/number: add min, max, step (numeric, not string)
- boolean: "default" must be boolean true/false
- text/textarea: add "placeholder" and "placeholderTh"
- slider: add "default" numeric value
- file/files: use "accept": "image/*" if it is an image upload field
- array: define "itemFields" (array of sub-fields defining each item's structure) and "itemLabel"

outputMapping: map EVERY field id → the matching input schema property name.

Thai labels must be proper, natural Thai text — not Google-Translate style."""

        return _llm_json(self.client, _SYS_SCHEMA, prompt)

    # ── Phase 3: skill.md ───────────────────────────────────────────────────────

    def _phase_skill_md(self, plan: dict) -> str:
        skill_name = plan.get("skill_name", "new-skill")
        skill_title = plan.get("skill_title", "New Skill")
        language = plan.get("language", "python")
        javascript_runtime = _normalize_javascript_runtime(plan)
        categories = plan.get("categories", ["general"])
        execution_mode = plan.get("execution_mode", "llm-only")
        tags = plan.get("tags", [])
        triggers = plan.get("trigger_patterns", [])
        purpose = plan.get("purpose", "")
        logic_steps = plan.get("logic_steps", [])
        inputs = plan.get("inputs", [])
        outputs = plan.get("outputs", [])

        tag_str = ", ".join(tags[:6])
        trigger_lines = "\n  - ".join(f'"{t}"' for t in triggers[:4])

        input_rows = "\n".join(
            f"| `{i.get('name', '')}` | {i.get('type', '')} "
            f"| {'required' if i.get('required') else 'optional'} "
            f"| {i.get('description', '')} |"
            for i in inputs
        ) or "| `input` | string | required | Main input |"

        output_rows = "\n".join(
            f"| `{o.get('name', '')}` | {o.get('type', '')} | {o.get('description', '')} |"
            for o in outputs
        ) or "| `output` | string | Skill result |"

        logic_str = "\n".join(f"{i + 1}. {s}" for i, s in enumerate(logic_steps))

        example_fields = []
        for inp in inputs[:4]:
            name = inp.get("name", "field")
            t = inp.get("type", "string")
            ex = inp.get("example", "example_value" if t == "string" else (1 if t == "number" else True))
            example_fields.append(
                f'  "{name}": "{ex}"' if t == "string" else f'  "{name}": {json.dumps(ex)}'
            )
        example_json = "{\n" + ",\n".join(example_fields) + "\n}"
        implementation_notes = (
            "- Python runtime: `python/skill.py`\n"
            if language == "python"
            else (
                "- JavaScript runtime profile: `GenJS bundle` (`skill.manifest.json` + `src/index.mjs`, sandbox-command)\n"
                "- Best for JSON/object-heavy transforms, schema pipelines, APIs, web stack glue, complex automation, and artifact generation\n"
                "- Optional `request.orchestration` can route downstream work to other skills or agency swarm endpoints while defaulting to local execution\n"
                if javascript_runtime == "genjs"
                else "- JavaScript runtime profile: `Classic JS` (`js/skill.js`, CommonJS respond entrypoint)\n"
            )
        )

        return f"""---
id: {skill_name}
name: {skill_title}
version: "1.0.0"
type: automation
languages: en, th
category: {categories[0] if categories else 'other'}
execution_mode: {execution_mode}
isAutoTrigger: false
enabledByDefault: false
visibleByDefault: true
priority: 5
tags: [{tag_str}]
triggerPatterns:
  - {trigger_lines}
---

# {skill_title}

{purpose}

## Capabilities
{chr(10).join(f'- {s}' for s in logic_steps)}

## Runtime Profile

{implementation_notes}

## Input Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
{input_rows}

## Output Fields

| Field | Type | Description |
|-------|------|-------------|
{output_rows}

## Schema Files

All schemas are in `schemas/` — mandatory for every SmartAIHub skill:
- `schemas/input.schema.json` — Input field validation & documentation
- `schemas/output.schema.json` — Output structure specification
- `schemas/ui.schema.json` — SmartAIHub UI form (Thai/English labels)

## Usage Example

```json
{example_json}
```

## Output Example

```json
{{
  "success": true,
  "output": "{skill_title} result..."
}}
```

## Generated By

Created by **Intelligence Skill Creator (ISC) v0.5.0**
"""

    # ── Phase 4: Code Generation ────────────────────────────────────────────────

    def _phase_code(self, plan: dict, input_schema: dict, output_schema: dict) -> str:
        language = plan.get("language", "python")
        javascript_runtime = _normalize_javascript_runtime(plan)
        js_code_path = _javascript_code_relpath(plan)
        plan_json = json.dumps(plan, ensure_ascii=False, indent=2)
        schemas_json = json.dumps(
            {"input": input_schema, "output": output_schema},
            ensure_ascii=False, indent=2,
        )

        if language == "python":
            system = _SYS_PYTHON
            prompt = f"""Write a COMPLETE, PRODUCTION-READY Python skill.

PLAN:
{plan_json}

LOCAL SKILL EXEMPLARS:
{self._active_exemplar_context}

SCHEMAS (input + output for reference):
{schemas_json}

Requirements:
1. Implement EVERY logic step from the plan — be thorough, not minimal
2. Helper functions for each major sub-task
3. Validate ALL required fields from input schema before any processing
4. Include sensible defaults for optional fields
5. Output must match the output schema structure
6. Make the skill genuinely useful and intelligent
7. Handle edge cases: empty strings, None values, out-of-range numbers

Write the complete python/skill.py now:"""
        else:
            system = _SYS_JS_GEN if javascript_runtime == "genjs" else _SYS_JS
            prompt = f"""Write a COMPLETE, PRODUCTION-READY JavaScript skill.

PLAN:
{plan_json}

LOCAL SKILL EXEMPLARS:
{self._active_exemplar_context}

SCHEMAS (input + output for reference):
{schemas_json}

Requirements:
1. Implement EVERY logic step from the plan — be thorough, not minimal
2. Helper functions for each major sub-task
3. Validate ALL required fields from input schema before any processing
4. Include sensible defaults for optional fields
5. Output must match the output schema structure
6. Make the skill genuinely useful and intelligent
7. Handle edge cases: empty strings, null values, out-of-range numbers
8. Lean into JavaScript strengths for JSON/object structure, schema mapping, prompt pipelines, API orchestration, and web stack logic
9. If the plan calls for GenJS, write modern ESM entry code for a sandbox-command bundle
10. For GenJS, export respond(), support CLI execution, and compose the pipeline through helper modules
11. For GenJS, support optional `request.orchestration` modes (`local`, `skill-handoff`, `agency-swarm`, `hybrid`) without requiring them for normal local execution

Write the complete {js_code_path} now:"""

        return _llm_text(self.client, system, prompt)

    def _phase_code_from_workflow(
        self,
        plan: dict,
        input_schema: dict,
        output_schema: dict,
        workflow_spec: dict,
    ) -> str:
        """Phase 4 variant: generate skill code that faithfully translates a workflow."""
        language = plan.get("language", "python")
        javascript_runtime = _normalize_javascript_runtime(plan)
        js_code_path = _javascript_code_relpath(plan)
        plan_json = json.dumps(plan, ensure_ascii=False, indent=2)
        schemas_json = json.dumps(
            {"input": input_schema, "output": output_schema},
            ensure_ascii=False, indent=2,
        )
        workflow_json = json.dumps(workflow_spec, ensure_ascii=False, indent=2)

        if language == "python":
            system = _SYS_PYTHON
            prompt = f"""Write a COMPLETE, PRODUCTION-READY Python skill that replicates a Virtual Workflow.

WORKFLOW STRUCTURE (translate each node into code):
{workflow_json}

PLAN:
{plan_json}

SCHEMAS (input + output for reference):
{schemas_json}

Requirements:
1. Translate EVERY workflow node into a corresponding function or code block
2. Preserve the data flow: edges define the execution order
3. Trigger/input nodes → skill inputs (already in input schema)
4. LLM/AI nodes → use urllib.request to call an LLM API if a base_url is configured
5. Data transform nodes → pure Python transformation functions
6. Output nodes → values in the final return dict
7. ALWAYS return a valid JSON string — never raise
8. Handle missing/null inputs gracefully

Write the complete python/skill.py now:"""
        else:
            system = _SYS_JS_GEN if javascript_runtime == "genjs" else _SYS_JS
            prompt = f"""Write a COMPLETE, PRODUCTION-READY JavaScript skill that replicates a Virtual Workflow.

WORKFLOW STRUCTURE (translate each node into code):
{workflow_json}

PLAN:
{plan_json}

SCHEMAS (input + output for reference):
{schemas_json}

Requirements:
1. Translate EVERY workflow node into a corresponding async function or code block
2. Preserve the data flow: edges define the execution order
3. Trigger/input nodes → skill inputs (already in input schema)
4. LLM/AI nodes → use built-in https module to call an LLM API if configured
5. Data transform nodes → pure JS transformation functions
6. Output nodes → values in the final return object
7. ALWAYS return a valid JSON string — never throw
8. Handle missing/null inputs gracefully
9. Keep JSON/object transformations explicit and easy to audit
10. For GenJS, export respond(), support CLI execution, and compose the pipeline through helper modules
11. For GenJS, keep optional downstream orchestration hooks easy to enable through `request.orchestration`

Write the complete {js_code_path} now:"""

        return _llm_text(self.client, system, prompt)

    # ── Phase 5: Critic Review ──────────────────────────────────────────────────

    def _phase_critic(self, plan: dict, code: str) -> tuple[str, list[str]]:
        language = plan.get("language", "python")
        plan_summary = json.dumps(
            {k: plan[k] for k in ("skill_title", "language", "logic_steps", "inputs", "outputs") if k in plan},
            ensure_ascii=False, indent=2,
        )
        prompt = f"""Review this {language} skill implementation.

PLAN SUMMARY:
{plan_summary}

CODE:
{code}

Return JSON: {{"issues": [...], "fixed_code": "...COMPLETE file content..."}}"""

        try:
            result = _llm_json(self.client, _SYS_CRITIC, prompt)
            issues: list[str] = result.get("issues", [])
            fixed: str = result.get("fixed_code", code)
            if not fixed or len(fixed.strip()) < 80:
                _log("  Critic returned too-short fixed_code — keeping original")
                fixed = code
            return fixed, issues
        except Exception as e:
            _log(f"  Critic phase non-fatal error: {e}")
            return code, []

    # ── Phase 5.5: Security Check ───────────────────────────────────────────────

    def _phase_security_check(self, code: str, language: str) -> None:
        """
        Scan the generated code using regex heuristics for forbidden operations.
        Raises an exception if violations are found so the creation halts rather
        than creating dangerous skills.
        """
        violations = []
        code_lower = code.lower()
        
        # 1. Direct LLM Calls
        if re.search(r'(api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com)', code_lower):
            violations.append("Direct LLM API call detected. Must use internal gateway (/api/llm/chat).")
            
        # 2. Database imports
        if language == "python":
            if re.search(r'^\s*import\s+(sqlite3|psycopg2|mysql|sqlalchemy|pymongo)', code, re.MULTILINE):
                violations.append("Direct Database import detected. Must use HTTP APIs/MCP.")
            if re.search(r'^\s*from\s+(sqlite3|psycopg2|mysql|sqlalchemy|pymongo)\s+import', code, re.MULTILINE):
                violations.append("Direct Database import detected. Must use HTTP APIs/MCP.")
            violations.extend(self._scan_python_ast_for_security_issues(code))
        else: # javascript
            if re.search(r'(require|import).*(sqlite|mysql|pg|mongodb|postgres)', code_lower):
                 violations.append("Direct Database import detected. Must use HTTP APIs/MCP.")
            if re.search(r'\b(child_process|exec|spawn|fork|execsync|spawnsync)\b', code_lower):
                 violations.append("Process execution detected in JavaScript skill. This is not allowed.")
            if re.search(r'\b(eval|function)\s*\(', code_lower):
                 violations.append("Dynamic code execution detected in JavaScript skill. This is not allowed.")

        # 3. File System Access
        if language == "python":
            if re.search(r'open\s*\(', code):
                 violations.append("File system access via open() detected. Must use HTTP APIs/MCP.")
            if re.search(r'open\s*\(.*,\s*[\'"]w[\'"]\)', code): # writing files
                 violations.append("File system write (open(..., 'w')) detected. Must use HTTP APIs/MCP.")
            if re.search(r'os\.(remove|rmdir|unlink|mkdir|makedirs|rename)', code):
                 violations.append("File system manipulation (os.*) detected. Must use HTTP APIs/MCP.")
        else:
            if re.search(r'fs\.(readFile|writeFile|unlink|mkdir|rename|appendFile|rm)', code):
                 violations.append("File system manipulation (fs.*) detected. Must use HTTP APIs/MCP.")

        if violations:
            msg = "\n".join(f"- {v}" for v in violations)
            raise RuntimeError(f"SECURITY CHECK FAILED. Code violates constraints:\n{msg}")

    def _scan_python_ast_for_security_issues(self, code: str) -> list[str]:
        violations: list[str] = []
        try:
            tree = ast.parse(code)
        except SyntaxError as e:
            return [f"Generated Python code is not valid syntax: {e}"]

        banned_imports = {"subprocess", "sqlite3", "psycopg2", "sqlalchemy", "pymongo"}
        banned_call_names = {"eval", "exec", "compile"}
        banned_attr_calls = {
            "Path.read_text",
            "Path.write_text",
            "Path.open",
            "os.system",
            "os.popen",
            "subprocess.run",
            "subprocess.Popen",
            "subprocess.call",
            "subprocess.check_call",
            "subprocess.check_output",
        }

        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name.split(".")[0] in banned_imports:
                        violations.append(f"Banned import detected: {alias.name}")
            elif isinstance(node, ast.ImportFrom):
                if node.module and node.module.split(".")[0] in banned_imports:
                    violations.append(f"Banned import detected: {node.module}")
            elif isinstance(node, ast.Call):
                func = node.func
                if isinstance(func, ast.Name) and func.id in banned_call_names:
                    violations.append(f"Dynamic code execution detected: {func.id}()")
                if isinstance(func, ast.Name) and func.id == "open":
                    violations.append("File system access detected: open()")
                if isinstance(func, ast.Attribute):
                    base = None
                    if isinstance(func.value, ast.Name):
                        base = func.value.id
                    elif isinstance(func.value, ast.Attribute) and isinstance(func.value.value, ast.Name):
                        base = f"{func.value.value.id}.{func.value.attr}"
                    if base:
                        dotted = f"{base}.{func.attr}"
                        if dotted in banned_attr_calls:
                            violations.append(f"Banned call detected: {dotted}()")
                    if func.attr in {"read_text", "write_text", "open"}:
                        violations.append(f"Path-based file access detected: .{func.attr}()")
        return violations

    # ── Phase 6: Test Generation ────────────────────────────────────────────────

    def _phase_tests(self, plan: dict, input_schema: dict) -> list[dict]:
        required = input_schema.get("required", [])
        prompt = f"""Generate comprehensive test cases for this SmartAIHub skill.

PLAN:
{json.dumps(plan, ensure_ascii=False, indent=2)}

LOCAL SKILL EXEMPLARS:
{self._active_exemplar_context}

INPUT SCHEMA required fields: {json.dumps(required)}

Return a JSON array of 5-6 test cases:
[
  {{
    "id": "test_001_happy_path",
    "input": {{"field": "value"}},
    "expected_contains": ["string that MUST appear in the raw output"],
    "forbidden_contains": ["unexpected text that must not appear"],
    "expected_success": true,
    "expected_json_paths": {{"success": true, "output": "some exact string or summary"}},
    "expected_schema_valid": true,
    "context": "What this test verifies"
  }},
  ...
]

Include:
1. Basic happy path (all required inputs, expected success)
2. Alternative valid input (different parameter combination)
3. Edge case: minimal/boundary input
4. Edge case: rich/complex input
5. Error case: missing required field → should return success=false
6. Error case: invalid type or out-of-range value → should return success=false

Rules:
- Every test must set expected_success
- Every test must set expected_schema_valid=true
- Use expected_json_paths for values that should be exact in parsed JSON
- Use expected_contains only for human-readable text fragments inside the raw output string
- Use forbidden_contains for text that should never appear"""

        try:
            tests = _llm_json(self.client, _SYS_PLANNER, prompt)
            if isinstance(tests, list):
                return tests
        except Exception as e:
            _log(f"  Test generation non-fatal error: {e}")
        return [
            {
                "id": "test_001_basic",
                "input": {},
                "expected_contains": ["success"],
                "forbidden_contains": [],
                "expected_success": False,
                "expected_json_paths": {},
                "expected_schema_valid": True,
                "context": "Basic smoke test",
            }
        ]

    # ── Phase 6.5: Test-Driven Creation ─────────────────────────────────────────

    def _phase_tdc(
        self,
        plan: dict,
        skill_name: str,
        skill_code: str,
        tests: list[dict],
        output_schema: dict,
    ) -> tuple[str, list[dict]]:
        """
        Write the skill to a temporary directory, run evaluators, and if tests fail,
        ask the LLM to fix the code. Max 2 iterations.
        """
        import tempfile
        import json
        from pathlib import Path
        from .evaluator import evaluate_from_path
        
        lang = plan.get('language', 'python')
        js_rel_path = _javascript_code_relpath(plan)
        genjs_support_files = _build_genjs_support_files(plan) if lang == "javascript" and _normalize_javascript_runtime(plan) == "genjs" else {}
        
        for iteration in range(2):
            with tempfile.TemporaryDirectory() as tmpdir:
                tmp_path = Path(tmpdir) / skill_name
                tmp_path.mkdir(parents=True, exist_ok=True)
                
                if lang == "python":
                    code_file = tmp_path / "python" / "skill.py"
                    rel_path = "python/skill.py"
                else:
                    code_file = tmp_path / js_rel_path
                    rel_path = js_rel_path
                    
                code_file.parent.mkdir(parents=True, exist_ok=True)
                code_file.write_text(skill_code, encoding="utf-8")

                for rel_path, content in genjs_support_files.items():
                    support_path = tmp_path / rel_path
                    support_path.parent.mkdir(parents=True, exist_ok=True)
                    support_path.write_text(content, encoding="utf-8")
                
                test_file = tmp_path / "tests.json"
                test_file.write_text(json.dumps({"tests": tests}, indent=2), encoding="utf-8")

                schema_dir = tmp_path / "schemas"
                schema_dir.mkdir(parents=True, exist_ok=True)
                (schema_dir / "output.schema.json").write_text(
                    json.dumps(output_schema, indent=2),
                    encoding="utf-8",
                )
                
                report = evaluate_from_path(tmp_path)
                
                if report.pass_rate >= 1.0:
                    _log(f"  TDC Iteration {iteration+1}: All tests passed!")
                    break
                    
                _log(f"  TDC Iteration {iteration+1}: {report.passed}/{report.total} tests passed. Asking LLM for fixes...")
                
                failed_tests = [r for r in report.results if not r.passed]
                failure_details = "\n".join(
                    [
                        f"- Test {r.test_id}: reasons={r.reasons} missing={r.missing} categories={r.categories}. Actual output: {r.output}"
                        for r in failed_tests
                    ]
                )
                
                system = f"You are an expert engineer. Your task is to fix the '{lang}' code so it passes the failing tests.\nOutput ONLY valid JSON where keys are file paths (e.g. '{rel_path}') and values are the FULL replacement string for that file.\nNo markdown, no explanations."
                user = f"Current code:\n{skill_code}\n\nFailing test results:\n{failure_details}\n\nPlease fix the code."
                
                try:
                    payload = self.client.chat([{"role":"system","content":system},{"role":"user","content":user}]).strip()
                    payload = payload.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
                    fixes = json.loads(payload)
                    for filepath, content in fixes.items():
                        if any(token in filepath for token in ("skill.py", "skill.js", "skill.mjs", "index.mjs")):
                            skill_code = content
                except Exception as e:
                    _log(f"  TDC Iteration {iteration+1}: Failed to parse LLM fix ({e}). Keeping previous code.")
                    break
        
        return skill_code, tests

    # ── Phase 6.7: Dependencies ─────────────────────────────────────────────────

    def _phase_dependencies(self, plan: dict, skill_code: str) -> str:
        if plan.get("language") == "javascript" and _normalize_javascript_runtime(plan) == "genjs":
            return _build_genjs_package_json(plan)
        _log("  Dependency generation disabled: ISC now defaults to stdlib/built-ins only")
        return ""

    # ── Phase 7: Write to Disk ──────────────────────────────────────────────────

    def _phase_validate_artifacts(
        self,
        *,
        plan: dict,
        input_schema: dict,
        output_schema: dict,
        ui_schema: dict,
        skill_md: str,
        tests: list[dict],
    ) -> None:
        results = collect_creation_validation_results(
            input_schema=input_schema,
            output_schema=output_schema,
            ui_schema=ui_schema,
            skill_md=skill_md,
            tests=tests,
            language=plan.get("language", "python"),
        )
        raise_for_validation_errors(results)

    def _phase_write(
        self,
        plan: dict,
        input_schema: dict,
        output_schema: dict,
        ui_schema: dict,
        skill_md: str,
        skill_code: str,
        tests: list[dict],
        critic_issues: list[str],
        dependencies: str = "",
    ) -> CreatedSkill:
        skill_name: str = plan["skill_name"]
        language: str = plan.get("language", "python")
        javascript_runtime = _normalize_javascript_runtime(plan)
        js_code_path = _javascript_code_relpath(plan)

        skill_dir = self.skills_root / skill_name
        skill_dir.mkdir(parents=True, exist_ok=True)

        schemas_dir = skill_dir / "schemas"
        schemas_dir.mkdir(exist_ok=True)

        files_written: list[str] = []

        # ── MANDATORY: all 3 schemas ──────────────────────────────────────────
        _write_json(schemas_dir / "input.schema.json", input_schema)
        files_written.append("schemas/input.schema.json")

        _write_json(schemas_dir / "output.schema.json", output_schema)
        files_written.append("schemas/output.schema.json")

        _write_json(schemas_dir / "ui.schema.json", ui_schema)
        files_written.append("schemas/ui.schema.json")

        # ── skill manifest aliases ────────────────────────────────────────────
        for manifest_name in ("skill.md", "SKILL.md"):
            (skill_dir / manifest_name).write_text(skill_md, encoding="utf-8")
            files_written.append(manifest_name)

        # ── Skill code ────────────────────────────────────────────────────────
        if language == "python":
            code_dir = skill_dir / "python"
            code_dir.mkdir(exist_ok=True)
            (code_dir / "skill.py").write_text(skill_code, encoding="utf-8")
            files_written.append("python/skill.py")
            if dependencies:
                (code_dir / "requirements.txt").write_text(dependencies, encoding="utf-8")
                files_written.append("python/requirements.txt")
        else:
            if javascript_runtime == "genjs":
                entry_path = skill_dir / js_code_path
                entry_path.parent.mkdir(parents=True, exist_ok=True)
                entry_path.write_text(skill_code, encoding="utf-8")
                files_written.append(js_code_path)

                for rel_path, content in _build_genjs_support_files(plan).items():
                    target = skill_dir / rel_path
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_text(content, encoding="utf-8")
                    files_written.append(rel_path)

                (skill_dir / "skill.manifest.json").write_text(
                    _build_genjs_command_manifest(plan),
                    encoding="utf-8",
                )
                files_written.append("skill.manifest.json")

                package_json = dependencies or _build_genjs_package_json(plan)
                (skill_dir / "package.json").write_text(package_json, encoding="utf-8")
                files_written.append("package.json")
            else:
                code_dir = skill_dir / "js"
                code_dir.mkdir(exist_ok=True)
                code_filename = Path(js_code_path).name
                (code_dir / code_filename).write_text(skill_code, encoding="utf-8")
                files_written.append(js_code_path)
                if dependencies:
                    (code_dir / "package.json").write_text(dependencies, encoding="utf-8")
                    files_written.append("js/package.json")

        # ── tests/tests.json ──────────────────────────────────────────────────
        tests_dir = skill_dir / "tests"
        tests_dir.mkdir(exist_ok=True)
        # Wrap in {"tests": [...]} so load_tests() and evaluate_from_path() can parse it
        _write_json(tests_dir / "tests.json", {"tests": tests})
        files_written.append("tests/tests.json")

        # ── Summary ───────────────────────────────────────────────────────────
        summary_lines = [
            f"Language: {language}",
            f"JavaScript runtime: {javascript_runtime}" if language == "javascript" else None,
            f"Complexity: {plan.get('complexity', 'moderate')}",
            f"Input fields: {len(plan.get('inputs', []))}",
            f"Output fields: {len(plan.get('outputs', []))}",
            f"Test cases: {len(tests)}",
            f"Critic fixes: {len(critic_issues)}",
        ]
        summary_lines = [line for line in summary_lines if line]
        if plan.get("external_apis"):
            summary_lines.append(f"External APIs referenced: {', '.join(plan['external_apis'])}")

        warnings: list[str] = list(critic_issues)
        if plan.get("external_apis"):
            warnings.append(
                f"Skill references external APIs: {', '.join(plan['external_apis'])}. "
                "Add authentication/key handling before production use."
            )

        return CreatedSkill(
            skill_name=skill_name,
            skill_path=str(skill_dir),
            files_written=files_written,
            language=language,
            summary="\n".join(summary_lines),
            warnings=warnings,
        )

    def _build_exemplar_context(self, query: str) -> str:
        exemplars = select_relevant_skill_exemplars(query, top_k=3, exclude_skill_names={"intelligence-skill-creator"})
        return format_exemplar_context(exemplars)
