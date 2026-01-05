"""
SmartSpec Pro - Kilo Code Skill Manager v2
With Claude Code Compatibility

Manages skill injection for both Kilo Code CLI and Claude Code.
Skills are markdown files that provide domain expertise and
repeatable workflows to the AI agent.

Supports dual directory paths:
- .kilocode/skills/ (Kilo Code)
- .claude/skills/ (Claude Code)
"""

import os
import shutil
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import yaml

import structlog

logger = structlog.get_logger()


# ==================== ENUMS ====================

class SkillScope(str, Enum):
    """Skill scope - where the skill is available."""
    GLOBAL = "global"  # Available in all projects
    PROJECT = "project"  # Project-specific
    USER = "user"  # User-specific (Claude Code)


class SkillMode(str, Enum):
    """Skill mode - when the skill is loaded."""
    GENERIC = "generic"  # Available in all modes
    CODE = "code"  # Only in code mode
    ARCHITECT = "architect"  # Only in architect mode
    DEBUG = "debug"  # Only in debug mode
    ASK = "ask"  # Only in ask mode
    ORCHESTRATOR = "orchestrator"  # Only in orchestrator mode


class SkillFormat(str, Enum):
    """Skill format - which tool the skill is for."""
    KILO = "kilo"  # Kilo Code format
    CLAUDE = "claude"  # Claude Code format
    UNIVERSAL = "universal"  # Compatible with both


# ==================== DATA CLASSES ====================

@dataclass
class Skill:
    """Represents a skill compatible with both Kilo Code and Claude Code."""
    name: str
    description: str
    content: str
    scope: SkillScope = SkillScope.PROJECT
    mode: SkillMode = SkillMode.GENERIC
    
    # Common fields
    version: str = "1.0.0"
    author: Optional[str] = None
    tags: List[str] = field(default_factory=list)
    
    # Claude Code specific fields
    allowed_tools: List[str] = field(default_factory=list)
    model: Optional[str] = None
    
    # Metadata
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)
    source_format: SkillFormat = SkillFormat.UNIVERSAL
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "content": self.content,
            "scope": self.scope.value,
            "mode": self.mode.value,
            "version": self.version,
            "author": self.author,
            "tags": self.tags,
            "allowed_tools": self.allowed_tools,
            "model": self.model,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "source_format": self.source_format.value,
        }
    
    def to_skill_md(self, format: SkillFormat = SkillFormat.UNIVERSAL) -> str:
        """
        Convert to SKILL.md format.
        
        Args:
            format: Target format (kilo, claude, or universal)
        
        Returns:
            SKILL.md content with YAML frontmatter
        """
        frontmatter = {
            "name": self.name,
            "description": self.description,
        }
        
        # Add format-specific fields
        if format in (SkillFormat.KILO, SkillFormat.UNIVERSAL):
            frontmatter["version"] = self.version
            if self.author:
                frontmatter["author"] = self.author
            if self.tags:
                frontmatter["tags"] = self.tags
        
        if format in (SkillFormat.CLAUDE, SkillFormat.UNIVERSAL):
            if self.allowed_tools:
                frontmatter["allowed-tools"] = self.allowed_tools
            if self.model:
                frontmatter["model"] = self.model
        
        yaml_str = yaml.dump(frontmatter, default_flow_style=False, allow_unicode=True)
        
        return f"---\n{yaml_str}---\n\n{self.content}"
    
    @classmethod
    def from_skill_md(
        cls,
        content: str,
        name: str,
        scope: SkillScope,
        mode: SkillMode,
        source_format: SkillFormat = SkillFormat.UNIVERSAL,
    ) -> "Skill":
        """
        Parse a SKILL.md file.
        
        Args:
            content: SKILL.md content
            name: Skill name (from directory)
            scope: Skill scope
            mode: Skill mode
            source_format: Source format
        
        Returns:
            Skill instance
        """
        # Parse YAML frontmatter
        if content.startswith("---"):
            parts = content.split("---", 2)
            if len(parts) >= 3:
                try:
                    frontmatter = yaml.safe_load(parts[1]) or {}
                    body = parts[2].strip()
                except yaml.YAMLError:
                    frontmatter = {}
                    body = content
            else:
                frontmatter = {}
                body = content
        else:
            frontmatter = {}
            body = content
        
        return cls(
            name=frontmatter.get("name", name),
            description=frontmatter.get("description", ""),
            content=body,
            scope=scope,
            mode=mode,
            version=frontmatter.get("version", "1.0.0"),
            author=frontmatter.get("author"),
            tags=frontmatter.get("tags", []),
            allowed_tools=frontmatter.get("allowed-tools", []),
            model=frontmatter.get("model"),
            source_format=source_format,
        )


