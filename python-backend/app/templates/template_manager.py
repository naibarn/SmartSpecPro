"""
SmartSpec Pro - Template Manager
Phase 1.2: Macro Workflow Templates

Manages templates for Kilo Architect mode output:
- spec.md: Feature specifications
- plan.md: Implementation plans
- tasks.md: Task breakdowns for OpenCode
"""

import os
import re
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import structlog

logger = structlog.get_logger()

# Template directory
TEMPLATE_DIR = Path(__file__).parent / "macro"


# ==================== DATA CLASSES ====================

@dataclass
class TemplateVariable:
    """Represents a variable in a template."""
    name: str
    default_value: str = ""
    description: str = ""
    required: bool = False


@dataclass
class ParsedTask:
    """Represents a parsed task from tasks.md."""
    task_id: str
    title: str
    priority: str  # P0, P1, P2, P3
    effort: str    # XS, S, M, L, XL
    assignee: str  # OpenCode, Manual
    dependencies: List[str] = field(default_factory=list)
    files_to_create: List[str] = field(default_factory=list)
    files_to_modify: List[str] = field(default_factory=list)
    description: str = ""
    acceptance_criteria: List[str] = field(default_factory=list)
    implementation_notes: str = ""
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "title": self.title,
            "priority": self.priority,
            "effort": self.effort,
            "assignee": self.assignee,
            "dependencies": self.dependencies,
            "files_to_create": self.files_to_create,
            "files_to_modify": self.files_to_modify,
            "description": self.description,
            "acceptance_criteria": self.acceptance_criteria,
            "implementation_notes": self.implementation_notes,
        }
    
    def to_prompt(self) -> str:
        """Convert task to a prompt for OpenCode."""
        prompt_parts = [
            f"# Task: {self.title}",
            f"\n## Description\n{self.description}",
        ]
        
        if self.files_to_create:
            prompt_parts.append(f"\n## Files to Create\n" + "\n".join(f"- {f}" for f in self.files_to_create))
        
        if self.files_to_modify:
            prompt_parts.append(f"\n## Files to Modify\n" + "\n".join(f"- {f}" for f in self.files_to_modify))
        
        if self.acceptance_criteria:
            prompt_parts.append(f"\n## Acceptance Criteria\n" + "\n".join(f"- [ ] {ac}" for ac in self.acceptance_criteria))
        
        if self.implementation_notes:
            prompt_parts.append(f"\n## Implementation Notes\n```\n{self.implementation_notes}\n```")
        
        return "\n".join(prompt_parts)


@dataclass
class MacroOutput:
    """Output from Kilo Architect mode."""
    feature_name: str
    spec_content: str = ""
    plan_content: str = ""
    tasks_content: str = ""
    parsed_tasks: List[ParsedTask] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "feature_name": self.feature_name,
            "spec_content": self.spec_content,
            "plan_content": self.plan_content,
            "tasks_content": self.tasks_content,
            "parsed_tasks": [t.to_dict() for t in self.parsed_tasks],
        }


# ==================== TEMPLATE MANAGER ====================

