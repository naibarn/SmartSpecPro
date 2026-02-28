"""
Intelligence Skill Creator (ISC) — SmartAIHub entry point v0.4.0

Two primary modes:
  create   — Multi-agent pipeline creates a FULL skill on disk:
               schemas/input.schema.json  (MANDATORY)
               schemas/output.schema.json (MANDATORY)
               schemas/ui.schema.json     (MANDATORY)
               skill.md, python/skill.py OR js/skill.js, tests/tests.json, README.md

  improve  — Iterative LLM + research improvement loop for existing ISC sandbox skills

Input formats accepted:
  - Flat dict (from UI form via outputMapping):
      {"mode": "create", "description": "...", "skill_language": "python", ...}
  - Legacy nested dict:
      {"prompt": "...", "params": {"mode": "improve", "skill_name": "...", ...}}
  - JSON string of either

Output: JSON string  {"success": bool, "output": str, ...}
"""
from __future__ import annotations

import json
import os
import re
import sys
import unicodedata
from pathlib import Path
from typing import Any

# ── Path setup ─────────────────────────────────────────────────────────────────
_SKILL_DIR = Path(__file__).resolve().parent.parent   # intelligence-skill-creator/
_ISC_DIR   = _SKILL_DIR / "isc"
SKILLS_ROOT = _SKILL_DIR.parent                        # apps/web/skills/

for _p in (str(_SKILL_DIR), str(_ISC_DIR.parent)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

ISC_ROOT = _SKILL_DIR   # for improve mode (sandbox skills live here)


# ── Logging ────────────────────────────────────────────────────────────────────

def _log(msg: str) -> None:
    print(f"[ISC] {msg}", file=sys.stderr, flush=True)


# ── Input normalisation ────────────────────────────────────────────────────────

def _normalise(raw: Any) -> dict:
    """
    Accept any of:
      - flat dict   {"mode": "create", "description": "..."}
      - nested dict {"prompt": "...", "params": {...}}
      - JSON string of either
    Returns a canonical flat dict with all fields at top-level.
    """
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            return {"prompt": raw}

    if not isinstance(raw, dict):
        return {}

    # Already flat (new UI form format)
    if any(k in raw for k in ("mode", "description", "skill_language", "skill_name")):
        return raw

    # Legacy nested format: {"prompt": "...", "params": {...}}
    flat: dict = {}
    if "prompt" in raw:
        flat["prompt"] = raw["prompt"]
    params = raw.get("params", {})
    if isinstance(params, dict):
        flat.update(params)
    flat.update({k: v for k, v in raw.items() if k not in ("prompt", "params")})
    return flat


# ── Mode detection ─────────────────────────────────────────────────────────────

_CREATE_RE = re.compile(
    r"(create|build|make|generate|สร้าง|เพิ่ม|ออกแบบ).{0,30}(skill|สกิล|ทักษะ)"
    r"|new skill|skill ใหม่|ทำ skill|สร้าง skill",
    re.IGNORECASE,
)
_IMPROVE_RE = re.compile(
    r"(improve|enhance|fix|optimize|ปรับปรุง|แก้ไข|พัฒนา).{0,30}(skill|สกิล)"
    r"|isc improve|iterate",
    re.IGNORECASE,
)


def _detect_mode(inp: dict) -> str:
    explicit = str(inp.get("mode", "")).lower()
    if explicit in ("create", "improve", "convert_workflow"):
        return explicit

    # If description present without skill_name → create
    if inp.get("description") and not inp.get("skill_name"):
        return "create"

    # If only skill_name present → improve
    if inp.get("skill_name") and not inp.get("description"):
        return "improve"

    prompt = str(inp.get("prompt", "")).lower()
    if _CREATE_RE.search(prompt):
        return "create"
    if _IMPROVE_RE.search(prompt) or inp.get("skill_name"):
        return "improve"

    return "help"


def _slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^\w\s-]", "", text).strip().lower()
    text = re.sub(r"[\s_-]+", "-", text)
    return re.sub(r"^-+|-+$", "", text)[:80] or "my-skill"


# ── LLM client factory ─────────────────────────────────────────────────────────