# ==================== PATH CONFIGURATION ====================

class SkillPaths:
    """Manages skill directory paths for both Kilo Code and Claude Code."""
    
    # Directory names
    KILO_DIR = ".kilocode"
    CLAUDE_DIR = ".claude"
    SKILLS_SUBDIR = "skills"
    
    # Global paths
    KILO_GLOBAL = os.path.expanduser("~/.kilocode/skills")
    CLAUDE_GLOBAL = os.path.expanduser("~/.claude/skills")
    
    @classmethod
    def get_project_paths(cls, workspace: str) -> Dict[SkillFormat, Path]:
        """Get project skill paths for both formats."""
        return {
            SkillFormat.KILO: Path(workspace) / cls.KILO_DIR / cls.SKILLS_SUBDIR,
            SkillFormat.CLAUDE: Path(workspace) / cls.CLAUDE_DIR / cls.SKILLS_SUBDIR,
        }
    
    @classmethod
    def get_global_paths(cls) -> Dict[SkillFormat, Path]:
        """Get global skill paths for both formats."""
        return {
            SkillFormat.KILO: Path(cls.KILO_GLOBAL),
            SkillFormat.CLAUDE: Path(cls.CLAUDE_GLOBAL),
        }
    
    @classmethod
    def get_all_paths(cls, workspace: str, scope: SkillScope) -> Dict[SkillFormat, Path]:
        """Get all paths for a given scope."""
        if scope == SkillScope.GLOBAL:
            return cls.get_global_paths()
        else:
            return cls.get_project_paths(workspace)


# ==================== SKILL MANAGER ====================