class TemplateManager:
    """
    Manages Macro Workflow Templates.
    
    Responsibilities:
    1. Load and render templates with variables
    2. Parse Kilo output into structured format
    3. Extract tasks for OpenCode execution
    """
    
    def __init__(self, template_dir: Optional[Path] = None):
        """Initialize the Template Manager."""
        self.template_dir = template_dir or TEMPLATE_DIR
        self._templates: Dict[str, str] = {}
        self._load_templates()
        
        logger.info("template_manager_initialized", template_dir=str(self.template_dir))
    
    def _load_templates(self):
        """Load all templates from the template directory."""
        if not self.template_dir.exists():
            logger.warning("template_dir_not_found", path=str(self.template_dir))
            return
        
        for template_file in self.template_dir.glob("*.md"):
            template_name = template_file.stem
            self._templates[template_name] = template_file.read_text(encoding="utf-8")
            logger.debug("template_loaded", name=template_name)
    
    def get_template(self, name: str) -> Optional[str]:
        """Get a template by name."""
        return self._templates.get(name)
    
    def render_template(self, name: str, variables: Dict[str, Any]) -> str:
        """
        Render a template with the given variables.
        
        Args:
            name: Template name (without .md extension)
            variables: Dictionary of variable values
            
        Returns:
            Rendered template content
        """
        template = self.get_template(name)
        if not template:
            raise ValueError(f"Template not found: {name}")
        
        # Add timestamp if not provided
        if "timestamp" not in variables:
            variables["timestamp"] = datetime.utcnow().isoformat()
        
        # Replace all {{variable}} patterns
        def replace_var(match):
            var_name = match.group(1)
            return str(variables.get(var_name, match.group(0)))
        
        rendered = re.sub(r"\{\{(\w+)\}\}", replace_var, template)
        return rendered
    
    def get_template_variables(self, name: str) -> List[TemplateVariable]:
        """Extract all variables from a template."""
        template = self.get_template(name)
        if not template:
            return []
        
        # Find all {{variable}} patterns
        var_pattern = re.compile(r"\{\{(\w+)\}\}")
        var_names = set(var_pattern.findall(template))
        
        return [TemplateVariable(name=name) for name in sorted(var_names)]
    
    def parse_tasks_md(self, content: str) -> List[ParsedTask]:
        """
        Parse tasks.md content into structured tasks.
        
        Args:
            content: The tasks.md file content
            
        Returns:
            List of ParsedTask objects
        """
        tasks = []
        current_task = None
        current_section = None
        
        lines = content.split("\n")
        task_pattern = re.compile(r"^####\s+Task\s+(\d+\.\d+):\s+(.+)$")
        
        for i, line in enumerate(lines):
            # Check for new task
            task_match = task_pattern.match(line)
            if task_match:
                # Save previous task
                if current_task:
                    tasks.append(current_task)
                
                # Start new task
                current_task = ParsedTask(
                    task_id=task_match.group(1),
                    title=task_match.group(2),
                    priority="P1",
                    effort="M",
                    assignee="OpenCode",
                )
                current_section = None
                continue
            
            if not current_task:
                continue
            
            # Parse task properties
            if line.startswith("- **Priority:**"):
                priority_match = re.search(r"P[0-3]", line)
                if priority_match:
                    current_task.priority = priority_match.group()
            
            elif line.startswith("- **Effort:**"):
                effort_match = re.search(r"(XS|S|M|L|XL)", line)
                if effort_match:
                    current_task.effort = effort_match.group()
            
            elif line.startswith("- **Assignee:**"):
                current_task.assignee = line.split(":")[-1].strip()
            
            elif line.startswith("- **Dependencies:**"):
                deps = line.split(":")[-1].strip()
                if deps.lower() != "none":
                    current_task.dependencies = [d.strip() for d in deps.split(",")]
            
            elif line.startswith("  - Create:"):
                file_path = line.split(":")[-1].strip().strip("`")
                current_task.files_to_create.append(file_path)
            
            elif line.startswith("  - Modify:"):
                file_path = line.split(":")[-1].strip().strip("`")
                current_task.files_to_modify.append(file_path)
            
            elif line.startswith("**Description:**"):
                current_section = "description"
            
            elif line.startswith("**Acceptance Criteria:**"):
                current_section = "acceptance_criteria"
            
            elif line.startswith("**Implementation Notes:**"):
                current_section = "implementation_notes"
            
            elif line.startswith("---"):
                current_section = None
            
            # Collect section content
            elif current_section == "description" and line.strip():
                current_task.description += line + "\n"
            
            elif current_section == "acceptance_criteria":
                ac_match = re.match(r"^-\s+\[.\]\s+(.+)$", line)
                if ac_match:
                    current_task.acceptance_criteria.append(ac_match.group(1))
            
            elif current_section == "implementation_notes":
                if not line.startswith("```"):
                    current_task.implementation_notes += line + "\n"
        
        # Don't forget the last task
        if current_task:
            tasks.append(current_task)
        
        # Clean up descriptions
        for task in tasks:
            task.description = task.description.strip()
            task.implementation_notes = task.implementation_notes.strip()
        
        logger.info("tasks_parsed", count=len(tasks))
        return tasks
    
    def parse_kilo_output(self, output: str, feature_name: str) -> MacroOutput:
        """
        Parse complete Kilo Architect output.
        
        Expects output to contain spec.md, plan.md, and tasks.md sections.
        """
        macro_output = MacroOutput(feature_name=feature_name)
        
        # Try to extract each section
        sections = self._split_output_sections(output)
        
        macro_output.spec_content = sections.get("spec", "")
        macro_output.plan_content = sections.get("plan", "")
        macro_output.tasks_content = sections.get("tasks", "")
        
        # Parse tasks if available
        if macro_output.tasks_content:
            macro_output.parsed_tasks = self.parse_tasks_md(macro_output.tasks_content)
        
        return macro_output
    
    def _split_output_sections(self, output: str) -> Dict[str, str]:
        """Split Kilo output into spec, plan, and tasks sections."""
        sections = {}
        
        # Look for file markers like "## spec.md" or "# spec.md"
        spec_pattern = re.compile(r"(?:^|\n)#+ spec\.md\n(.*?)(?=\n#+ (?:plan|tasks)\.md|\Z)", re.DOTALL | re.IGNORECASE)
        plan_pattern = re.compile(r"(?:^|\n)#+ plan\.md\n(.*?)(?=\n#+ (?:spec|tasks)\.md|\Z)", re.DOTALL | re.IGNORECASE)
        tasks_pattern = re.compile(r"(?:^|\n)#+ tasks\.md\n(.*?)(?=\n#+ (?:spec|plan)\.md|\Z)", re.DOTALL | re.IGNORECASE)
        
        spec_match = spec_pattern.search(output)
        if spec_match:
            sections["spec"] = spec_match.group(1).strip()
        
        plan_match = plan_pattern.search(output)
        if plan_match:
            sections["plan"] = plan_match.group(1).strip()
        
        tasks_match = tasks_pattern.search(output)
        if tasks_match:
            sections["tasks"] = tasks_match.group(1).strip()
        
        # If no sections found, treat entire output as tasks
        if not sections:
            sections["tasks"] = output
        
        return sections
    
    def get_tasks_for_opencode(
        self,
        parsed_tasks: List[ParsedTask],
        priority_filter: Optional[List[str]] = None,
    ) -> List[ParsedTask]:
        """
        Get tasks that should be sent to OpenCode.
        
        Args:
            parsed_tasks: List of parsed tasks
            priority_filter: Optional list of priorities to include (e.g., ["P0", "P1"])
            
        Returns:
            Filtered list of tasks for OpenCode
        """
        # Filter by assignee
        opencode_tasks = [t for t in parsed_tasks if t.assignee.lower() == "opencode"]
        
        # Filter by priority if specified
        if priority_filter:
            opencode_tasks = [t for t in opencode_tasks if t.priority in priority_filter]
        
        # Sort by priority and task_id
        priority_order = {"P0": 0, "P1": 1, "P2": 2, "P3": 3}
        opencode_tasks.sort(key=lambda t: (priority_order.get(t.priority, 99), t.task_id))
        
        return opencode_tasks
    
    def order_tasks_by_dependencies(
        self,
        tasks: List[ParsedTask],
    ) -> List[ParsedTask]:
        """
        Order tasks respecting their dependencies (topological sort).
        
        Args:
            tasks: List of tasks to order
            
        Returns:
            Ordered list of tasks
        """
        # Build dependency graph
        task_map = {t.task_id: t for t in tasks}
        in_degree = {t.task_id: 0 for t in tasks}
        
        for task in tasks:
            for dep in task.dependencies:
                # Handle dependencies like "Task 1.1" or "Epic 1"
                dep_id = dep.replace("Task ", "").replace("Epic ", "").strip()
                if dep_id in task_map:
                    in_degree[task.task_id] += 1
        
        # Kahn's algorithm for topological sort
        queue = [t for t in tasks if in_degree[t.task_id] == 0]
        ordered = []
        
        while queue:
            # Sort queue by priority for deterministic ordering
            queue.sort(key=lambda t: ({"P0": 0, "P1": 1, "P2": 2, "P3": 3}.get(t.priority, 99), t.task_id))
            task = queue.pop(0)
            ordered.append(task)
            
            # Reduce in-degree for dependent tasks
            for other_task in tasks:
                if task.task_id in [d.replace("Task ", "").replace("Epic ", "").strip() for d in other_task.dependencies]:
                    in_degree[other_task.task_id] -= 1
                    if in_degree[other_task.task_id] == 0:
                        queue.append(other_task)
        
        # If not all tasks were ordered, there's a cycle - return original order
        if len(ordered) != len(tasks):
            logger.warning("dependency_cycle_detected", ordered_count=len(ordered), total_count=len(tasks))
            return tasks
        
        return ordered
