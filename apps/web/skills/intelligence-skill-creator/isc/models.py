from __future__ import annotations
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

@dataclass(frozen=True)
class SkillManifest:
    name: str
    version: str
    description: str
    entrypoint: str = "skill.py"
    author: str = ""
    tags: List[str] = None

@dataclass(frozen=True)
class TestCase:
    id: str
    input: str
    expected_contains: List[str]
    context: Optional[Dict[str, Any]] = None

@dataclass(frozen=True)
class TestResult:
    test_id: str
    passed: bool
    output: str
    missing: List[str]

@dataclass(frozen=True)
class EvaluationReport:
    skill_name: str
    total: int
    passed: int
    pass_rate: float
    results: List[TestResult]

@dataclass(frozen=True)
class PatchProposal:
    skill_name: str
    created_at_iso: str
    rationale: str
    unified_diff: str