class KiloSkillManager:
    """
    Manages skills for both Kilo Code and Claude Code.
    
    Supports:
    - Dual directory paths (.kilocode/skills and .claude/skills)
    - Claude Code metadata fields (allowed-tools, model)
    - Skill conversion between formats
    - Automatic sync between directories
    """
    
    def __init__(
        self,
        kilo_global_dir: Optional[str] = None,
        claude_global_dir: Optional[str] = None,
        auto_sync: bool = True,
    ):
        """
        Initialize the skill manager.
        
        Args:
            kilo_global_dir: Path to Kilo global skills directory
            claude_global_dir: Path to Claude global skills directory
            auto_sync: Automatically sync skills between directories
        """
        self.kilo_global_dir = Path(kilo_global_dir or SkillPaths.KILO_GLOBAL)
        self.claude_global_dir = Path(claude_global_dir or SkillPaths.CLAUDE_GLOBAL)
        self.auto_sync = auto_sync
        
        logger.info(
            "Kilo skill manager v2 initialized",
            kilo_global_dir=str(self.kilo_global_dir),
            claude_global_dir=str(self.claude_global_dir),
            auto_sync=auto_sync,
        )
    
    def _get_skills_dir(
        self,
        workspace: str,
        scope: SkillScope,
        format: SkillFormat = SkillFormat.KILO,
        mode: SkillMode = SkillMode.GENERIC,
    ) -> Path:
        """
        Get the skills directory for a given scope, format, and mode.
        
        Args:
            workspace: Workspace directory
            scope: Skill scope (global or project)
            format: Skill format (kilo or claude)
            mode: Skill mode
        
        Returns:
            Path to skills directory
        """
        if scope == SkillScope.GLOBAL:
            if format == SkillFormat.CLAUDE:
                base_dir = self.claude_global_dir
            else:
                base_dir = self.kilo_global_dir
        else:
            if format == SkillFormat.CLAUDE:
                base_dir = Path(workspace) / SkillPaths.CLAUDE_DIR
            else:
                base_dir = Path(workspace) / SkillPaths.KILO_DIR
        
        # Claude Code doesn't use mode-specific directories
        if format == SkillFormat.CLAUDE or mode == SkillMode.GENERIC:
            return base_dir / SkillPaths.SKILLS_SUBDIR
        else:
            return base_dir / f"skills-{mode.value}"
    
    def _get_all_skill_dirs(
        self,
        workspace: str,
        scope: SkillScope,
        mode: SkillMode = SkillMode.GENERIC,
    ) -> List[Tuple[Path, SkillFormat]]:
        """Get all skill directories for both formats."""
        dirs = []
        for fmt in [SkillFormat.KILO, SkillFormat.CLAUDE]:
            path = self._get_skills_dir(workspace, scope, fmt, mode)
            dirs.append((path, fmt))
        return dirs
    
    def create_skill(
        self,
        workspace: str,
        skill: Skill,
        formats: Optional[List[SkillFormat]] = None,
    ) -> Dict[SkillFormat, Path]:
        """
        Create a skill in the workspace.
        
        Args:
            workspace: Workspace directory
            skill: Skill to create
            formats: Target formats (default: both kilo and claude)
        
        Returns:
            Dict of format to created skill path
        """
        if formats is None:
            formats = [SkillFormat.KILO, SkillFormat.CLAUDE]
        
        created_paths = {}
        
        for fmt in formats:
            # Get skills directory
            skills_dir = self._get_skills_dir(workspace, skill.scope, fmt, skill.mode)
            skill_dir = skills_dir / skill.name
            
            # Create directory
            skill_dir.mkdir(parents=True, exist_ok=True)
            
            # Write SKILL.md
            skill_file = skill_dir / "SKILL.md"
            skill_file.write_text(skill.to_skill_md(fmt))
            
            created_paths[fmt] = skill_dir
            
            logger.info(
                "Skill created",
                name=skill.name,
                format=fmt.value,
                path=str(skill_file),
            )
        
        return created_paths
    
    def delete_skill(
        self,
        workspace: str,
        skill_name: str,
        scope: SkillScope = SkillScope.PROJECT,
        mode: SkillMode = SkillMode.GENERIC,
        formats: Optional[List[SkillFormat]] = None,
    ) -> Dict[SkillFormat, bool]:
        """
        Delete a skill from specified formats.
        
        Args:
            workspace: Workspace directory
            skill_name: Name of skill to delete
            scope: Skill scope
            mode: Skill mode
            formats: Target formats (default: both)
        
        Returns:
            Dict of format to deletion success
        """
        if formats is None:
            formats = [SkillFormat.KILO, SkillFormat.CLAUDE]
        
        results = {}
        
        for fmt in formats:
            skills_dir = self._get_skills_dir(workspace, scope, fmt, mode)
            skill_dir = skills_dir / skill_name
            
            if skill_dir.exists():
                shutil.rmtree(skill_dir)
                results[fmt] = True
                logger.info("Skill deleted", name=skill_name, format=fmt.value)
            else:
                results[fmt] = False
        
        return results
    
    def get_skill(
        self,
        workspace: str,
        skill_name: str,
        scope: SkillScope = SkillScope.PROJECT,
        mode: SkillMode = SkillMode.GENERIC,
        prefer_format: SkillFormat = SkillFormat.KILO,
    ) -> Optional[Skill]:
        """
        Get a skill by name.
        
        Args:
            workspace: Workspace directory
            skill_name: Name of skill
            scope: Skill scope
            mode: Skill mode
            prefer_format: Preferred format to read from
        
        Returns:
            Skill if found
        """
        # Try preferred format first
        formats = [prefer_format] + [f for f in SkillFormat if f != prefer_format and f != SkillFormat.UNIVERSAL]
        
        for fmt in formats:
            skills_dir = self._get_skills_dir(workspace, scope, fmt, mode)
            skill_file = skills_dir / skill_name / "SKILL.md"
            
            if skill_file.exists():
                content = skill_file.read_text()
                return Skill.from_skill_md(content, skill_name, scope, mode, fmt)
        
        return None
    
    def list_skills(
        self,
        workspace: str,
        scope: Optional[SkillScope] = None,
        mode: Optional[SkillMode] = None,
        include_both_formats: bool = True,
    ) -> List[Skill]:
        """
        List all skills for a workspace.
        
        Args:
            workspace: Workspace directory
            scope: Optional scope filter
            mode: Optional mode filter
            include_both_formats: Include skills from both directories
        
        Returns:
            List of skills (deduplicated by name)
        """
        skills_dict: Dict[str, Skill] = {}
        
        # Determine scopes to search
        scopes = [scope] if scope else [SkillScope.PROJECT, SkillScope.GLOBAL]
        
        # Determine modes to search
        modes = [mode] if mode else list(SkillMode)
        
        # Determine formats to search
        formats = [SkillFormat.KILO, SkillFormat.CLAUDE] if include_both_formats else [SkillFormat.KILO]
        
        for s in scopes:
            for m in modes:
                for fmt in formats:
                    skills_dir = self._get_skills_dir(workspace, s, fmt, m)
                    
                    if not skills_dir.exists():
                        continue
                    
                    for skill_dir in skills_dir.iterdir():
                        if skill_dir.is_dir():
                            skill_file = skill_dir / "SKILL.md"
                            if skill_file.exists():
                                content = skill_file.read_text()
                                skill = Skill.from_skill_md(
                                    content, skill_dir.name, s, m, fmt
                                )
                                # Use name as key to deduplicate
                                if skill.name not in skills_dict:
                                    skills_dict[skill.name] = skill
        
        return list(skills_dict.values())
    
    def sync_skill(
        self,
        workspace: str,
        skill_name: str,
        scope: SkillScope = SkillScope.PROJECT,
        mode: SkillMode = SkillMode.GENERIC,
        source_format: SkillFormat = SkillFormat.KILO,
    ) -> Optional[Path]:
        """
        Sync a skill from one format to another.
        
        Args:
            workspace: Workspace directory
            skill_name: Name of skill to sync
            scope: Skill scope
            mode: Skill mode
            source_format: Source format to sync from
        
        Returns:
            Path to synced skill if successful
        """
        # Get source skill
        skill = self.get_skill(workspace, skill_name, scope, mode, source_format)
        if not skill:
            logger.warning("Skill not found for sync", name=skill_name, source=source_format.value)
            return None
        
        # Determine target format
        target_format = SkillFormat.CLAUDE if source_format == SkillFormat.KILO else SkillFormat.KILO
        
        # Create in target format
        result = self.create_skill(workspace, skill, formats=[target_format])
        
        return result.get(target_format)
    
    def sync_all_skills(
        self,
        workspace: str,
        scope: SkillScope = SkillScope.PROJECT,
        source_format: SkillFormat = SkillFormat.KILO,
    ) -> Dict[str, Path]:
        """
        Sync all skills from one format to another.
        
        Args:
            workspace: Workspace directory
            scope: Skill scope
            source_format: Source format to sync from
        
        Returns:
            Dict of skill name to synced path
        """
        results = {}
        
        # Get all skills from source format
        skills = self.list_skills(workspace, scope, include_both_formats=False)
        
        for skill in skills:
            if skill.source_format == source_format:
                path = self.sync_skill(workspace, skill.name, scope, skill.mode, source_format)
                if path:
                    results[skill.name] = path
        
        logger.info(
            "Skills synced",
            count=len(results),
            source=source_format.value,
        )
        
        return results
    
    def convert_skill(
        self,
        skill: Skill,
        target_format: SkillFormat,
    ) -> str:
        """
        Convert a skill to a specific format.
        
        Args:
            skill: Skill to convert
            target_format: Target format
        
        Returns:
            SKILL.md content in target format
        """
        return skill.to_skill_md(target_format)
    
    def inject_skill_from_template(
        self,
        workspace: str,
        template_name: str,
        scope: SkillScope = SkillScope.PROJECT,
        mode: SkillMode = SkillMode.GENERIC,
        formats: Optional[List[SkillFormat]] = None,
    ) -> Dict[SkillFormat, Path]:
        """
        Inject a skill from a predefined template.
        
        Args:
            workspace: Workspace directory
            template_name: Name of template
            scope: Skill scope
            mode: Skill mode
            formats: Target formats
        
        Returns:
            Dict of format to created skill path
        """
        from app.services.kilo_skill_manager import SKILL_TEMPLATES
        
        template = SKILL_TEMPLATES.get(template_name)
        
        if not template:
            logger.warning("Skill template not found", template=template_name)
            return {}
        
        # Create a copy with the specified scope and mode
        skill = Skill(
            name=template.name,
            description=template.description,
            content=template.content,
            scope=scope,
            mode=mode,
            version=template.version,
            author=template.author,
            tags=template.tags,
        )
        
        return self.create_skill(workspace, skill, formats)
    
    def inject_smartspec_context(
        self,
        workspace: str,
        semantic_memories: List[Dict[str, Any]],
        episodic_summaries: Optional[List[str]] = None,
        formats: Optional[List[SkillFormat]] = None,
    ) -> Dict[SkillFormat, Path]:
        """
        Inject SmartSpec context (memories) as a skill.
        
        Args:
            workspace: Workspace directory
            semantic_memories: List of semantic memory dictionaries
            episodic_summaries: Optional list of episodic memory summaries
            formats: Target formats
        
        Returns:
            Dict of format to created skill path
        """
        content_parts = ["# SmartSpec Context\n\n"]
        
        # Group memories by type
        memories_by_type: Dict[str, List[Dict]] = {}
        for memory in semantic_memories:
            mem_type = memory.get("memory_type", "other")
            if mem_type not in memories_by_type:
                memories_by_type[mem_type] = []
            memories_by_type[mem_type].append(memory)
        
        # Add user preferences
        if "user_preference" in memories_by_type:
            content_parts.append("## User Preferences\n")
            for mem in memories_by_type["user_preference"]:
                content_parts.append(f"- **{mem.get('memory_key', '')}**: {mem.get('memory_value', '')}\n")
            content_parts.append("\n")
        
        # Add project facts
        if "project_fact" in memories_by_type:
            content_parts.append("## Project Facts\n")
            for mem in memories_by_type["project_fact"]:
                content_parts.append(f"- **{mem.get('memory_key', '')}**: {mem.get('memory_value', '')}\n")
            content_parts.append("\n")
        
        # Add skills/capabilities
        if "skill" in memories_by_type:
            content_parts.append("## Known Skills\n")
            for mem in memories_by_type["skill"]:
                content_parts.append(f"- {mem.get('memory_value', '')}\n")
            content_parts.append("\n")
        
        # Add rules
        if "rule" in memories_by_type:
            content_parts.append("## Rules\n")
            for mem in memories_by_type["rule"]:
                content_parts.append(f"- {mem.get('memory_value', '')}\n")
            content_parts.append("\n")
        
        # Add episodic summaries
        if episodic_summaries:
            content_parts.append("## Recent Context\n")
            for summary in episodic_summaries[:5]:  # Limit to 5
                content_parts.append(f"- {summary}\n")
        
        skill = Skill(
            name="smartspec-context",
            description="SmartSpec learned context and memories. Use when working on this project to understand user preferences and project requirements.",
            content="".join(content_parts),
            scope=SkillScope.PROJECT,
            mode=SkillMode.GENERIC,
        )
        
        return self.create_skill(workspace, skill, formats)
    
    def setup_project_skills(
        self,
        workspace: str,
        templates: Optional[List[str]] = None,
        formats: Optional[List[SkillFormat]] = None,
    ) -> Dict[str, Dict[SkillFormat, Path]]:
        """
        Set up default skills for a project.
        
        Args:
            workspace: Workspace directory
            templates: Optional list of template names to inject
            formats: Target formats
        
        Returns:
            Dict of template name to format paths
        """
        from app.services.kilo_skill_manager import SKILL_TEMPLATES
        
        if templates is None:
            templates = ["project_conventions", "error_handling"]
        
        results = {}
        
        for template_name in templates:
            if template_name in SKILL_TEMPLATES:
                paths = self.inject_skill_from_template(
                    workspace, template_name, formats=formats
                )
                results[template_name] = paths
        
        logger.info(
            "Project skills setup complete",
            workspace=workspace,
            templates=templates,
        )
        
        return results


