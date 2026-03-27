"""Skill node executor with real skill discovery and execution."""
from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

import httpx
import structlog
import yaml

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.services.kilo_skill_manager import (
    get_kilo_skill_manager,
)

logger = structlog.get_logger(__name__)

# Node.js web app internal URL
NODEJS_INTERNAL_URL = os.environ.get("NODEJS_INTERNAL_URL", "http://localhost:3000")


def _split_frontmatter(content: str) -> tuple[dict[str, Any], str]:
    """Split YAML frontmatter and markdown body."""
    if not content.startswith("---"):
        return {}, content

    parts = content.split("---", 2)
    if len(parts) < 3:
        return {}, content

    try:
        frontmatter = yaml.safe_load(parts[1]) or {}
    except yaml.YAMLError:
        frontmatter = {}
    body = parts[2].strip()
    return frontmatter, body


def _default_workspace_root() -> Path:
    """Best-effort repository root for local skill discovery."""
    # .../python-backend/app/orchestrator/node_executors/skill_executor.py
    return Path(__file__).resolve().parents[4]


def _discover_apps_web_skills(workspace_root: Path) -> list[dict[str, Any]]:
    """Discover skills from apps/web/skills/*/skill.md."""
    skills_dir = workspace_root / "apps" / "web" / "skills"
    if not skills_dir.exists():
        return []

    discovered: list[dict[str, Any]] = []
    for skill_dir in sorted(skills_dir.iterdir()):
        if not skill_dir.is_dir():
            continue
        skill_md = skill_dir / "skill.md"
        if not skill_md.exists():
            continue

        try:
            text = skill_md.read_text(encoding="utf-8")
        except Exception:
            logger.warning("skill_read_failed", skill_id=skill_dir.name, exc_info=True)
            continue

        frontmatter, body = _split_frontmatter(text)
        discovered.append(
            {
                "id": skill_dir.name,
                "name": frontmatter.get("name") or skill_dir.name,
                "description": frontmatter.get("description") or "",
                "category": frontmatter.get("category") or "general",
                "version": str(frontmatter.get("version") or "1.0.0"),
                "content": body,
                "source": "apps_web",
            }
        )
    return discovered


def discover_available_skills(workspace_root: Path | None = None) -> list[dict[str, Any]]:
    """Discover skills from apps/web and Kilo manager, with dedup by ID."""
    root = workspace_root or _default_workspace_root()
    by_id: dict[str, dict[str, Any]] = {}

    for skill in _discover_apps_web_skills(root):
        by_id[skill["id"]] = skill

    # Also include .kilocode/.claude skills if present.
    try:
        manager = get_kilo_skill_manager()
        manager_skills = manager.list_skills(str(root))
        for skill in manager_skills:
            skill_id = str(skill.name)
            if skill_id in by_id:
                continue
            by_id[skill_id] = {
                "id": skill_id,
                "name": skill.name,
                "description": skill.description,
                "category": "kilo",
                "version": str(getattr(skill, "version", "1.0.0")),
                "content": skill.content,
                "source": "kilo",
            }
    except Exception:
        logger.warning("kilo_skill_discovery_failed", workspace=str(root), exc_info=True)

    return list(by_id.values())


