from __future__ import annotations
import json
from pathlib import Path
from typing import List

from .models import TestCase, TestResult, EvaluationReport
from .registry import skills_root, load_skill_module

def load_tests(skill_name: str) -> List[TestCase]:
    p = skills_root() / skill_name / "tests.json"
    data = json.loads(p.read_text(encoding="utf-8"))
    tests = []
    for t in data["tests"]:
        tests.append(TestCase(
            id=t["id"],
            input=t["input"],
            expected_contains=t.get("expected_contains", []),
            context=t.get("context"),
        ))
    return tests

def evaluate(skill_name: str) -> EvaluationReport:
    mod = load_skill_module(skill_name)
    tests = load_tests(skill_name)
    results: List[TestResult] = []
    passed = 0
    for tc in tests:
        out = mod.respond(tc.input, tc.context)  # type: ignore
        out_s = str(out)
        missing = [s for s in tc.expected_contains if s not in out_s]
        ok = (len(missing) == 0)
        if ok:
            passed += 1
        results.append(TestResult(test_id=tc.id, passed=ok, output=out_s, missing=missing))
    total = len(tests)
    pr = (passed / total) if total else 0.0
    return EvaluationReport(skill_name=skill_name, total=total, passed=passed, pass_rate=pr, results=results)

def report_to_json_dict(rep: EvaluationReport) -> dict:
    return {
        "skill_name": rep.skill_name,
        "total": rep.total,
        "passed": rep.passed,
        "pass_rate": rep.pass_rate,
        "results": [
            {"test_id": r.test_id, "passed": r.passed, "missing": r.missing, "output": r.output}
            for r in rep.results
        ]
    }