def _get_llm_client(inp: dict, context: Any = None):
    """Build OpenAICompatibleClient from flat UI fields, system gateway, or nested llm object.

    When llm_gateway_mode == 'system' (default), uses:
      - base_url: context.publicUrl + '/v1'  (SmartAIHub system gateway)
      - api_key:  context.userToken          (JWT; gateway tracks credits automatically)
      - model:    inp['llm_model_search']    (selected from system model list)

    When llm_gateway_mode == 'custom' (or legacy), uses:
      - base_url: inp['llm_base_url'] or env ISC_LLM_BASE_URL
      - api_key:  env ISC_LLM_API_KEY
      - model:    inp['llm_model']
    """
    from isc.llm import load_llm_config_from_env, merge_llm_config, OpenAICompatibleClient

    env_cfg = load_llm_config_from_env()
    override: dict = {}

    gateway_mode = inp.get("llm_gateway_mode", "system")

    if gateway_mode == "system":
        # Use context-provided system gateway
        ctx = context if isinstance(context, dict) else {}
        public_url: str = ctx.get("publicUrl", "").rstrip("/")
        user_token: str = ctx.get("userToken", "")
        model_id: str = (inp.get("llm_model_search") or inp.get("llm_model") or "").strip()

        if not model_id:
            raise RuntimeError(
                "No model selected for the System Gateway.\n"
                "Open the LLM Configuration section and choose a model from the list."
            )

        if public_url and user_token:
            override["base_url"] = public_url + "/v1"
            override["api_key"] = user_token
            override["model"] = model_id
        else:
            # Context not available (e.g. CLI run) — fall back to env config
            _log("System gateway requested but no context available — falling back to env config")
            override["model"] = model_id
    else:
        # Custom API key mode
        if inp.get("llm_base_url"):
            override["base_url"] = inp["llm_base_url"]
        if inp.get("llm_model"):
            override["model"] = inp["llm_model"]

    # Common fields (both modes)
    if inp.get("llm_temperature") is not None:
        override["temperature"] = float(inp["llm_temperature"])
    if inp.get("llm_timeout_s"):
        override["timeout_s"] = int(inp["llm_timeout_s"])

    # Nested llm object (legacy / CLI)
    llm = inp.get("llm")
    if isinstance(llm, dict):
        for key in ("base_url", "api_key", "model", "temperature", "timeout_s"):
            if llm.get(key) is not None:
                override[key] = llm[key]

    cfg = merge_llm_config(env_cfg, override or None)
    if not cfg or not (cfg.base_url or cfg.api_key):
        raise RuntimeError(
            "LLM config required. Either:\n"
            "  • Select System Gateway and ensure you are logged in, OR\n"
            "  • Select Custom API Key and provide llm_base_url + llm_model, OR\n"
            "  • Set ISC_LLM_BASE_URL / ISC_LLM_API_KEY environment variables."
        )
    return OpenAICompatibleClient(cfg)


def _get_safety_cfg(inp: dict) -> dict:
    return {
        "restrict_paths_under_skills": inp.get("safety_restrict_paths", True),
        "disallow_new_deps_in_skill_py": inp.get("safety_disallow_new_deps", True),
        "require_respond_signature": inp.get("safety_require_signature", True),
    }


# ── Create mode ────────────────────────────────────────────────────────────────

