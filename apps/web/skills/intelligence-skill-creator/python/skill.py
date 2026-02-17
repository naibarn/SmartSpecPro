"""
Intelligence Skill Creator — stdin/stdout wrapper for SmartSpecPro chat.

Two modes:
  1. create   — LLM-generates a new SmartSpecPro skill (llm-only, user-private)
  2. improve  — iterate_improve() on a skill inside intelligence-skill-creator/skills/

Input  (stdin): { "skill_name": str, "prompt": str, "params": dict }
Output (stdout): { "success": bool, "output": str }
              | { "success": bool, "output": str, "_action": { "type": "create_skill", ... } }
              | { "success": false, "error": str }

Security model for created skills:
  - executionMode is ALWAYS "llm-only" (no code execution, no filesystem access)
  - skillContent validated server-side before storage
  - user input flows: chat -> LLM only, no direct system access
"""
from __future__ import annotations

import json
import sys
import os
import re
import unicodedata
from pathlib import Path

_SKILL_DIR = Path(__file__).resolve().parent.parent  # intelligence-skill-creator/
if str(_SKILL_DIR) not in sys.path:
    sys.path.insert(0, str(_SKILL_DIR))

ISC_ROOT = _SKILL_DIR

# ── Intent detection ──────────────────────────────────────────────────────────

_CREATE_RE = re.compile(
    r"(create|build|make|generate|สร้าง|เพิ่ม|ออกแบบ).{0,30}(skill|สกิล|ทักษะ)"
    r"|new skill|skill ใหม่",
    re.IGNORECASE,
)
_IMPROVE_RE = re.compile(
    r"(improve|enhance|fix|optimize|ปรับปรุง|แก้ไข).{0,30}(skill|สกิล)"
    r"|isc improve|iterate",
    re.IGNORECASE,
)


def _detect_mode(prompt: str, params: dict) -> str:
    explicit = params.get("mode", "")
    if explicit in ("create", "improve"):
        return explicit
    if _CREATE_RE.search(prompt):
        return "create"
    if _IMPROVE_RE.search(prompt):
        return "improve"
    return "help"


def _slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^\w\s-]", "", text).strip().lower()
    text = re.sub(r"[\s_-]+", "-", text)
    return re.sub(r"^-+|-+$", "", text)[:80] or "my-skill"


# ── Create mode ───────────────────────────────────────────────────────────────

_CREATE_SYSTEM = """You are an expert skill designer for SmartSpecPro, an AI platform.
Given a user request, produce a skill specification in JSON.

Mandatory rules:
1. executionMode MUST be "llm-only" (never python, never media-generate)
2. skillContent MUST NOT instruct the LLM to access files, databases, network, or run code
3. skillContent MUST NOT collect or repeat personal user data
4. skillContent is a concise markdown system prompt the LLM will follow

Return ONLY valid JSON (no markdown fences):
{
  "name": "Human-readable skill name",
  "slug": "kebab-case-slug",
  "description": "One sentence, max 120 chars",
  "skillContent": "# Skill Name\\n\\n## Purpose\\n...system prompt markdown...",
  "triggerPatterns": ["pattern1|pattern2", "thai1|thai2"]
}"""


def _create_skill(prompt: str, params: dict) -> dict:
    from isc.llm import load_llm_config_from_env, merge_llm_config, OpenAICompatibleClient

    llm = merge_llm_config(load_llm_config_from_env(), params.get("llm") or None)
    if not llm:
        return {
            "success": False,
            "error": (
                "LLM config required to create a skill.\n"
                "Pass params.llm={base_url, api_key, model} "
                "or set ISC_LLM_BASE_URL / ISC_LLM_API_KEY / ISC_LLM_MODEL."
            ),
        }

    try:
        raw = OpenAICompatibleClient(llm).chat([
            {"role": "system", "content": _CREATE_SYSTEM},
            {"role": "user",   "content": f"Create a skill for:\n\n{prompt}\n\nReturn JSON only."},
        ])
    except Exception as exc:
        return {"success": False, "error": f"LLM error: {exc}"}

    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip(), flags=re.MULTILINE)
    try:
        spec = json.loads(raw)
    except json.JSONDecodeError:
        return {"success": False, "error": f"LLM returned non-JSON: {raw[:300]}"}

    name          = str(spec.get("name", "My Skill"))[:120]
    slug          = _slugify(str(spec.get("slug", name)))
    description   = str(spec.get("description", ""))[:500]
    skill_content = str(spec.get("skillContent", ""))[:40_000]
    triggers      = [str(p)[:500] for p in spec.get("triggerPatterns", [])[:10]]

    if not skill_content:
        return {"success": False, "error": "LLM returned empty skillContent"}

    action = {
        "type": "create_skill",
        "name": name,
        "slug": slug,
        "description": description,
        "skillContent": skill_content,
        "triggerPatterns": triggers,
    }
    output = (
        f"**Skill generated: `{name}`**\n"
        f"- Slug: `{slug}`\n"
        f"- Description: {description}\n"
        f"- Triggers: {', '.join(f'`{p}`' for p in triggers) or '(none)'}\n\n"
        "_Saving to your private skills…_"
    )
    return {"success": True, "output": output, "_action": action}


