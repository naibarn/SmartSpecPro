from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable, List

from .registry import parse_skill_frontmatter


@dataclass(frozen=True)
class ArtifactValidationResult:
    artifact: str
    errors: List[str]
    warnings: List[str]

    @property
    def ok(self) -> bool:
        return not self.errors


def _is_non_empty_string(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def validate_json_schema_document(
    schema: dict,
    *,
    artifact: str,
    required_properties: Iterable[str] = (),
) -> ArtifactValidationResult:
    errors: List[str] = []
    warnings: List[str] = []

    if not isinstance(schema, dict):
        return ArtifactValidationResult(artifact, [f"{artifact} must be a JSON object."], [])

    if schema.get("$schema") != "http://json-schema.org/draft-07/schema#":
        errors.append(f"{artifact} must declare draft-07 via $schema.")
    if schema.get("type") != "object":
        errors.append(f"{artifact} root type must be 'object'.")
    if not isinstance(schema.get("properties"), dict):
        errors.append(f"{artifact} must define a properties object.")
    if not isinstance(schema.get("required", []), list):
        errors.append(f"{artifact} required must be an array when present.")
    if "examples" not in schema:
        warnings.append(f"{artifact} should include examples.")

    properties = schema.get("properties", {}) if isinstance(schema.get("properties"), dict) else {}
    for prop in required_properties:
        if prop not in properties:
            errors.append(f"{artifact} is missing required property definition: {prop}")

    return ArtifactValidationResult(artifact, errors, warnings)


def validate_ui_schema_document(ui_schema: dict) -> ArtifactValidationResult:
    errors: List[str] = []
    warnings: List[str] = []

    if not isinstance(ui_schema, dict):
        return ArtifactValidationResult("schemas/ui.schema.json", ["ui schema must be a JSON object."], [])

    for key in ("version", "skillId", "title", "titleTh", "description", "descriptionTh", "sections", "outputMapping"):
        if key not in ui_schema:
            errors.append(f"ui schema missing top-level key: {key}")

    sections = ui_schema.get("sections", [])
    if not isinstance(sections, list) or not sections:
        errors.append("ui schema must define at least one section.")
    else:
        for index, section in enumerate(sections):
            if not isinstance(section, dict):
                errors.append(f"section {index} must be an object.")
                continue
            for key in ("id", "title", "titleTh", "icon", "collapsed", "fields"):
                if key not in section:
                    errors.append(f"section {index} missing key: {key}")
            fields = section.get("fields", [])
            if not isinstance(fields, list) or not fields:
                errors.append(f"section {index} must contain fields.")
                continue
            for field in fields:
                if not isinstance(field, dict):
                    errors.append(f"section {index} contains a non-object field definition.")
                    continue
                for key in ("id", "type", "label", "labelTh", "helpText", "helpTextTh"):
                    if key not in field:
                        errors.append(f"field in section {index} missing key: {key}")

    output_mapping = ui_schema.get("outputMapping", {})
    if not isinstance(output_mapping, dict):
        errors.append("ui schema outputMapping must be an object.")
        output_mapping = {}

    rendered_field_ids: List[str] = []
    for section in sections if isinstance(sections, list) else []:
        for field in section.get("fields", []) if isinstance(section, dict) else []:
            if isinstance(field, dict) and _is_non_empty_string(field.get("id")):
                rendered_field_ids.append(field["id"])
    missing_mappings = [field_id for field_id in rendered_field_ids if field_id not in output_mapping]
    if missing_mappings:
        errors.append(f"ui schema outputMapping missing field ids: {', '.join(sorted(missing_mappings))}")

    if not rendered_field_ids:
        warnings.append("ui schema defines no renderable fields.")

    return ArtifactValidationResult("schemas/ui.schema.json", errors, warnings)


def validate_skill_markdown(skill_md: str, *, language: str) -> ArtifactValidationResult:
    errors: List[str] = []
    warnings: List[str] = []

    frontmatter = parse_skill_frontmatter(skill_md)
    if not frontmatter:
        return ArtifactValidationResult("skill.md", ["skill.md must include YAML frontmatter."], [])

    for key in ("name", "description", "category", "execution_mode"):
        if not _is_non_empty_string(frontmatter.get(key)):
            errors.append(f"skill.md frontmatter missing or empty: {key}")

    expected_execution_mode = "python" if language == "python" else "javascript"
    if frontmatter.get("execution_mode") != expected_execution_mode:
        errors.append(
            f"skill.md execution_mode must be '{expected_execution_mode}' for language '{language}'."
        )

    trigger_patterns = frontmatter.get("triggerPatterns")
    if trigger_patterns is None:
        warnings.append("skill.md should define triggerPatterns.")
    elif not isinstance(trigger_patterns, list) or not all(_is_non_empty_string(item) for item in trigger_patterns):
        errors.append("skill.md triggerPatterns must be a list of non-empty strings.")

    return ArtifactValidationResult("skill.md", errors, warnings)


def validate_tests_document(tests: list[dict]) -> ArtifactValidationResult:
    errors: List[str] = []
    warnings: List[str] = []

    if not isinstance(tests, list) or not tests:
        return ArtifactValidationResult("tests/tests.json", ["tests must be a non-empty list."], [])

    seen_ids = set()
    for index, test_case in enumerate(tests):
        if not isinstance(test_case, dict):
            errors.append(f"test case {index} must be an object.")
            continue
        test_id = test_case.get("id")
        if not _is_non_empty_string(test_id):
            errors.append(f"test case {index} missing a non-empty id.")
        elif test_id in seen_ids:
            errors.append(f"duplicate test id: {test_id}")
        else:
            seen_ids.add(test_id)

        if "input" not in test_case:
            errors.append(f"test case {index} missing input.")
        expected_contains = test_case.get("expected_contains")
        if expected_contains is None:
            warnings.append(f"test case {test_id or index} has no expected_contains assertions.")
        elif not isinstance(expected_contains, list) or not all(isinstance(item, str) for item in expected_contains):
            errors.append(f"test case {test_id or index} expected_contains must be a list of strings.")

    return ArtifactValidationResult("tests/tests.json", errors, warnings)


def collect_creation_validation_results(
    *,
    input_schema: dict,
    output_schema: dict,
    ui_schema: dict,
    skill_md: str,
    tests: list[dict],
    language: str,
) -> List[ArtifactValidationResult]:
    return [
        validate_json_schema_document(input_schema, artifact="schemas/input.schema.json"),
        validate_json_schema_document(
            output_schema,
            artifact="schemas/output.schema.json",
            required_properties=("success", "output"),
        ),
        validate_ui_schema_document(ui_schema),
        validate_skill_markdown(skill_md, language=language),
        validate_tests_document(tests),
    ]


def raise_for_validation_errors(results: Iterable[ArtifactValidationResult]) -> None:
    failures = [result for result in results if not result.ok]
    if not failures:
        return

    lines: List[str] = []
    for result in failures:
        for error in result.errors:
            lines.append(f"{result.artifact}: {error}")
    raise RuntimeError("Artifact validation failed:\n" + "\n".join(lines))
