from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import List

from .registry import canonical_skills_root, parse_skill_frontmatter


@dataclass(frozen=True)
class SkillExemplar:
    skill_name: str
    score: float
    summary: str


def _tokenize(text: str) -> set[str]:
    return {token for token in re.findall(r"[a-zA-Z0-9_/-]+", text.lower()) if len(token) >= 3}


def _build_skill_summary(skill_dir: Path) -> str:
    skill_md_path = skill_dir / "skill.md"
    if not skill_md_path.exists():
        return f"{skill_dir.name}: skill.md missing"

    text = skill_md_path.read_text(encoding="utf-8")
    frontmatter = parse_skill_frontmatter(text)
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    heading = next((line.lstrip("# ").strip() for line in lines if line.startswith("#")), skill_dir.name)
    description = str(frontmatter.get("description", ""))[:180]
    category = str(frontmatter.get("category", "general"))
    tags = ", ".join(frontmatter.get("tags", [])[:4]) if isinstance(frontmatter.get("tags"), list) else ""
    trigger_patterns = frontmatter.get("triggerPatterns", [])
    triggers = ", ".join(trigger_patterns[:2]) if isinstance(trigger_patterns, list) else ""
    return (
        f"{skill_dir.name}: title={heading}; category={category}; "
        f"description={description or '(none)'}; tags={tags or '(none)'}; "
        f"triggers={triggers or '(none)'}"
    )


def select_relevant_skill_exemplars(
    query: str,
    *,
    top_k: int = 3,
    exclude_skill_names: set[str] | None = None,
) -> List[SkillExemplar]:
    exclude_skill_names = exclude_skill_names or set()
    query_tokens = _tokenize(query)
    exemplars: List[SkillExemplar] = []

    for skill_dir in canonical_skills_root().iterdir():
        if not skill_dir.is_dir() or skill_dir.name in exclude_skill_names:
            continue
        skill_md_path = skill_dir / "skill.md"
        if not skill_md_path.exists():
            continue
        summary = _build_skill_summary(skill_dir)
        summary_tokens = _tokenize(summary)
        overlap = len(query_tokens & summary_tokens)
        if overlap <= 0:
            continue
        score = overlap / max(len(query_tokens), 1)
        exemplars.append(SkillExemplar(skill_name=skill_dir.name, score=score, summary=summary))

    exemplars.sort(key=lambda item: (-item.score, item.skill_name))
    return exemplars[:top_k]


def format_exemplar_context(exemplars: List[SkillExemplar]) -> str:
    if not exemplars:
        return "(no close local skill exemplars found)"
    return "\n".join(
        f"- {exemplar.summary}"
        for exemplar in exemplars
    )
