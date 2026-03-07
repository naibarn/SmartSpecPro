from __future__ import annotations
from dataclasses import dataclass
from typing import List
from .models import EvaluationReport
from .llm import OpenAICompatibleClient

@dataclass(frozen=True)
class TriageResult:
    categories: List[str]
    hints: List[str]

def triage_failures(report: EvaluationReport) -> TriageResult:
    cats=set(); hints=[]
    for r in report.results:
        if r.passed:
            continue
        miss = " ".join(r.missing).lower()
        reasons = " ".join(r.reasons).lower()
        reason_categories = set(r.categories)
        out = (r.output or "").lower()
        if any(k in miss for k in ["1.","2.","step","ขั้น","ขั้นตอน"]) or "ขั้น" in out:
            cats.add("formatting/steps")
            hints.append("If user asks for steps, output numbered steps 1.,2.,...")
        if any(ch.isdigit() for ch in miss):
            cats.add("numeric/correctness")
            hints.append("Ensure numeric answer appears exactly as expected.")
        if "contract/invalid-json" in reason_categories or "output is not valid json" in reasons:
            cats.add("contract/json")
            hints.append("Return valid JSON strings that match the skill contract.")
        if "contract/schema" in reason_categories:
            cats.add("contract/schema")
            hints.append("Match the output schema and include all required output fields.")
        if "contract/success-flag" in reason_categories:
            cats.add("contract/success")
            hints.append("Set success=true/false correctly for happy and error paths.")
        if "runtime/exception" in reason_categories or "exception" in out or "traceback" in out or "error" in out:
            cats.add("runtime/exception")
            hints.append("Add guards to prevent exceptions.")
        if not out.strip():
            cats.add("empty-output")
            hints.append("Never return empty output.")
    if not cats:
        cats.add("unknown")
        hints.append("General correctness improvements needed.")
    return TriageResult(sorted(cats), hints[:8])

def plan_patch_strategy(llm: OpenAICompatibleClient, triage: TriageResult) -> str:
    prompt = f"""Given failure categories: {triage.categories}
Pick ONE label: minimal | robust-parsing | formatting-focus | refactor
Return only the label."""
    out = llm.chat([{"role":"system","content":"Return only one label."},{"role":"user","content":prompt}]).strip().lower()
    return out if out in {"minimal","robust-parsing","formatting-focus","refactor"} else "minimal"

def rank_research_snippets(llm: OpenAICompatibleClient, snippets: str, top_k: int = 8) -> str:
    prompt = f"""Select the most relevant info from snippets to fix failing tests.
Condense to <= {top_k} bullets. Plain text only.
SNIPPETS:
{snippets}
"""
    return llm.chat([{"role":"system","content":"Be concise."},{"role":"user","content":prompt}]).strip()