def _create_skill(inp: dict, context: Any = None) -> str:
    """
    Multi-agent skill creation pipeline.
    Produces a complete skill with all 3 mandatory schemas + code + tests.
    """
    description: str = (
        inp.get("description")
        or inp.get("prompt")
        or inp.get("skill_description")
        or ""
    ).strip()

    if not description:
        return json.dumps({
            "success": False,
            "output": (
                "❌ Please provide a `description` of what the new skill should do.\n"
                "Example: \"A skill that converts Markdown to clean HTML with syntax highlighting\""
            ),
        }, ensure_ascii=False)

    skill_name: str | None = inp.get("skill_name") or None
    language: str = inp.get("skill_language") or inp.get("language") or "auto"
    complexity: str = inp.get("complexity") or "moderate"

    try:
        client = _get_llm_client(inp, context)
    except RuntimeError as e:
        return json.dumps({"success": False, "output": f"❌ {e}"}, ensure_ascii=False)

    try:
        from isc.creator import SkillCreator
        creator = SkillCreator(
            llm_client=client,
            skills_root=SKILLS_ROOT,
            safety_cfg=_get_safety_cfg(inp),
        )
        _log(f"Starting creation: '{description[:60]}' [{language}, {complexity}]")
        result = creator.create(
            description=description,
            skill_name=skill_name,
            language=language,
            complexity=complexity,
        )
    except Exception as e:
        _log(f"Creation failed: {e}")
        return json.dumps({
            "success": False,
            "output": f"❌ Skill creation failed: {e}",
        }, ensure_ascii=False)

    files_text = "\n".join(f"  ✅ `{f}`" for f in result.files_written)
    warnings_text = ""
    if result.warnings:
        warnings_text = "\n\n⚠️ **Notes:**\n" + "\n".join(f"- {w}" for w in result.warnings)

    output = (
        f"✅ **Skill `{result.skill_name}` created successfully!**\n\n"
        f"📁 **Location:** `{result.skill_path}`\n\n"
        f"📄 **Files created:**\n{files_text}\n\n"
        f"📊 **Summary:**\n{result.summary}"
        f"{warnings_text}\n\n"
        f"---\n"
        f"💡 All 3 schemas (`input`, `output`, `ui`) are in `schemas/`. "
        f"Edit `skill.md` to adjust triggers and metadata."
    )

    return json.dumps(
        {"success": True, "output": output, "skill_path": result.skill_path},
        ensure_ascii=False,
    )


# ── Improve mode ───────────────────────────────────────────────────────────────

def _improve_skill(inp: dict, context: Any = None) -> str:
    """Iterative LLM improvement loop for ISC sandbox skills."""
    skill_name: str = (
        inp.get("skill_name")
        or _extract_skill_name(inp.get("prompt", ""))
        or ""
    ).strip()

    if not skill_name:
        try:
            from isc.registry import list_skills
            available = ", ".join(list_skills()) or "none"
        except Exception:
            available = "unavailable"
        return json.dumps({
            "success": False,
            "output": f"❌ `skill_name` required for improve mode.\nAvailable skills: {available}",
        }, ensure_ascii=False)

    if not (ISC_ROOT / "skills" / skill_name).exists():
        try:
            from isc.registry import list_skills
            available = ", ".join(list_skills()) or "none"
        except Exception:
            available = "unavailable"
        return json.dumps({
            "success": False,
            "output": (
                f"❌ Skill `{skill_name}` not found in ISC sandbox.\n"
                f"Available: {available}"
            ),
        }, ensure_ascii=False)

    # Build LLM override (optional for improve mode)
    llm_override: dict | None = None
    try:
        from isc.llm import load_llm_config_from_env, merge_llm_config
        env_cfg = load_llm_config_from_env()
        override: dict = {}
        if inp.get("llm_base_url"):
            override["base_url"] = inp["llm_base_url"]
        if inp.get("llm_model"):
            override["model"] = inp["llm_model"]
        llm = inp.get("llm")
        if isinstance(llm, dict):
            override.update({k: v for k, v in llm.items() if v})
        cfg = merge_llm_config(env_cfg, override or None)
        if cfg and (cfg.base_url or cfg.api_key):
            llm_override = {
                k: v for k, v in {
                    "base_url": cfg.base_url,
                    "api_key": cfg.api_key,
                    "model": cfg.model,
                    "temperature": cfg.temperature,
                    "timeout_s": cfg.timeout_s,
                }.items() if v not in (None, "")
            }
    except Exception:
        pass

    mode: str = inp.get("mode", "auto")
    rounds: int = int(inp.get("rounds", 3))
    research_cfg = {
        "max_topics": int(inp.get("research_max_topics", 10)),
        "max_results_per_topic": int(inp.get("research_max_results", 3)),
        "max_snippet_chars": int(inp.get("research_max_snippet_chars", 6000)),
    }

    _log(f"Improving '{skill_name}' mode={mode} rounds={rounds}")

    try:
        from isc.runner import iterate_improve
        run_result = iterate_improve(
            project_root=ISC_ROOT,
            skill_name=skill_name,
            mode=mode,
            rounds=rounds,
            ask_user=inp.get("ask_user", False),
            allow_test_expansion=inp.get("allow_test_expansion", False),
            llm_override=llm_override,
            research_cfg=research_cfg,
            safety_cfg=_get_safety_cfg(inp),
        )
    except Exception as e:
        _log(f"Improve failed: {e}")
        return json.dumps({"success": False, "output": f"❌ Improvement failed: {e}"}, ensure_ascii=False)

    # Save proposals
    proposals_dir = ISC_ROOT / "runs" / "proposals" / skill_name
    proposals_dir.mkdir(parents=True, exist_ok=True)
    saved: list[str] = []
    for i, p in enumerate(run_result.proposals, 1):
        stamp = p.created_at_iso.replace(":", "").replace("-", "")
        diff_path = proposals_dir / f"{stamp}_r{i}.diff"
        diff_path.write_text(p.unified_diff, encoding="utf-8")
        saved.append(str(diff_path.relative_to(ISC_ROOT)))

    r = run_result.final_report
    lines = [
        f"✅ **ISC improve complete** — skill: `{skill_name}`",
        f"- Rounds: {rounds} | Score: **{r.passed}/{r.total}** ({r.pass_rate:.0%})",
    ]
    if saved:
        lines += ["- Proposals saved (sandbox, not auto-applied):"] + [f"  - `{d}`" for d in saved]
        lines.append(f"\n_Apply: `python -m isc.cli apply --skill {skill_name}`_")
    else:
        lines.append("- No patches generated (all tests passing or heuristic mode)")

    return json.dumps({"success": True, "output": "\n".join(lines)}, ensure_ascii=False)


