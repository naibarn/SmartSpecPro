"""
isc/creator.py — Multi-agent skill creator for Intelligence Skill Creator v0.4.0

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
  schemas/ui.schema.json      — SmartSpecPro UI form (Thai + English)
  skill.md                    — manifest with YAML frontmatter
  python/skill.py OR js/skill.js
  tests/tests.json
  README.md
"""
from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path
from typing import Any

from isc.llm import OpenAICompatibleClient
from isc.models import CreatedSkill

# ── System prompts ──────────────────────────────────────────────────────────────

_SYS_PLANNER = """You are an expert SmartSpecPro skill architect.

Your job: analyze a user description and design a complete, production-quality skill.

SmartSpecPro skill conventions:
- Python skill: respond(input, context=None) -> str in python/skill.py
- JavaScript skill: async respond(input, context=null) -> str in js/skill.js
- Schemas ALWAYS go in schemas/: input.schema.json, output.schema.json, ui.schema.json
- skill.md has YAML frontmatter

Language selection heuristic:
- Python: math/stats, NLP, text processing, data parsing, complex algorithms, CSV/JSON analysis
- JavaScript: JSON transformation, async APIs, event-driven, templating, URL manipulation

RETURN: valid JSON only (no markdown fences, no preamble, no explanation)."""

_SYS_SCHEMA = """You are an expert JSON Schema and SmartSpecPro UI schema designer.

JSON Schema rules (draft-07):
- input.schema.json: validates skill inputs; use enum, pattern, minimum/maximum where helpful
- output.schema.json: describes the structured output object the skill returns

SmartSpecPro ui.schema.json rules:
- Sections group related fields; first section collapsed=false, rest collapsed=true
- Field types: text | textarea | select | boolean | slider | number
- Every field MUST have: id, type, label, labelTh, helpText, helpTextTh
- Select fields MUST have: options (array of {value, label, labelTh})
- Slider/number MUST have: min, max, step (all numeric)
- boolean MUST have: default (true/false, NOT string)
- Icons: sparkles, settings, zap, search, palette, camera, music, layers,
         type, video, code, brain, target, globe, filter, sliders, box

RETURN: valid JSON only (no markdown fences, no explanation)."""

_SYS_PYTHON = """You are an expert Python developer creating SmartSpecPro skill implementations.

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
10. Add full docstrings and type hints everywhere
11. Helper functions for complex sub-tasks
12. Make output SMART: validate, transform, format beautifully

RETURN: ONLY the complete Python code (no markdown fences, no explanation)."""

_SYS_JS = """You are an expert JavaScript developer creating SmartSpecPro skill implementations.

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
10. JSDoc comments on all functions
11. Helper functions for complex sub-tasks
12. `module.exports = { respond };` at bottom

RETURN: ONLY the complete JavaScript code (no markdown fences, no explanation)."""

_SYS_CRITIC = """You are a senior code reviewer specializing in SmartSpecPro skills.

Review the code against these criteria:
1. CONTRACT: Does respond() ALWAYS return a valid JSON string? Never throws?
2. CORRECTNESS: Does it implement ALL logic steps from the plan?
3. VALIDATION: Are ALL required inputs checked at the start?
4. EDGE CASES: Empty input, null/undefined fields, large inputs, invalid types?
5. SECURITY: No eval(), no shell injection from untrusted input, no path traversal?
6. QUALITY: No dead code, clear variable names, readable logic?
7. ERROR HANDLING: Every exception caught and returned as error JSON?

RETURN: valid JSON only:
{"issues": ["issue description", ...], "fixed_code": "...COMPLETE corrected code..."}
- issues: list (empty if none)
- fixed_code: the ENTIRE corrected file content (not a diff, not a snippet)."""


# ── Helpers ─────────────────────────────────────────────────────────────────────

def _log(msg: str) -> None:
    print(f"[ISC:creator] {msg}", file=sys.stderr, flush=True)