# ==================== CONVERTER SCRIPT ====================

class SkillConverter:
    """
    Converts and syncs skills between Kilo Code and Claude Code formats.
    """
    
    def __init__(self, skill_manager: Optional[KiloSkillManager] = None):
        """
        Initialize the converter.
        
        Args:
            skill_manager: Optional skill manager instance
        """
        self.manager = skill_manager or KiloSkillManager()
    
    def convert_file(
        self,
        source_path: str,
        target_path: str,
        source_format: SkillFormat,
        target_format: SkillFormat,
    ) -> bool:
        """
        Convert a single SKILL.md file.
        
        Args:
            source_path: Path to source SKILL.md
            target_path: Path to target SKILL.md
            source_format: Source format
            target_format: Target format
        
        Returns:
            True if successful
        """
        try:
            source_file = Path(source_path)
            if not source_file.exists():
                logger.error("Source file not found", path=source_path)
                return False
            
            # Read and parse source
            content = source_file.read_text()
            skill_name = source_file.parent.name
            skill = Skill.from_skill_md(
                content, skill_name, SkillScope.PROJECT, SkillMode.GENERIC, source_format
            )
            
            # Convert to target format
            target_content = skill.to_skill_md(target_format)
            
            # Write target
            target_file = Path(target_path)
            target_file.parent.mkdir(parents=True, exist_ok=True)
            target_file.write_text(target_content)
            
            logger.info(
                "Skill converted",
                source=source_path,
                target=target_path,
            )
            return True
            
        except Exception as e:
            logger.error("Conversion failed", error=str(e))
            return False
    
    def sync_directory(
        self,
        workspace: str,
        source_format: SkillFormat = SkillFormat.KILO,
        bidirectional: bool = False,
    ) -> Dict[str, bool]:
        """
        Sync all skills in a workspace directory.
        
        Args:
            workspace: Workspace directory
            source_format: Primary source format
            bidirectional: Sync in both directions
        
        Returns:
            Dict of skill name to sync success
        """
        results = {}
        
        # Get source and target directories
        if source_format == SkillFormat.KILO:
            source_dir = Path(workspace) / SkillPaths.KILO_DIR / SkillPaths.SKILLS_SUBDIR
            target_dir = Path(workspace) / SkillPaths.CLAUDE_DIR / SkillPaths.SKILLS_SUBDIR
            target_format = SkillFormat.CLAUDE
        else:
            source_dir = Path(workspace) / SkillPaths.CLAUDE_DIR / SkillPaths.SKILLS_SUBDIR
            target_dir = Path(workspace) / SkillPaths.KILO_DIR / SkillPaths.SKILLS_SUBDIR
            target_format = SkillFormat.KILO
        
        # Sync from source to target
        if source_dir.exists():
            for skill_dir in source_dir.iterdir():
                if skill_dir.is_dir():
                    source_file = skill_dir / "SKILL.md"
                    if source_file.exists():
                        target_file = target_dir / skill_dir.name / "SKILL.md"
                        success = self.convert_file(
                            str(source_file),
                            str(target_file),
                            source_format,
                            target_format,
                        )
                        results[skill_dir.name] = success
        
        # Bidirectional sync
        if bidirectional and target_dir.exists():
            for skill_dir in target_dir.iterdir():
                if skill_dir.is_dir() and skill_dir.name not in results:
                    target_file = skill_dir / "SKILL.md"
                    if target_file.exists():
                        source_file = source_dir / skill_dir.name / "SKILL.md"
                        success = self.convert_file(
                            str(target_file),
                            str(source_file),
                            target_format,
                            source_format,
                        )
                        results[skill_dir.name] = success
        
        logger.info(
            "Directory sync complete",
            workspace=workspace,
            synced=len([r for r in results.values() if r]),
            failed=len([r for r in results.values() if not r]),
        )
        
        return results
    
    def watch_and_sync(
        self,
        workspace: str,
        interval_seconds: int = 5,
    ):
        """
        Watch for changes and sync automatically.
        
        Note: This is a placeholder for file watching functionality.
        In production, use watchdog or similar library.
        
        Args:
            workspace: Workspace directory
            interval_seconds: Check interval
        """
        import time
        
        logger.info(
            "Starting skill sync watcher",
            workspace=workspace,
            interval=interval_seconds,
        )
        
        last_sync = {}
        
        while True:
            try:
                # Check for changes and sync
                results = self.sync_directory(workspace, bidirectional=True)
                
                # Log changes
                for name, success in results.items():
                    if name not in last_sync or last_sync[name] != success:
                        logger.info(
                            "Skill synced",
                            name=name,
                            success=success,
                        )
                
                last_sync = results
                time.sleep(interval_seconds)
                
            except KeyboardInterrupt:
                logger.info("Sync watcher stopped")
                break
            except Exception as e:
                logger.error("Sync error", error=str(e))
                time.sleep(interval_seconds)