class SkillExecutor:
    """Executor for skill nodes."""

    # Only allow alphanumeric, underscores, hyphens.
    SAFE_SKILL_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_\-]{1,100}$")

    def _resolve_workspace_root(self, context: ExecutionContext) -> Path:
        """Resolve workspace root from context/env with sane fallback."""
        candidates: list[str] = []
        candidates.append(str(context.extra_data.get("workspace_root") or ""))
        candidates.append(str(context.extra_data.get("workspace") or ""))
        candidates.append(os.environ.get("WORKSPACE_ROOT", ""))
        candidates.append(str(_default_workspace_root()))
        candidates.append(os.getcwd())

        for candidate in candidates:
            if not candidate:
                continue
            path = Path(candidate).expanduser().resolve()
            if path.exists():
                return path
        return _default_workspace_root()

    def _get_skill(self, skill_id: str, workspace_root: Path) -> dict[str, Any] | None:
        """Load skill definition by ID from discovered registry."""
        for skill in discover_available_skills(workspace_root):
            if skill["id"] == skill_id:
                return skill
        return None

    async def _call_llm_gateway(
        self,
        *,
        user_token: str,
        model: str,
        system_prompt: str,
        user_prompt: str,
    ) -> tuple[str, dict[str, Any]]:
        """Call Node.js LLM gateway and return text + usage."""
        payload: dict[str, Any] = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.3,
        }

        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{NODEJS_INTERNAL_URL}/api/llm/v2/chat",
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {user_token}",
                    "Cookie": f"token={user_token}",
                },
            )

            if response.status_code != 200:
                body = response.text[:500]
                raise RuntimeError(
                    f"LLM gateway returned HTTP {response.status_code}: {body}"
                )

            data = response.json()
            choices = data.get("choices", [])
            text = ""
            if choices:
                text = choices[0].get("message", {}).get("content", "")

            usage = data.get("usage", {}) or {}
            credits = data.get("_credits", {}) or {}
            return text, {
                "prompt_tokens": usage.get("prompt_tokens", 0),
                "completion_tokens": usage.get("completion_tokens", 0),
                "total_tokens": usage.get("total_tokens", 0),
                "creditsUsed": credits.get("used", 0),
                "model": data.get("model", model),
            }

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Execute a skill node via discovered skill definition."""
        inputs = data.inputs or {}
        config = data.config or {}

        skill_id = (
            inputs.get("skill_id")
            or config.get("skill_id")
            or inputs.get("skillId")
            or config.get("skillId")
        )
        if not skill_id:
            return {"error": "Skill node requires skill_id", "outputs": {}}

        if not self.SAFE_SKILL_ID_PATTERN.match(str(skill_id)):
            return {"error": "Invalid skill_id format", "outputs": {}}

        workspace_root = self._resolve_workspace_root(context)
        skill = self._get_skill(str(skill_id), workspace_root)
        if not skill:
            return {"error": f"Skill not found: {skill_id}", "outputs": {}}

        input_data = inputs.get("input_data")
        if input_data is None:
            input_data = {k: v for k, v in inputs.items() if k not in {"skill_id", "skillId"}}

        # Execute skill via LLM gateway when auth token is present.
        user_token = context.extra_data.get("user_token", "")
        if user_token:
            user_prompt = json.dumps(input_data, ensure_ascii=False, indent=2)
            system_prompt = (
                f"You are executing SmartSpec skill '{skill['name']}'.\n"
                "Follow the skill definition exactly and produce the final answer.\n\n"
                f"--- SKILL DEFINITION ---\n{skill['content']}\n"
            )
            model = str(config.get("model") or "gpt-4o-mini")
            try:
                llm_text, usage = await self._call_llm_gateway(
                    user_token=user_token,
                    model=model,
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                )
                return {
                    "outputs": {"result": llm_text, "status": "success"},
                    "skill_id": skill_id,
                    "skill_version": skill.get("version", "1.0.0"),
                    "cost": usage.get("creditsUsed", 0),
                    "usage": usage,
                }
            except Exception as exc:
                logger.error(
                    "skill_llm_execution_failed",
                    skill_id=skill_id,
                    error=str(exc),
                    exc_info=True,
                )
                return {
                    "outputs": {"result": "", "status": "error"},
                    "error": f"Skill execution failed: {exc}",
                    "skill_id": skill_id,
                }

        # No auth token available -> fail fast (no mock success path).
        return {
            "outputs": {"result": "", "status": "error"},
            "error": "No authentication token available for skill execution",
            "skill_id": skill_id,
            "skill_version": skill.get("version", "1.0.0"),
            "cost": 0,
        }

    async def list_available_skills(self) -> list[dict[str, Any]]:
        """List discovered skills for UI selection."""
        skills = discover_available_skills(_default_workspace_root())
        return [
            {
                "skill_id": s["id"],
                "name": s["name"],
                "description": s["description"],
                "category": s.get("category", "general"),
                "version": s.get("version", "1.0.0"),
                "source": s.get("source", "unknown"),
            }
            for s in skills
        ]


async def execute_skill(data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]:
    """Legacy function wrapper for skill execution."""
    executor = SkillExecutor()
    return await executor.execute(data, context)
# mypy: ignore-errors
