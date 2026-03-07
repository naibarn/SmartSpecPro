from __future__ import annotations
from dataclasses import dataclass
from typing import List, Optional, Dict, Any

try:
    from duckduckgo_search import DDGS
except Exception:  # pragma: no cover
    DDGS = None

from .models import EvaluationReport
from .registry import load_manifest, read_text
from .llm import OpenAICompatibleClient

@dataclass(frozen=True)
class ResearchHit:
    query: str
    title: str
    href: str
    body: str

def _ddg_text_search(query: str, max_results: int = 5) -> List[Dict[str, Any]]:
    if DDGS is None:
        raise RuntimeError("duckduckgo-search is not installed or failed to import.")
    with DDGS() as ddgs:
        return list(ddgs.text(query, max_results=max_results))

def _heuristic_topics(desc: str, failure_summary: str, max_topics: int) -> List[str]:
    topics: List[str] = []
    if "ขั้น" in failure_summary or "step" in failure_summary.lower():
        topics.append("Thai step by step explanation numbering format 1. 2. 3.")
    topics += [
        "json full file replacement patch format safe apply patterns",
        "test driven development iterate until tests pass best practices",
    ]
    if not topics:
        topics.append("how to improve python function to satisfy unit tests")
    # de-dup + cap
    seen=set()
    out=[]
    for t in topics:
        k=t.lower()
        if k in seen:
            continue
        seen.add(k)
        out.append(t)
        if len(out)>=max_topics:
            break
    return out

def plan_research_topics(
    skill_name: str,
    report: EvaluationReport,
    max_topics: int = 10,
    llm: Optional[OpenAICompatibleClient] = None,
) -> List[str]:
    try:
        manifest = read_text(skill_name, "skill.md")
    except FileNotFoundError:
        try:
            manifest = read_text(skill_name, "manifest.json")
        except FileNotFoundError:
            manifest = "Manifest missing."

    try:
        skill_code = read_text(skill_name, "python/skill.py")
    except FileNotFoundError:
        try:
            skill_code = read_text(skill_name, "js/skill.js")
        except FileNotFoundError:
            try:
                skill_code = read_text(skill_name, "skill.py")
            except FileNotFoundError:
                skill_code = "Code missing."

    try:
        tests = read_text(skill_name, "tests/tests.json")
    except FileNotFoundError:
        try:
            tests = read_text(skill_name, "tests.json")
        except FileNotFoundError:
            tests = "Tests missing."
    failed = [r for r in report.results if not r.passed]
    failure_summary = "\n".join([
        f"- {r.test_id}: categories={r.categories} reasons={r.reasons} missing={r.missing} output={r.output[:160].replace(chr(10),' ')}"
        for r in failed
    ]) or "All tests passed."

    if llm:
        prompt = f"""Return up to {max_topics} web search queries (one per line, short, specific).
Only include queries truly necessary to improve correctness vs tests.

Skill manifest:
{manifest[:500]}

Failing tests summary:
{failure_summary}

Skill code:
{skill_code[:1200]}

Tests:
{tests[:1200]}
"""
        out = llm.chat([
            {"role":"system","content":"Output ONLY queries, one per line. No numbering. No extra text."},
            {"role":"user","content": prompt},
        ])
        topics = [ln.strip("•- 	") for ln in out.splitlines() if ln.strip()]
        seen=set()
        uniq=[]
        for t in topics:
            k=t.lower()
            if k in seen:
                continue
            seen.add(k)
            uniq.append(t)
            if len(uniq)>=max_topics:
                break
        if uniq:
            return uniq
    return _heuristic_topics(str(manifest), failure_summary, max_topics)

def run_research(topics: List[str], max_results_per_topic: int = 3) -> List[ResearchHit]:
    hits: List[ResearchHit] = []
    for q in topics[:10]:
        results = _ddg_text_search(q, max_results=max_results_per_topic)
        for r in results:
            hits.append(ResearchHit(
                query=q,
                title=r.get("title",""),
                href=r.get("href",""),
                body=r.get("body","") or r.get("snippet","") or "",
            ))
    return hits

def format_research_snippets(hits: List[ResearchHit], max_chars: int = 5000) -> str:
    chunks=[]
    total=0
    for h in hits:
        piece=f"Query: {h.query}\nTitle: {h.title}\nURL: {h.href}\nSnippet: {h.body}\n"
        if total + len(piece) > max_chars:
            break
        chunks.append(piece)
        total += len(piece)
    return "\n---\n".join(chunks) if chunks else "(no research hits)"
