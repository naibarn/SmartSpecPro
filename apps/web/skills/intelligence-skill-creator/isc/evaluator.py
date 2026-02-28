from __future__ import annotations
import importlib.util
import json
import subprocess
import tempfile
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

def evaluate_from_path(skill_dir: Path) -> EvaluationReport:
    """Evaluate a skill directly from its directory path (used by runner.py workspace runs).

    Supports both tests.json at root level and tests/tests.json.
    The tests file may be a raw list or a dict with a "tests" key.
    JavaScript skills are reported as unevaluated (Python evaluator only).
    """
    skill_name = skill_dir.name

    # Locate tests file
    tests_file = skill_dir / "tests" / "tests.json"
    if not tests_file.exists():
        tests_file = skill_dir / "tests.json"

    if not tests_file.exists():
        return EvaluationReport(
            skill_name=skill_name, total=0, passed=0, pass_rate=0.0, results=[]
        )

    data = json.loads(tests_file.read_text(encoding="utf-8"))
    raw_tests = data if isinstance(data, list) else data.get("tests", [])
    tests: List[TestCase] = [
        TestCase(
            id=t["id"],
            input=t["input"],
            expected_contains=t.get("expected_contains", []),
            context=t.get("context"),
        )
        for t in raw_tests
    ]

    # Check if this is a JS skill
    js_path = skill_dir / "js" / "skill.js"
    if js_path.exists():
        return _evaluate_javascript(skill_name, js_path, tests, skill_dir)

    # Locate and load Python skill module
    py_path = skill_dir / "python" / "skill.py"
    if not py_path.exists():
        return EvaluationReport(
            skill_name=skill_name,
            total=len(tests),
            passed=0,
            pass_rate=0.0,
            results=[
                TestResult(
                    test_id=t.id,
                    passed=False,
                    output="Skill code not found (neither python/skill.py nor js/skill.js)",
                    missing=t.expected_contains,
                )
                for t in tests
            ],
        )

    spec = importlib.util.spec_from_file_location(f"skill_ws_{skill_name}", py_path)
    mod = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
    spec.loader.exec_module(mod)  # type: ignore[union-attr]

    results: List[TestResult] = []
    passed = 0
    for tc in tests:
        try:
            out = mod.respond(tc.input, tc.context)  # type: ignore[attr-defined]
            out_s = str(out)
            missing = [s for s in tc.expected_contains if s not in out_s]
            ok = len(missing) == 0
            if ok:
                passed += 1
            results.append(TestResult(test_id=tc.id, passed=ok, output=out_s, missing=missing))
        except Exception as e:
            results.append(
                TestResult(
                    test_id=tc.id,
                    passed=False,
                    output=f"Error: {e}",
                    missing=tc.expected_contains,
                )
            )

    total = len(tests)
    return EvaluationReport(
        skill_name=skill_name,
        total=total,
        passed=passed,
        pass_rate=(passed / total) if total else 0.0,
        results=results,
    )


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

def _evaluate_javascript(skill_name: str, js_path: Path, tests: List[TestCase], skill_dir: Path) -> EvaluationReport:
    # Build a temporary test runner to execute the JavaScript skill via Node.js
    test_data = [
        {"id": t.id, "input": t.input, "context": t.context, "expected_contains": t.expected_contains}
        for t in tests
    ]
    
    runner_code = f"""
const skill = require({json.dumps(str(js_path))});
const tests = {json.dumps(test_data)};

async function run() {{
    const results = [];
    let passedCount = 0;
    
    for (const test of tests) {{
        try {{
            const output = await skill.respond(test.input, test.context || {{}});
            const outStr = typeof output === 'string' ? output : JSON.stringify(output);
            
            const missing = test.expected_contains.filter(s => !outStr.includes(s));
            const passed = missing.length === 0;
            if (passed) passedCount++;
            
            results.push({{
                test_id: test.id,
                passed,
                output: outStr,
                missing
            }});
        }} catch (e) {{
            results.push({{
                test_id: test.id,
                passed: false,
                output: "Error: " + e.message,
                missing: test.expected_contains
            }});
        }}
    }}
    
    console.log(JSON.stringify({{ passed: passedCount, results }}));
}}

run().catch(e => console.error(JSON.stringify({{ error: e.message }})));
"""
    
    # Run the tests via Node.js
    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as f:
        f.write(runner_code)
        tmp_path = f.name
        
    try:
        # Run node script from the skill's workspace so imports/requires work correctly
        proc = subprocess.run(
            ["node", tmp_path], 
            capture_output=True, 
            text=True, 
            timeout=30,
            cwd=str(skill_dir)
        )
        stdout = proc.stdout.strip()
        stderr = proc.stderr.strip()
        
        # Parse the JSON from stdout (look at the last non-empty line)
        try:
            lines = [line for line in stdout.splitlines() if line.strip()]
            output_data = json.loads(lines[-1] if lines else "{}")
            if "error" in output_data:
                raise Exception(output_data["error"])
                
            passed_count = output_data.get("passed", 0)
            res_list = []
            for r in output_data.get("results", []):
                res_list.append(TestResult(
                    test_id=r["test_id"],
                    passed=r["passed"],
                    output=r["output"],
                    missing=r["missing"]
                ))
            
            total = len(tests)
            return EvaluationReport(
                skill_name=skill_name,
                total=total,
                passed=passed_count,
                pass_rate=(passed_count / total) if total else 0.0,
                results=res_list
            )
            
        except Exception as parse_err:
             error_msg = f"Failed to parse JS output: {parse_err}. Stdout: {stdout}. Stderr: {stderr}"
             results = [
                 TestResult(test_id=t.id, passed=False, output=error_msg[:500], missing=t.expected_contains) 
                 for t in tests
             ]
             return EvaluationReport(skill_name=skill_name, total=len(tests), passed=0, pass_rate=0.0, results=results)
             
    finally:
        Path(tmp_path).unlink(missing_ok=True)
