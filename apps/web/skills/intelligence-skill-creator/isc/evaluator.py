from __future__ import annotations

import importlib.util
import json
import subprocess
import tempfile
from collections import Counter
from pathlib import Path
from typing import Any, List

from .models import TestCase, TestResult, EvaluationReport
from .registry import resolve_skill_files, resolve_skill_dir

try:
    import jsonschema
except Exception:  # pragma: no cover
    jsonschema = None


def _matches_json_type(value: Any, schema_type: str) -> bool:
    return {
        "object": isinstance(value, dict),
        "array": isinstance(value, list),
        "string": isinstance(value, str),
        "number": isinstance(value, (int, float)) and not isinstance(value, bool),
        "integer": isinstance(value, int) and not isinstance(value, bool),
        "boolean": isinstance(value, bool),
        "null": value is None,
    }.get(schema_type, True)


def _basic_validate_against_schema(payload: Any, schema: dict, path: str = "$") -> list[str]:
    errors: list[str] = []
    schema_type = schema.get("type")
    if isinstance(schema_type, str) and not _matches_json_type(payload, schema_type):
        return [f"{path} expected type {schema_type} but got {type(payload).__name__}"]

    if schema_type == "object" and isinstance(payload, dict):
        required = schema.get("required", [])
        for key in required if isinstance(required, list) else []:
            if key not in payload:
                errors.append(f"{path}.{key} is required")
        properties = schema.get("properties", {})
        if isinstance(properties, dict):
            for key, subschema in properties.items():
                if key in payload and isinstance(subschema, dict):
                    errors.extend(_basic_validate_against_schema(payload[key], subschema, f"{path}.{key}"))
    elif schema_type == "array" and isinstance(payload, list):
        item_schema = schema.get("items")
        if isinstance(item_schema, dict):
            for index, item in enumerate(payload):
                errors.extend(_basic_validate_against_schema(item, item_schema, f"{path}[{index}]"))

    return errors


def _validate_against_schema(payload: Any, output_schema: dict) -> tuple[bool, str | None]:
    if jsonschema is not None:
        try:
            jsonschema.validate(payload, output_schema)
            return True, None
        except Exception as e:
            return False, str(e)

    errors = _basic_validate_against_schema(payload, output_schema)
    return (not errors), "; ".join(errors) if errors else None


def load_tests(skill_name: str) -> List[TestCase]:
    files = resolve_skill_files(skill_name)
    if files.tests_path is None:
        raise FileNotFoundError(f"tests.json not found for skill: {skill_name}")
    data = json.loads(files.tests_path.read_text(encoding="utf-8"))
    raw_tests = data if isinstance(data, list) else data.get("tests", [])
    return [_load_test_case(t) for t in raw_tests]


def _load_test_case(raw: dict) -> TestCase:
    return TestCase(
        id=raw["id"],
        input=raw.get("input"),
        expected_contains=raw.get("expected_contains", []),
        forbidden_contains=raw.get("forbidden_contains", []),
        expected_success=raw.get("expected_success"),
        expected_json_paths=raw.get("expected_json_paths", {}) or {},
        expected_schema_valid=raw.get("expected_schema_valid"),
        context=raw.get("context"),
    )