def _convert_workflow_skill(inp: dict, context: Any = None) -> str:
    """
    Convert a Virtual Workflow JSON to a complete SmartAIHub skill.
    Parses the workflow nodes/edges and drives the ISC creation pipeline with
    a workflow-derived description.
    """
    workflow_raw: str = (inp.get("workflow_json") or "").strip()
    if not workflow_raw:
        return json.dumps({
            "success": False,
            "output": (
                "❌ Please paste the Virtual Workflow JSON in the `workflow_json` field.\n\n"
                "Export it from the Workflow Editor: **⋮ menu → Export Workflow**"
            ),
        }, ensure_ascii=False)

    # Size guard — prevent excessively large payloads from reaching the LLM
    _MAX_WORKFLOW_BYTES = 500_000
    if len(workflow_raw.encode("utf-8")) > _MAX_WORKFLOW_BYTES:
        return json.dumps({
            "success": False,
            "output": (
                f"❌ Workflow JSON exceeds the {_MAX_WORKFLOW_BYTES // 1000} KB limit "
                f"({len(workflow_raw) // 1000} KB received). "
                "Please export a smaller workflow or reduce node count."
            ),
        }, ensure_ascii=False)

    try:
        workflow: dict = json.loads(workflow_raw)
    except json.JSONDecodeError as e:
        return json.dumps({
            "success": False,
            "output": f"❌ Invalid JSON in workflow_json: {e}",
        }, ensure_ascii=False)

    # Structural validation — must be a dict with a nodes array
    if not isinstance(workflow, dict):
        return json.dumps({
            "success": False,
            "output": "❌ Workflow JSON must be a JSON object (dict), not an array or primitive.",
        }, ensure_ascii=False)

    nodes: list = workflow.get("nodes", [])
    edges: list = workflow.get("edges", [])

    if not nodes:
        return json.dumps({
            "success": False,
            "output": "❌ Workflow JSON has no nodes. Please export a valid workflow.",
        }, ensure_ascii=False)

    # Build a human-readable description of the workflow for the LLM planner
    node_summaries = []
    for n in nodes:
        data = n.get("data", {})
        node_type = data.get("nodeType", n.get("type", "unknown"))
        label = data.get("label", node_type)
        cfg = data.get("config", {})
        cfg_summary = ", ".join(f"{k}={v}" for k, v in list(cfg.items())[:3]) if cfg else ""
        node_summaries.append(f"  - [{node_type}] {label}" + (f" ({cfg_summary})" if cfg_summary else ""))

    edge_count = len(edges)
    node_list = "\n".join(node_summaries)
    description = (
        f"Convert this Virtual Workflow to a self-contained skill.\n\n"
        f"The workflow has {len(nodes)} nodes and {edge_count} connections:\n{node_list}\n\n"
        f"Full workflow JSON:\n{workflow_raw[:3000]}"
    )

    skill_name: str | None = inp.get("skill_name") or None
    language: str = inp.get("skill_language") or inp.get("language") or "auto"
    complexity: str = inp.get("complexity") or "moderate"

    try:
        client = _get_llm_client(inp, context)
    except RuntimeError as e:
        return json.dumps({"success": False, "output": f"❌ {e}"}, ensure_ascii=False)

    try:
        from isc.creator import SkillCreator
        creator = SkillCreator(
            llm_client=client,
            skills_root=SKILLS_ROOT,
            safety_cfg=_get_safety_cfg(inp),
        )
        _log(f"Converting workflow: {len(nodes)} nodes → skill [{language}, {complexity}]")
        result = creator.convert_from_workflow(
            workflow=workflow,
            description=description,
            skill_name=skill_name,
            language=language,
            complexity=complexity,
        )
    except Exception as e:
        _log(f"Workflow conversion failed: {e}")
        return json.dumps({
            "success": False,
            "output": f"❌ Workflow conversion failed: {e}",
        }, ensure_ascii=False)

    files_text = "\n".join(f"  ✅ `{f}`" for f in result.files_written)
    warnings_text = ""
    if result.warnings:
        warnings_text = "\n\n⚠️ **Notes:**\n" + "\n".join(f"- {w}" for w in result.warnings)

    output = (
        f"✅ **Workflow converted to skill `{result.skill_name}` successfully!**\n\n"
        f"📁 **Location:** `{result.skill_path}`\n\n"
        f"📄 **Files created:**\n{files_text}\n\n"
        f"📊 **Summary:**\n{result.summary}"
        f"{warnings_text}\n\n"
        f"---\n"
        f"💡 The skill replicates the workflow logic in a single `respond()` function. "
        f"Review `python/skill.py` or `js/skill.js` and adjust if needed."
    )

    return json.dumps(
        {"success": True, "output": output, "skill_path": result.skill_path},
        ensure_ascii=False,
    )