# ==================== CLI INTERFACE ====================

def main():
    """CLI interface for skill conversion."""
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Convert and sync skills between Kilo Code and Claude Code"
    )
    
    subparsers = parser.add_subparsers(dest="command", help="Commands")
    
    # Convert command
    convert_parser = subparsers.add_parser("convert", help="Convert a single skill file")
    convert_parser.add_argument("source", help="Source SKILL.md path")
    convert_parser.add_argument("target", help="Target SKILL.md path")
    convert_parser.add_argument(
        "--from", dest="source_format", choices=["kilo", "claude"],
        default="kilo", help="Source format"
    )
    convert_parser.add_argument(
        "--to", dest="target_format", choices=["kilo", "claude"],
        default="claude", help="Target format"
    )
    
    # Sync command
    sync_parser = subparsers.add_parser("sync", help="Sync skills in a workspace")
    sync_parser.add_argument("workspace", help="Workspace directory")
    sync_parser.add_argument(
        "--from", dest="source_format", choices=["kilo", "claude"],
        default="kilo", help="Primary source format"
    )
    sync_parser.add_argument(
        "--bidirectional", "-b", action="store_true",
        help="Sync in both directions"
    )
    
    # Watch command
    watch_parser = subparsers.add_parser("watch", help="Watch and sync automatically")
    watch_parser.add_argument("workspace", help="Workspace directory")
    watch_parser.add_argument(
        "--interval", "-i", type=int, default=5,
        help="Check interval in seconds"
    )
    
    args = parser.parse_args()
    
    converter = SkillConverter()
    
    if args.command == "convert":
        source_fmt = SkillFormat.KILO if args.source_format == "kilo" else SkillFormat.CLAUDE
        target_fmt = SkillFormat.KILO if args.target_format == "kilo" else SkillFormat.CLAUDE
        
        success = converter.convert_file(
            args.source, args.target, source_fmt, target_fmt
        )
        exit(0 if success else 1)
    
    elif args.command == "sync":
        source_fmt = SkillFormat.KILO if args.source_format == "kilo" else SkillFormat.CLAUDE
        
        results = converter.sync_directory(
            args.workspace, source_fmt, args.bidirectional
        )
        
        print(f"Synced {len([r for r in results.values() if r])} skills")
        exit(0)
    
    elif args.command == "watch":
        converter.watch_and_sync(args.workspace, args.interval)
    
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