def _slugify(text: str) -> str:
    text = re.sub(r"[^\w\s-]", "", text.lower())
    text = re.sub(r"[\s_]+", "-", text.strip())
    return re.sub(r"-+", "-", text).strip("-")[:64]


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
    Multi-agent pipeline that creates a complete SmartSpecPro skill from a description.

    Always produces:
      schemas/input.schema.json   (MANDATORY)
      schemas/output.schema.json  (MANDATORY)
      schemas/ui.schema.json      (MANDATORY)
      skill.md
      python/skill.py  OR  js/skill.js
      tests/tests.json
      README.md
    """

    def __init__(
        self,
        llm_client: OpenAICompatibleClient,
        skills_root: Path,
        safety_cfg: dict | None = None,
    ) -> None:
        self.client = llm_client
        self.skills_root = Path(skills_root)
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
        # Phase 1: Plan
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

        # Phase 6: Tests
        _log("Phase 6/7 — Generating test cases")
        tests = self._phase_tests(plan, input_schema)

        # Phase 7: Write to disk
        _log(f"Phase 7/7 — Writing to {self.skills_root / plan['skill_name']}")
        return self._phase_write(
            plan, input_schema, output_schema, ui_schema,
            skill_md, skill_code, tests, critic_issues,
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
        Convert a Virtual Workflow (ReactFlow JSON) to a complete SmartSpecPro skill.

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

        _log("Phase 6/7 — Generating test cases")
        tests = self._phase_tests(plan, input_schema)

        _log(f"Phase 7/7 — Writing to {self.skills_root / plan['skill_name']}")
        return self._phase_write(
            plan, input_schema, output_schema, ui_schema,
            skill_md, skill_code, tests, critic_issues,
        )

    # ── Phase 1: Plan ───────────────────────────────────────────────────────────

    def _phase_plan(self, description: str, language: str, complexity: str) -> dict:
        prompt = f"""Analyze this skill request and design the complete architecture.

DESCRIPTION: {description}
PREFERRED LANGUAGE: {language}  (auto = choose best between python and javascript)
COMPLEXITY: {complexity}

Return this EXACT JSON structure (no omissions):
{{
  "skill_name": "kebab-case-unique-slug",
  "skill_title": "Human Readable Title (max 60 chars)",
  "description": "One concise sentence — what this skill does",
  "language": "python",
  "complexity": "moderate",
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
  "categories": ["category1"],
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "trigger_patterns": ["en pattern|en variant", "thai pattern|thai variant"]
}}

Language selection:
- Python: math/stats, NLP, text processing, data parsing, CSV/JSON analysis, algorithms
- JavaScript: JSON transformation, async/API-like, URL manipulation, templating, event logic

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

The skill must replicate EVERY node's logic as code — triggers become inputs,
AI/LLM nodes become function calls, data nodes become transformations, etc.

Return the EXACT same JSON structure as a standard skill plan:
{{
  "skill_name": "kebab-case-unique-slug",
  "skill_title": "Human Readable Title (max 60 chars)",
  "description": "One concise sentence — what this skill does",
  "language": "python",
  "complexity": "moderate",
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
  "categories": ["category1"],
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "trigger_patterns": ["en pattern", "thai pattern"]
}}"""
        return _llm_json(self.client, _SYS_PLANNER, prompt)

    # ── Phase 2: Schemas ────────────────────────────────────────────────────────

    def _phase_input_schema(self, plan: dict) -> dict:
        prompt = f"""Create input.schema.json for this SmartSpecPro skill.

PLAN:
{json.dumps(plan, ensure_ascii=False, indent=2)}

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
- "examples": array with 2-3 complete valid example input objects
- "additionalProperties": false

Be comprehensive — add sensible optional parameters beyond the plan's basic inputs."""

        return _llm_json(self.client, _SYS_SCHEMA, prompt)

    def _phase_output_schema(self, plan: dict) -> dict:
        prompt = f"""Create output.schema.json for this SmartSpecPro skill.

PLAN:
{json.dumps(plan, ensure_ascii=False, indent=2)}

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

        prompt = f"""Create ui.schema.json for this SmartSpecPro skill's UI form.

PLAN:
{json.dumps(plan, ensure_ascii=False, indent=2)}

INPUT SCHEMA properties:
{json.dumps(input_schema.get('properties', {}), ensure_ascii=False, indent=2)}

Required fields: {json.dumps(required_fields)}

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

outputMapping: map EVERY field id → the matching input schema property name.

Thai labels must be proper, natural Thai text — not Google-Translate style."""

        return _llm_json(self.client, _SYS_SCHEMA, prompt)

    # ── Phase 3: skill.md ───────────────────────────────────────────────────────

    def _phase_skill_md(self, plan: dict) -> str:
        skill_name = plan.get("skill_name", "new-skill")
        skill_title = plan.get("skill_title", "New Skill")
        language = plan.get("language", "python")
        categories = plan.get("categories", ["general"])
        tags = plan.get("tags", [])
        triggers = plan.get("trigger_patterns", [])
        purpose = plan.get("purpose", "")
        logic_steps = plan.get("logic_steps", [])
        inputs = plan.get("inputs", [])
        outputs = plan.get("outputs", [])

        exec_mode = "python" if language == "python" else "javascript"
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

        return f"""---
id: {skill_name}
name: {skill_title}
version: "1.0.0"
type: automation
languages: en, th
category: {categories[0] if categories else 'general'}
execution_mode: {exec_mode}
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

## Input Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
{input_rows}

## Output Fields

| Field | Type | Description |
|-------|------|-------------|
{output_rows}

## Schema Files