def _load_output_schema(skill_dir: Path) -> dict | None:
    schema_path = skill_dir / "schemas" / "output.schema.json"
    if not schema_path.exists():
        return None
    try:
        return json.loads(schema_path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _resolve_json_path(payload: Any, path: str) -> Any:
    current = payload
    for part in path.split("."):
        if isinstance(current, list):
            try:
                current = current[int(part)]
            except Exception as e:
                raise KeyError(path) from e
        elif isinstance(current, dict) and part in current:
            current = current[part]
        else:
            raise KeyError(path)
    return current


def _evaluate_output(
    output_text: str,
    test_case: TestCase,
    output_schema: dict | None,
) -> tuple[bool, List[str], List[str], List[str]]:
    reasons: List[str] = []
    categories: List[str] = []
    missing = [s for s in test_case.expected_contains if s not in output_text]
    if missing:
        reasons.append(f"missing expected text: {missing}")
        categories.append("semantic/missing-text")

    forbidden_hits = [s for s in test_case.forbidden_contains if s in output_text]
    if forbidden_hits:
        reasons.append(f"contains forbidden text: {forbidden_hits}")
        categories.append("semantic/forbidden-text")

    parsed_json: Any = None
    try:
        parsed_json = json.loads(output_text)
    except Exception as e:
        reasons.append(f"output is not valid JSON: {e}")
        categories.append("contract/invalid-json")

    if parsed_json is not None:
        if test_case.expected_success is not None:
            actual_success = parsed_json.get("success")
            if actual_success is not test_case.expected_success:
                reasons.append(
                    f"expected success={test_case.expected_success} but got {actual_success}"
                )
                categories.append("contract/success-flag")

        for json_path, expected_value in test_case.expected_json_paths.items():
            try:
                actual_value = _resolve_json_path(parsed_json, json_path)
            except KeyError:
                reasons.append(f"missing json path: {json_path}")
                categories.append("contract/json-path")
                continue
            if actual_value != expected_value:
                reasons.append(
                    f"json path {json_path!r} expected {expected_value!r} but got {actual_value!r}"
                )
                categories.append("contract/json-path")

        if test_case.expected_schema_valid is not None:
            if output_schema is None:
                reasons.append("output schema unavailable for schema validation")
                categories.append("contract/schema")
            else:
                schema_valid, schema_error = _validate_against_schema(parsed_json, output_schema)
                if schema_valid != test_case.expected_schema_valid:
                    if schema_valid:
                        reasons.append("expected schema validation to fail but it passed")
                    else:
                        reasons.append(f"output schema validation failed: {schema_error}")
                    categories.append("contract/schema")

    return (not reasons), missing, reasons, sorted(set(categories))


def evaluate(skill_name: str) -> EvaluationReport:
    return evaluate_from_path(resolve_skill_dir(skill_name))


def evaluate_from_path(skill_dir: Path) -> EvaluationReport:
    skill_name = skill_dir.name

    tests_file = skill_dir / "tests" / "tests.json"
    if not tests_file.exists():
        tests_file = skill_dir / "tests.json"

    if not tests_file.exists():
        return EvaluationReport(
            skill_name=skill_name, total=0, passed=0, pass_rate=0.0, results=[], dimension_failures={}
        )

    data = json.loads(tests_file.read_text(encoding="utf-8"))
    raw_tests = data if isinstance(data, list) else data.get("tests", [])
    tests = [_load_test_case(t) for t in raw_tests]
    output_schema = _load_output_schema(skill_dir)

    js_candidates = [
        skill_dir / "js" / "skill.js",
        skill_dir / "skill.js",
    ]
    js_path = next((candidate for candidate in js_candidates if candidate.exists()), None)
    if js_path is not None:
        return _evaluate_javascript(skill_name, js_path, tests, skill_dir, output_schema)

    py_candidates = [
        skill_dir / "python" / "skill.py",
        skill_dir / "skill.py",
    ]
    py_path = next((candidate for candidate in py_candidates if candidate.exists()), None)
    if py_path is None:
        results = [
            TestResult(
                test_id=t.id,
                passed=False,
                output="Skill code not found (neither python/skill.py nor js/skill.js)",
                missing=t.expected_contains,
                reasons=["skill entrypoint missing"],
                categories=["runtime/missing-entrypoint"],
            )
            for t in tests
        ]
        return _build_report(skill_name, results)

    spec = importlib.util.spec_from_file_location(f"skill_ws_{skill_name}", py_path)
    mod = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
    spec.loader.exec_module(mod)  # type: ignore[union-attr]

    results: List[TestResult] = []
    for tc in tests:
        try:
            out = mod.respond(tc.input, tc.context)  # type: ignore[attr-defined]
            out_s = str(out)
            passed, missing, reasons, categories = _evaluate_output(out_s, tc, output_schema)
            results.append(
                TestResult(
                    test_id=tc.id,
                    passed=passed,
                    output=out_s,
                    missing=missing,
                    reasons=reasons,
                    categories=categories,
                )
            )
        except Exception as e:
            results.append(
                TestResult(
                    test_id=tc.id,
                    passed=False,
                    output=f"Error: {e}",
                    missing=tc.expected_contains,
                    reasons=[f"runtime exception: {e}"],
                    categories=["runtime/exception"],
                )
            )

    return _build_report(skill_name, results)


def _build_report(skill_name: str, results: List[TestResult]) -> EvaluationReport:
    total = len(results)
    passed = sum(1 for r in results if r.passed)
    failures = Counter(category for result in results for category in result.categories)
    return EvaluationReport(
        skill_name=skill_name,
        total=total,
        passed=passed,
        pass_rate=(passed / total) if total else 0.0,
        results=results,
        dimension_failures=dict(failures),
    )


def report_to_json_dict(rep: EvaluationReport) -> dict:
    return {
        "skill_name": rep.skill_name,
        "total": rep.total,
        "passed": rep.passed,
        "pass_rate": rep.pass_rate,
        "dimension_failures": rep.dimension_failures,
        "results": [
            {
                "test_id": r.test_id,
                "passed": r.passed,
                "missing": r.missing,
                "reasons": r.reasons,
                "categories": r.categories,
                "output": r.output,
            }
            for r in rep.results
        ],
    }


def _evaluate_javascript(
    skill_name: str,
    js_path: Path,
    tests: List[TestCase],
    skill_dir: Path,
    output_schema: dict | None,
) -> EvaluationReport:
    test_data = [
        {
            "id": t.id,
            "input": t.input,
            "context": t.context,
            "expected_contains": t.expected_contains,
            "forbidden_contains": t.forbidden_contains,
            "expected_success": t.expected_success,
            "expected_json_paths": t.expected_json_paths,
            "expected_schema_valid": t.expected_schema_valid,
        }
        for t in tests
    ]

    runner_code = f"""
const skill = require({json.dumps(str(js_path))});
const tests = {json.dumps(test_data)};

async function run() {{
  const results = [];
  for (const test of tests) {{
    try {{
      const output = await skill.respond(test.input, test.context || {{}});
      results.push({{ test_id: test.id, output: typeof output === "string" ? output : JSON.stringify(output) }});
    }} catch (e) {{
      results.push({{ test_id: test.id, error: String(e && e.message ? e.message : e) }});
    }}
  }}
  console.log(JSON.stringify({{ results }}));
}}

run().catch(e => console.error(JSON.stringify({{ error: e.message }})));
"""

    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as f:
        f.write(runner_code)
        tmp_path = f.name

    try:
        proc = subprocess.run(
            ["node", tmp_path],
            capture_output=True,
            text=True,
            timeout=30,
            cwd=str(skill_dir),
        )
        stdout = proc.stdout.strip()
        stderr = proc.stderr.strip()
        lines = [line for line in stdout.splitlines() if line.strip()]
        output_data = json.loads(lines[-1] if lines else "{}")
        if "error" in output_data:
            raise RuntimeError(output_data["error"])

        raw_results = {item["test_id"]: item for item in output_data.get("results", [])}
        results: List[TestResult] = []
        for test in tests:
            item = raw_results.get(test.id, {})
            if "error" in item:
                results.append(
                    TestResult(
                        test_id=test.id,
                        passed=False,
                        output=f"Error: {item['error']}",
                        missing=test.expected_contains,
                        reasons=[f"runtime exception: {item['error']}"],
                        categories=["runtime/exception"],
                    )
                )
                continue
            output_text = str(item.get("output", ""))
            passed, missing, reasons, categories = _evaluate_output(output_text, test, output_schema)
            results.append(
                TestResult(
                    test_id=test.id,
                    passed=passed,
                    output=output_text,
                    missing=missing,
                    reasons=reasons,
                    categories=categories,
                )
            )
        return _build_report(skill_name, results)
    except Exception as parse_err:
        error_msg = f"Failed to evaluate JS skill: {parse_err}. Stderr: {stderr}"
        results = [
            TestResult(
                test_id=t.id,
                passed=False,
                output=error_msg[:500],
                missing=t.expected_contains,
                reasons=[error_msg[:500]],
                categories=["runtime/evaluator"],
            )
            for t in tests
        ]
        return _build_report(skill_name, results)
    finally:
        Path(tmp_path).unlink(missing_ok=True)