def _extract_skill_name(prompt: str) -> str | None:
    m = re.search(r"\bskill[_\-\s]?(\w+)\b", prompt, re.IGNORECASE)
    if m:
        return f"skill_{m.group(1).lower()}"
    m = re.search(r"\b(skill[\w_-]+)\b", prompt, re.IGNORECASE)
    return m.group(1) if m else None


# ── Help ────────────────────────────────────────────────────────────────────────

def _help_response() -> str:
    try:
        from isc.registry import list_skills
        sandbox_skills = ", ".join(f"`{s}`" for s in list_skills()) or "none"
    except Exception:
        sandbox_skills = "unavailable"

    return json.dumps({
        "success": True,
        "output": (
            "## Intelligence Skill Creator (ISC) v0.4.0\n\n"
            "### 🔨 Create a new skill\n"
            "Set `mode: create` and provide `description`. ISC generates all 3 schemas, code, tests and README.\n"
            "```json\n"
            '{"mode": "create", "description": "A skill that converts Thai dates to Buddhist Era format",\n'
            ' "skill_language": "python", "complexity": "simple",\n'
            ' "llm_gateway_mode": "system", "llm_model_search": "claude-sonnet-4-6"}\n'
            "```\n\n"
            "**Always generates:** `schemas/input.schema.json`, `schemas/output.schema.json`, "
            "`schemas/ui.schema.json`, `skill.md`, `python/skill.py` or `js/skill.js`, "
            "`tests/tests.json`, `README.md`\n\n"
            "### 🔄 Convert a Virtual Workflow to a skill\n"
            "Export a workflow from the Workflow Editor and paste the JSON:\n"
            "```json\n"
            '{"mode": "convert_workflow", "workflow_json": "<paste exported JSON here>",\n'
            ' "llm_gateway_mode": "system", "llm_model_search": "claude-sonnet-4-6"}\n'
            "```\n\n"
            "### 🔧 Improve an existing ISC sandbox skill\n"
            "Set `mode: improve` and `skill_name`:\n"
            "```json\n"
            '{"mode": "improve", "skill_name": "skill_math_tutor", "rounds": 3,\n'
            ' "llm_gateway_mode": "system", "llm_model_search": "claude-sonnet-4-6"}\n'
            "```\n\n"
            f"ISC sandbox skills: {sandbox_skills}\n\n"
            "### LLM Gateway\n"
            "| `llm_gateway_mode` | How it works |\n"
            "|--------------------|-------------|\n"
            "| `system` (default) | Uses the SmartAIHub gateway — credits deducted automatically. "
            "Set `llm_model_search` to choose the model. |\n"
            "| `custom` | Provide your own `llm_base_url` (OpenAI-compatible) and set "
            "`ISC_LLM_API_KEY` env var. Use `llm_model` to specify the model. |\n\n"
            "### Parameters\n"
            "| Parameter | Mode | Description |\n"
            "|-----------|------|-------------|\n"
            "| `description` | create | What the new skill should do |\n"
            "| `skill_language` | create/convert | python \\| javascript \\| auto |\n"
            "| `complexity` | create/convert | simple \\| moderate \\| complex |\n"
            "| `workflow_json` | convert_workflow | Exported workflow JSON string |\n"
            "| `skill_name` | improve (required) | Skill slug to improve |\n"
            "| `rounds` | improve | Improvement iterations (1-10) |\n"
            "| `llm_gateway_mode` | all | system \\| custom |\n"
            "| `llm_model_search` | system gateway | Model ID from the system model list |\n"
            "| `llm_base_url` | custom gateway | OpenAI-compatible endpoint URL |\n"
            "| `llm_model` | custom gateway | Model name (e.g. gpt-4o) |\n"
        ),
    }, ensure_ascii=False)