All schemas are in `schemas/` — mandatory for every SmartSpecPro skill:
- `schemas/input.schema.json` — Input field validation & documentation
- `schemas/output.schema.json` — Output structure specification
- `schemas/ui.schema.json` — SmartSpecPro UI form (Thai/English labels)

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

Created by **Intelligence Skill Creator (ISC) v0.4.0**
"""

    # ── Phase 4: Code Generation ────────────────────────────────────────────────

    def _phase_code(self, plan: dict, input_schema: dict, output_schema: dict) -> str:
        language = plan.get("language", "python")
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
            system = _SYS_JS
            prompt = f"""Write a COMPLETE, PRODUCTION-READY JavaScript skill.

PLAN:
{plan_json}

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

Write the complete js/skill.js now:"""

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
            system = _SYS_JS
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

Write the complete js/skill.js now:"""

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

    # ── Phase 6: Test Generation ────────────────────────────────────────────────

    def _phase_tests(self, plan: dict, input_schema: dict) -> list[dict]:
        required = input_schema.get("required", [])
        prompt = f"""Generate comprehensive test cases for this SmartSpecPro skill.

PLAN:
{json.dumps(plan, ensure_ascii=False, indent=2)}

INPUT SCHEMA required fields: {json.dumps(required)}

Return a JSON array of 5-6 test cases:
[
  {{
    "id": "test_001_happy_path",
    "input": {{"field": "value"}},
    "expected_contains": ["string that MUST appear in output JSON"],
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
6. Error case: invalid type or out-of-range value → should return success=false"""

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
                "context": "Basic smoke test",
            }
        ]

    # ── Phase 7: Write to Disk ──────────────────────────────────────────────────

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
    ) -> CreatedSkill:
        skill_name: str = plan["skill_name"]
        language: str = plan.get("language", "python")

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

        # ── skill.md ──────────────────────────────────────────────────────────
        (skill_dir / "skill.md").write_text(skill_md, encoding="utf-8")
        files_written.append("skill.md")

        # ── Skill code ────────────────────────────────────────────────────────
        if language == "python":
            code_dir = skill_dir / "python"
            code_dir.mkdir(exist_ok=True)
            (code_dir / "skill.py").write_text(skill_code, encoding="utf-8")
            files_written.append("python/skill.py")
        else:
            code_dir = skill_dir / "js"
            code_dir.mkdir(exist_ok=True)
            (code_dir / "skill.js").write_text(skill_code, encoding="utf-8")
            files_written.append("js/skill.js")

        # ── tests/tests.json ──────────────────────────────────────────────────
        tests_dir = skill_dir / "tests"
        tests_dir.mkdir(exist_ok=True)
        # Wrap in {"tests": [...]} so load_tests() and evaluate_from_path() can parse it
        _write_json(tests_dir / "tests.json", {"tests": tests})
        files_written.append("tests/tests.json")

        # ── README.md ─────────────────────────────────────────────────────────
        readme = _build_readme(plan, files_written)
        (skill_dir / "README.md").write_text(readme, encoding="utf-8")
        files_written.append("README.md")

        # ── Summary ───────────────────────────────────────────────────────────
        summary_lines = [
            f"Language: {language}",
            f"Complexity: {plan.get('complexity', 'moderate')}",
            f"Input fields: {len(plan.get('inputs', []))}",
            f"Output fields: {len(plan.get('outputs', []))}",
            f"Test cases: {len(tests)}",
            f"Critic fixes: {len(critic_issues)}",
        ]
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


# ── README builder ──────────────────────────────────────────────────────────────

def _build_readme(plan: dict, files: list[str]) -> str:
    skill_title = plan.get("skill_title", plan.get("skill_name", "Skill"))
    description = plan.get("description", "")
    purpose = plan.get("purpose", "")
    language = plan.get("language", "python")
    complexity = plan.get("complexity", "moderate")
    logic_steps = plan.get("logic_steps", [])
    categories = plan.get("categories", [])
    tags = plan.get("tags", [])

    steps_str = "\n".join(f"{i + 1}. {s}" for i, s in enumerate(logic_steps))
    files_str = "\n".join(f"- `{f}`" for f in files)
    tags_str = " ".join(f"`{t}`" for t in tags[:8])

    return f"""# {skill_title}

> {description}

## About

{purpose}

**Language**: {language} | **Complexity**: {complexity} | **Category**: {', '.join(categories)}

**Tags**: {tags_str}

## Files

{files_str}

## Schemas

| File | Purpose |
|------|---------|
| `schemas/input.schema.json` | Input field validation & API documentation |
| `schemas/output.schema.json` | Output structure specification |
| `schemas/ui.schema.json` | SmartSpecPro UI form (Thai/English labels) |

## Logic

{steps_str}

---

*Generated by [Intelligence Skill Creator (ISC) v0.4.0](../intelligence-skill-creator/)*
"""