# ── Improve mode ──────────────────────────────────────────────────────────────

def _extract_skill_name(prompt: str) -> str | None:
    m = re.search(r"\bskill[_\-\s]?(\w+)\b", prompt, re.IGNORECASE)
    if m:
        return f"skill_{m.group(1).lower()}"
    m = re.search(r"\b(skill[\w_-]+)\b", prompt, re.IGNORECASE)
    return m.group(1) if m else None


def _improve_skill(payload: dict) -> dict:
    params: dict = payload.get("params", {})
    prompt: str  = payload.get("prompt", "")

    skill_name: str = (
        payload.get("skill_name", "")
        or params.get("skill_name", "")
        or _extract_skill_name(prompt)
        or ""
    )

    if not skill_name:
        from isc.registry import list_skills
        return {
            "success": False,
            "error": f"skill_name required. Available: {', '.join(list_skills()) or 'none'}",
        }

    if not (ISC_ROOT / "skills" / skill_name).exists():
        from isc.registry import list_skills
        return {
            "success": False,
            "error": (
                f"'{skill_name}' not found in intelligence-skill-creator/skills/.\n"
                f"Available: {', '.join(list_skills()) or 'none'}"
            ),
        }

    llm_cfg = params.get("llm", {})
    llm_override: dict | None = None
    if llm_cfg.get("base_url") or llm_cfg.get("model"):
        llm_override = {k: v for k, v in {
            "base_url": llm_cfg.get("base_url", ""),
            "api_key":  llm_cfg.get("api_key", os.environ.get("OPENAI_API_KEY", "")),
            "model":    llm_cfg.get("model", os.environ.get("ISC_LLM_MODEL", "gpt-4o")),
            "temperature": llm_cfg.get("temperature", 0),
            "timeout_s":   llm_cfg.get("timeout_s", 180),
        }.items() if v not in (None, "")}

    from isc.runner import iterate_improve
    try:
        result = iterate_improve(
            project_root=ISC_ROOT,
            skill_name=skill_name,
            mode=params.get("mode", "auto"),
            rounds=int(params.get("rounds", 3)),
            ask_user=False,
            allow_test_expansion=False,
            llm_override=llm_override,
            research_cfg=params.get("research") or None,
            safety_cfg=params.get("safety") or None,
        )
    except Exception as exc:
        return {"success": False, "error": str(exc)}

    proposals_dir = ISC_ROOT / "runs" / "proposals" / skill_name
    proposals_dir.mkdir(parents=True, exist_ok=True)
    saved: list[str] = []
    for i, p in enumerate(result.proposals, 1):
        stamp = p.created_at_iso.replace(":", "").replace("-", "")
        diff_path = proposals_dir / f"{stamp}_r{i}.diff"
        diff_path.write_text(p.unified_diff, encoding="utf-8")
        saved.append(str(diff_path.relative_to(ISC_ROOT)))

    r = result.final_report
    lines = [
        f"**ISC completed** — skill: `{skill_name}`",
        f"- Rounds: {params.get('rounds', 3)} | Score: **{r.passed}/{r.total}** ({r.pass_rate:.0%})",
    ]
    if saved:
        lines += ["- Proposals (sandbox, not applied):"] + [f"  - `{d}`" for d in saved]
        lines.append(f"\n_Apply: `python -m isc.cli apply --skill {skill_name}`_")
    else:
        lines.append("- No diffs (all tests passing or heuristic mode)")

    return {"success": True, "output": "\n".join(lines)}


# ── Help ──────────────────────────────────────────────────────────────────────

def _help_response() -> dict:
    from isc.registry import list_skills
    return {
        "success": True,
        "output": (
            "**Intelligence Skill Creator (ISC) v0.3.0**\n\n"
            "**Create a private skill:**\n"
            "> สร้าง skill ช่วยสรุป code review ให้ฉัน\n"
            "> create a skill that translates Thai → English formally\n\n"
            "**Improve an ISC skill (sandbox):**\n"
            "> improve skill_math_tutor\n"
            "> ปรับปรุง skill_code_formatter\n\n"
            f"ISC skills available: `{'`, `'.join(list_skills()) or 'none'}`"
        ),
    }


# ── Entry point ───────────────────────────────────────────────────────────────

def respond(payload: dict) -> dict:
    prompt: str = payload.get("prompt", "")
    params: dict = payload.get("params", {})
    mode = _detect_mode(prompt, params)

    if mode == "create":
        return _create_skill(prompt, params)
    if mode == "improve":
        return _improve_skill(payload)
    return _help_response()


def main() -> None:
    raw = sys.stdin.read().strip()
    try:
        payload = json.loads(raw) if raw else {}
    except json.JSONDecodeError as exc:
        print(json.dumps({"success": False, "error": f"Invalid JSON: {exc}"}))
        sys.exit(1)
    print(json.dumps(respond(payload), ensure_ascii=False))


if __name__ == "__main__":
    main()
