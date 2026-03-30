from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass(frozen=True)
class SkillManifest:
    name: str
    version: str
    description: str
    entrypoint: str = "skill.py"
    author: str = ""
    tags: List[str] = field(default_factory=list)

@dataclass(frozen=True)
class TestCase:
    id: str
    input: Any
    expected_contains: List[str] = field(default_factory=list)
    forbidden_contains: List[str] = field(default_factory=list)
    expected_success: Optional[bool] = None
    expected_json_paths: Dict[str, Any] = field(default_factory=dict)
    expected_schema_valid: Optional[bool] = None
    context: Optional[Dict[str, Any]] = None

@dataclass(frozen=True)
class TestResult:
    test_id: str
    passed: bool
    output: str
    missing: List[str] = field(default_factory=list)
    reasons: List[str] = field(default_factory=list)
    categories: List[str] = field(default_factory=list)

@dataclass(frozen=True)
class EvaluationReport:
    skill_name: str
    total: int
    passed: int
    pass_rate: float
    results: List[TestResult]
    dimension_failures: Dict[str, int] = field(default_factory=dict)

@dataclass(frozen=True)
class PatchProposal:
    skill_name: str
    created_at_iso: str
    rationale: str
    patch_payload: str  # JSON map of {filepath: full_file_content}


# ── Creation models (ISC v0.4.0) ───────────────────────────────────────────────

@dataclass
class SkillPlan:
    """Architecture plan produced in Phase 1 of skill creation."""
    skill_name: str
    skill_title: str
    description: str
    language: str                    # "python" | "javascript"
    javascript_runtime: str          # "auto" | "classic" | "genjs"
    complexity: str                  # "simple" | "moderate" | "complex"
    execution_mode: str              # llm-only | media-generate | enhance-prompt | python | sandbox-*
    purpose: str
    inputs: List[Dict[str, Any]]     # [{name, type, required, description, example}]
    outputs: List[Dict[str, Any]]    # [{name, type, description}]
    logic_steps: List[str]
    algorithms: List[str]
    external_apis: List[str]
    categories: List[str]
    tags: List[str]
    trigger_patterns: List[str]


@dataclass
class CreatedSkill:
    """Result artifact after a successful skill creation pipeline."""
    skill_name: str
    skill_path: str
    files_written: List[str]
    language: str
    summary: str
    warnings: List[str] = field(default_factory=list)
