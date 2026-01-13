"""
SmartSpec Pro - Quality Gate Validators
Phase 2: Quality & Intelligence

Validators for different quality aspects:
- Code Quality (linting, complexity, formatting)
- Test Coverage
- Security (vulnerability scanning)
- Spec Compliance (requirements validation)
"""

import asyncio
import re
import subprocess
from dataclasses import dataclass
from typing import Any, Dict, List, Optional
from pathlib import Path

import structlog

from app.orchestrator.quality_gates.gate_manager import (
    BaseValidator,
    ValidatorType,
    ValidationIssue,
    GateConfig,
)

logger = structlog.get_logger()


# ==================== CODE QUALITY VALIDATOR ====================

class CodeQualityValidator(BaseValidator):
    """
    Validates code quality using various tools:
    - Ruff (Python linting)
    - Black (Python formatting)
    - ESLint (JavaScript/TypeScript)
    - Complexity analysis
    """
    
    validator_type = ValidatorType.CODE_QUALITY
    
    # Complexity thresholds
    DEFAULT_MAX_COMPLEXITY = 15
    DEFAULT_MAX_LINE_LENGTH = 120
    DEFAULT_MAX_FUNCTION_LENGTH = 50
    
    async def validate(
        self,
        context: Dict[str, Any],
        config: GateConfig,
    ) -> List[ValidationIssue]:
        """Run code quality validation."""
        issues = []
        
        files = context.get("files", [])
        code_content = context.get("code_content", {})
        project_path = context.get("project_path", "")
        
        # Run linting
        lint_issues = await self._run_linting(files, project_path)
        issues.extend(lint_issues)
        
        # Run formatting check
        format_issues = await self._check_formatting(files, project_path)
        issues.extend(format_issues)
        
        # Check complexity
        complexity_issues = await self._check_complexity(
            code_content,
            config.thresholds.get("max_complexity", self.DEFAULT_MAX_COMPLEXITY),
        )
        issues.extend(complexity_issues)
        
        return issues
    
    async def get_metrics(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """Get code quality metrics."""
        code_content = context.get("code_content", {})
        
        total_lines = 0
        total_functions = 0
        max_complexity = 0
        
        for file_path, content in code_content.items():
            lines = content.split("\n")
            total_lines += len(lines)
            
            # Count functions (simple regex)
            functions = re.findall(r"^\s*(def|async def|function)\s+\w+", content, re.MULTILINE)
            total_functions += len(functions)
        
        return {
            "total_lines": total_lines,
            "total_functions": total_functions,
            "max_complexity": max_complexity,
            "files_analyzed": len(code_content),
        }
    
    async def _run_linting(
        self,
        files: List[str],
        project_path: str,
    ) -> List[ValidationIssue]:
        """Run linting tools."""
        issues = []
        
        python_files = [f for f in files if f.endswith(".py")]
        
        if python_files and project_path:
            try:
                # Run ruff
                result = await asyncio.create_subprocess_exec(
                    "ruff", "check", "--output-format=json", *python_files,
                    cwd=project_path,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                stdout, stderr = await result.communicate()
                
                if stdout:
                    import json
                    try:
                        ruff_issues = json.loads(stdout.decode())
                        for item in ruff_issues:
                            issues.append(ValidationIssue(
                                severity="warning" if item.get("fix") else "error",
                                category="linting",
                                message=item.get("message", ""),
                                file=item.get("filename"),
                                line=item.get("location", {}).get("row"),
                                column=item.get("location", {}).get("column"),
                                rule=item.get("code"),
                                suggestion=item.get("fix", {}).get("message") if item.get("fix") else None,
                            ))
                    except json.JSONDecodeError:
                        pass
                        
            except FileNotFoundError:
                logger.warning("ruff_not_found")
            except Exception as e:
                logger.error("linting_error", error=str(e))
        
        return issues
    
    async def _check_formatting(
        self,
        files: List[str],
        project_path: str,
    ) -> List[ValidationIssue]:
        """Check code formatting."""
        issues = []
        
        python_files = [f for f in files if f.endswith(".py")]
        
        if python_files and project_path:
            try:
                # Run black --check
                result = await asyncio.create_subprocess_exec(
                    "black", "--check", "--diff", *python_files,
                    cwd=project_path,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                stdout, stderr = await result.communicate()
                
                if result.returncode != 0:
                    # Files need formatting
                    for file in python_files:
                        if file.encode() in stdout or file.encode() in stderr:
                            issues.append(ValidationIssue(
                                severity="warning",
                                category="formatting",
                                message="File needs formatting",
                                file=file,
                                suggestion="Run 'black' to format",
                            ))
                            
            except FileNotFoundError:
                logger.warning("black_not_found")
            except Exception as e:
                logger.error("formatting_check_error", error=str(e))
        
        return issues
    
    async def _check_complexity(
        self,
        code_content: Dict[str, str],
        max_complexity: int,
    ) -> List[ValidationIssue]:
        """Check code complexity."""
        issues = []
        
        for file_path, content in code_content.items():
            if not file_path.endswith(".py"):
                continue
            
            # Simple complexity check based on nesting and branches
            lines = content.split("\n")
            current_indent = 0
            max_indent = 0
            branch_count = 0
            
            for line in lines:
                stripped = line.lstrip()
                if stripped:
                    indent = len(line) - len(stripped)
                    max_indent = max(max_indent, indent // 4)
                    
                    # Count branches
                    if stripped.startswith(("if ", "elif ", "for ", "while ", "try:", "except")):
                        branch_count += 1
            
            # Estimate complexity
            estimated_complexity = max_indent + (branch_count // 5)
            
            if estimated_complexity > max_complexity:
                issues.append(ValidationIssue(
                    severity="warning",
                    category="complexity",
                    message=f"High complexity detected (estimated: {estimated_complexity})",
                    file=file_path,
                    suggestion="Consider refactoring to reduce complexity",
                ))
        
        return issues


# ==================== TEST COVERAGE VALIDATOR ====================

class TestCoverageValidator(BaseValidator):
    """
    Validates test coverage.
    """
    
    validator_type = ValidatorType.TEST_COVERAGE
    
    DEFAULT_MIN_COVERAGE = 60.0
    
    async def validate(
        self,
        context: Dict[str, Any],
        config: GateConfig,
    ) -> List[ValidationIssue]:
        """Run test coverage validation."""
        issues = []
        
        coverage_data = context.get("coverage_data", {})
        min_coverage = config.thresholds.get("min_coverage", self.DEFAULT_MIN_COVERAGE)
        
        # Check overall coverage
        overall_coverage = coverage_data.get("overall", 0)
        if overall_coverage < min_coverage:
            issues.append(ValidationIssue(
                severity="error",
                category="coverage",
                message=f"Overall coverage {overall_coverage}% is below threshold {min_coverage}%",
                suggestion=f"Add tests to increase coverage to at least {min_coverage}%",
            ))
        
        # Check per-file coverage
        file_coverage = coverage_data.get("files", {})
        for file_path, coverage in file_coverage.items():
            if coverage < min_coverage:
                issues.append(ValidationIssue(
                    severity="warning",
                    category="coverage",
                    message=f"File coverage {coverage}% is below threshold",
                    file=file_path,
                    suggestion="Add tests for this file",
                ))
        
        # Check for untested files
        untested_files = coverage_data.get("untested_files", [])
        for file_path in untested_files:
            issues.append(ValidationIssue(
                severity="warning",
                category="coverage",
                message="File has no test coverage",
                file=file_path,
                suggestion="Create tests for this file",
            ))
        
        return issues
    
    async def get_metrics(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """Get coverage metrics."""
        coverage_data = context.get("coverage_data", {})
        
        return {
            "coverage": coverage_data.get("overall", 0),
            "lines_covered": coverage_data.get("lines_covered", 0),
            "lines_total": coverage_data.get("lines_total", 0),
            "files_with_coverage": len(coverage_data.get("files", {})),
            "untested_files": len(coverage_data.get("untested_files", [])),
        }


# ==================== SECURITY VALIDATOR ====================

class SecurityValidator(BaseValidator):
    """
    Validates security aspects:
    - Dependency vulnerabilities
    - Code security issues
    - Secrets detection
    """
    
    validator_type = ValidatorType.SECURITY
    
    # Patterns for secret detection
    SECRET_PATTERNS = [
        (r"(?i)(api[_-]?key|apikey)\s*[=:]\s*['\"][^'\"]+['\"]", "API key detected"),
        (r"(?i)(secret|password|passwd|pwd)\s*[=:]\s*['\"][^'\"]+['\"]", "Secret/password detected"),
        (r"(?i)(token)\s*[=:]\s*['\"][^'\"]+['\"]", "Token detected"),
        (r"(?i)(aws[_-]?access[_-]?key)", "AWS access key pattern detected"),
        (r"(?i)(private[_-]?key)", "Private key reference detected"),
        (r"-----BEGIN (RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----", "Private key detected"),
    ]
    
    # Dangerous patterns
    DANGEROUS_PATTERNS = [
        (r"eval\s*\(", "Use of eval() detected"),
        (r"exec\s*\(", "Use of exec() detected"),
        (r"subprocess\.call\s*\([^)]*shell\s*=\s*True", "Shell injection risk"),
        (r"os\.system\s*\(", "Use of os.system() detected"),
        (r"pickle\.loads?\s*\(", "Unsafe pickle usage detected"),
        (r"yaml\.load\s*\([^)]*\)", "Unsafe YAML load detected"),
    ]
    
    async def validate(
        self,
        context: Dict[str, Any],
        config: GateConfig,
    ) -> List[ValidationIssue]:
        """Run security validation."""
        issues = []
        
        code_content = context.get("code_content", {})
        
        # Check for secrets
        secret_issues = await self._check_secrets(code_content)
        issues.extend(secret_issues)
        
        # Check for dangerous patterns
        dangerous_issues = await self._check_dangerous_patterns(code_content)
        issues.extend(dangerous_issues)
        
        # Check dependencies (if available)
        dependencies = context.get("dependencies", {})
        if dependencies:
            dep_issues = await self._check_dependencies(dependencies)
            issues.extend(dep_issues)
        
        return issues
    
    async def get_metrics(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """Get security metrics."""
        return {
            "security_issues": 0,  # Will be updated by validation
            "secrets_detected": 0,
            "dangerous_patterns": 0,
            "vulnerable_dependencies": 0,
        }
    
    async def _check_secrets(
        self,
        code_content: Dict[str, str],
    ) -> List[ValidationIssue]:
        """Check for hardcoded secrets."""
        issues = []
        
        for file_path, content in code_content.items():
            # Skip test files and config examples
            if "test" in file_path.lower() or "example" in file_path.lower():
                continue
            
            lines = content.split("\n")
            for line_num, line in enumerate(lines, 1):
                for pattern, message in self.SECRET_PATTERNS:
                    if re.search(pattern, line):
                        issues.append(ValidationIssue(
                            severity="error",
                            category="security",
                            message=message,
                            file=file_path,
                            line=line_num,
                            rule="secret-detection",
                            suggestion="Use environment variables or secrets management",
                        ))
                        break  # One issue per line
        
        return issues
    
    async def _check_dangerous_patterns(
        self,
        code_content: Dict[str, str],
    ) -> List[ValidationIssue]:
        """Check for dangerous code patterns."""
        issues = []
        
        for file_path, content in code_content.items():
            lines = content.split("\n")
            for line_num, line in enumerate(lines, 1):
                for pattern, message in self.DANGEROUS_PATTERNS:
                    if re.search(pattern, line):
                        issues.append(ValidationIssue(
                            severity="warning",
                            category="security",
                            message=message,
                            file=file_path,
                            line=line_num,
                            rule="dangerous-pattern",
                            suggestion="Consider using safer alternatives",
                        ))
        
        return issues
    
    async def _check_dependencies(
        self,
        dependencies: Dict[str, str],
    ) -> List[ValidationIssue]:
        """Check for vulnerable dependencies."""
        issues = []
        
        # This would integrate with vulnerability databases
        # For now, check for known problematic versions
        known_vulnerabilities = {
            "pyyaml": {"<5.4": "CVE-2020-14343: Arbitrary code execution"},
            "requests": {"<2.20.0": "CVE-2018-18074: Session fixation"},
            "django": {"<3.2.4": "Multiple security vulnerabilities"},
            "flask": {"<2.0.0": "Multiple security vulnerabilities"},
        }
        
        for package, version in dependencies.items():
            package_lower = package.lower()
            if package_lower in known_vulnerabilities:
                for vuln_version, description in known_vulnerabilities[package_lower].items():
                    # Simple version comparison (would need proper semver)
                    issues.append(ValidationIssue(
                        severity="warning",
                        category="security",
                        message=f"Potentially vulnerable dependency: {package}",
                        rule="vulnerable-dependency",
                        suggestion=f"Update {package} to latest version. {description}",
                    ))
        
        return issues


# ==================== SPEC COMPLIANCE VALIDATOR ====================

class SpecComplianceValidator(BaseValidator):
    """
    Validates compliance with specifications.
    """
    
    validator_type = ValidatorType.SPEC_COMPLIANCE
    
    async def validate(
        self,
        context: Dict[str, Any],
        config: GateConfig,
    ) -> List[ValidationIssue]:
        """Run spec compliance validation."""
        issues = []
        
        spec = context.get("spec", {})
        implementation = context.get("implementation", {})
        
        # Check required fields in spec
        required_fields = ["title", "description", "requirements"]
        for field in required_fields:
            if field not in spec:
                issues.append(ValidationIssue(
                    severity="error",
                    category="spec_compliance",
                    message=f"Missing required field in spec: {field}",
                    suggestion=f"Add {field} to the specification",
                ))
        
        # Check requirements coverage
        requirements = spec.get("requirements", [])
        implemented = implementation.get("completed_requirements", [])
        
        for req in requirements:
            req_id = req.get("id", "")
            if req_id and req_id not in implemented:
                issues.append(ValidationIssue(
                    severity="warning",
                    category="spec_compliance",
                    message=f"Requirement not implemented: {req_id}",
                    suggestion=f"Implement requirement: {req.get('description', req_id)}",
                ))
        
        # Check acceptance criteria
        acceptance_criteria = spec.get("acceptance_criteria", [])
        verified_criteria = implementation.get("verified_criteria", [])
        
        for criteria in acceptance_criteria:
            criteria_id = criteria.get("id", "")
            if criteria_id and criteria_id not in verified_criteria:
                issues.append(ValidationIssue(
                    severity="warning",
                    category="spec_compliance",
                    message=f"Acceptance criteria not verified: {criteria_id}",
                    suggestion="Add tests to verify this criteria",
                ))
        
        return issues
    
    async def get_metrics(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """Get spec compliance metrics."""
        spec = context.get("spec", {})
        implementation = context.get("implementation", {})
        
        requirements = spec.get("requirements", [])
        implemented = implementation.get("completed_requirements", [])
        
        acceptance_criteria = spec.get("acceptance_criteria", [])
        verified_criteria = implementation.get("verified_criteria", [])
        
        req_coverage = (len(implemented) / len(requirements) * 100) if requirements else 100
        criteria_coverage = (len(verified_criteria) / len(acceptance_criteria) * 100) if acceptance_criteria else 100
        
        return {
            "spec_completeness": (req_coverage + criteria_coverage) / 2,
            "requirements_total": len(requirements),
            "requirements_implemented": len(implemented),
            "criteria_total": len(acceptance_criteria),
            "criteria_verified": len(verified_criteria),
        }


# ==================== DOCUMENTATION VALIDATOR ====================

class DocumentationValidator(BaseValidator):
    """
    Validates documentation coverage.
    """
    
    validator_type = ValidatorType.DOCUMENTATION
    
    async def validate(
        self,
        context: Dict[str, Any],
        config: GateConfig,
    ) -> List[ValidationIssue]:
        """Run documentation validation."""
        issues = []
        
        code_content = context.get("code_content", {})
        
        for file_path, content in code_content.items():
            if not file_path.endswith(".py"):
                continue
            
            # Check for module docstring
            if not content.strip().startswith('"""') and not content.strip().startswith("'''"):
                issues.append(ValidationIssue(
                    severity="warning",
                    category="documentation",
                    message="Missing module docstring",
                    file=file_path,
                    suggestion="Add a module-level docstring",
                ))
            
            # Check for function docstrings
            functions = re.findall(
                r"^\s*(def|async def)\s+(\w+)\s*\([^)]*\):",
                content,
                re.MULTILINE,
            )
            
            for match in functions:
                func_name = match[1]
                if func_name.startswith("_"):
                    continue  # Skip private functions
                
                # Check if function has docstring
                pattern = rf"(def|async def)\s+{func_name}\s*\([^)]*\):\s*\n\s*['\"]{{3}}"
                if not re.search(pattern, content):
                    issues.append(ValidationIssue(
                        severity="info",
                        category="documentation",
                        message=f"Missing docstring for function: {func_name}",
                        file=file_path,
                        suggestion="Add a docstring to document the function",
                    ))
        
        return issues
    
    async def get_metrics(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """Get documentation metrics."""
        code_content = context.get("code_content", {})
        
        total_functions = 0
        documented_functions = 0
        
        for file_path, content in code_content.items():
            if not file_path.endswith(".py"):
                continue
            
            functions = re.findall(
                r"^\s*(def|async def)\s+(\w+)\s*\([^)]*\):",
                content,
                re.MULTILINE,
            )
            
            for match in functions:
                func_name = match[1]
                if func_name.startswith("_"):
                    continue
                
                total_functions += 1
                
                pattern = rf"(def|async def)\s+{func_name}\s*\([^)]*\):\s*\n\s*['\"]{{3}}"
                if re.search(pattern, content):
                    documented_functions += 1
        
        doc_coverage = (documented_functions / total_functions * 100) if total_functions > 0 else 100
        
        return {
            "doc_coverage": doc_coverage,
            "total_functions": total_functions,
            "documented_functions": documented_functions,
        }