# ── Entry point ─────────────────────────────────────────────────────────────────

def respond(input: Any, context: Any = None) -> str:
    """
    SmartAIHub skill entry point.

    Args:
        input:   dict (UI form) or JSON string or legacy {prompt, params} dict
        context: SmartAIHub context dict — {userToken, publicUrl, user: {id, ...}}
                 Used by system gateway mode to authenticate LLM requests.

    Returns:
        JSON string {"success": bool, "output": str, ...}
    """
    inp = _normalise(input)
    mode = _detect_mode(inp)
    _log(f"respond() mode={mode}")

    if mode == "create":
        return _create_skill(inp, context)
    if mode == "improve":
        return _improve_skill(inp, context)
    if mode == "convert_workflow":
        return _convert_workflow_skill(inp, context)
    return _help_response()


def main() -> None:
    raw = sys.stdin.read().strip()
    try:
        payload = json.loads(raw) if raw else {}
    except json.JSONDecodeError as e:
        print(json.dumps({"success": False, "output": f"Invalid JSON input: {e}"}))
        sys.exit(1)

    # executePythonSkill wraps form data as: {skill_name, prompt, params: {form fields}, context}
    # We need to unwrap it so _normalise receives the flat form fields, not the outer wrapper.
    context: Any = None
    input_data: Any = payload

    if isinstance(payload, dict):
        context = payload.get("context")  # {publicUrl, userToken} from skillExecutor.ts
        # Outer wrapper format: merge params (form fields) into a flat input dict
        if "params" in payload and isinstance(payload.get("params"), dict):
            merged: dict = dict(payload["params"])
            # Carry prompt through if not already in params
            if payload.get("prompt") and "prompt" not in merged:
                merged["prompt"] = payload["prompt"]
            input_data = merged

    print(respond(input_data, context))


if __name__ == "__main__":
    main()
