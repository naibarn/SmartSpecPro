#!/usr/bin/env python3
"""
SmartSpec Pro - Skill Converter CLI

Converts and syncs skills between Kilo Code and Claude Code formats.

Usage:
    # Convert a single file
    python skill_converter.py convert source.md target.md --from kilo --to claude
    
    # Sync all skills in a workspace
    python skill_converter.py sync /path/to/workspace --from kilo --bidirectional
    
    # Watch and auto-sync
    python skill_converter.py watch /path/to/workspace --interval 5
"""

import argparse
import os
import shutil
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    import yaml
except ImportError:
    print("Error: PyYAML is required. Install with: pip install pyyaml")
    sys.exit(1)


# ==================== ENUMS ====================

class SkillFormat(str, Enum):
    KILO = "kilo"
    CLAUDE = "claude"
    UNIVERSAL = "universal"


class SkillScope(str, Enum):
    GLOBAL = "global"
    PROJECT = "project"
    USER = "user"


class SkillMode(str, Enum):
    GENERIC = "generic"
    CODE = "code"
    ARCHITECT = "architect"
    DEBUG = "debug"
    ASK = "ask"


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
    source_format: SkillFormat = SkillFormat.UNIVERSAL
    
    def to_skill_md(self, format: SkillFormat = SkillFormat.UNIVERSAL) -> str:
        """Convert to SKILL.md format."""
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
        source_format: SkillFormat = SkillFormat.UNIVERSAL,
    ) -> "Skill":
        """Parse a SKILL.md file."""
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
            version=frontmatter.get("version", "1.0.0"),
            author=frontmatter.get("author"),
            tags=frontmatter.get("tags", []),
            allowed_tools=frontmatter.get("allowed-tools", []),
            model=frontmatter.get("model"),
            source_format=source_format,
        )


# ==================== PATH CONFIGURATION ====================

class SkillPaths:
    """Manages skill directory paths."""
    
    KILO_DIR = ".kilocode"
    CLAUDE_DIR = ".claude"
    SKILLS_SUBDIR = "skills"
    
    KILO_GLOBAL = os.path.expanduser("~/.kilocode/skills")
    CLAUDE_GLOBAL = os.path.expanduser("~/.claude/skills")
    
    @classmethod
    def get_project_paths(cls, workspace: str) -> Dict[SkillFormat, Path]:
        return {
            SkillFormat.KILO: Path(workspace) / cls.KILO_DIR / cls.SKILLS_SUBDIR,
            SkillFormat.CLAUDE: Path(workspace) / cls.CLAUDE_DIR / cls.SKILLS_SUBDIR,
        }
    
    @classmethod
    def get_global_paths(cls) -> Dict[SkillFormat, Path]:
        return {
            SkillFormat.KILO: Path(cls.KILO_GLOBAL),
            SkillFormat.CLAUDE: Path(cls.CLAUDE_GLOBAL),
        }


# ==================== CONVERTER ====================

class SkillConverter:
    """Converts and syncs skills between formats."""
    
    def __init__(self, verbose: bool = False):
        self.verbose = verbose
    
    def log(self, message: str):
        if self.verbose:
            print(f"[INFO] {message}")
    
    def convert_file(
        self,
        source_path: str,
        target_path: str,
        source_format: SkillFormat,
        target_format: SkillFormat,
    ) -> bool:
        """Convert a single SKILL.md file."""
        try:
            source_file = Path(source_path)
            if not source_file.exists():
                print(f"[ERROR] Source file not found: {source_path}")
                return False
            
            # Read and parse source
            content = source_file.read_text()
            skill_name = source_file.parent.name
            skill = Skill.from_skill_md(content, skill_name, source_format)
            
            # Convert to target format
            target_content = skill.to_skill_md(target_format)
            
            # Write target
            target_file = Path(target_path)
            target_file.parent.mkdir(parents=True, exist_ok=True)
            target_file.write_text(target_content)
            
            self.log(f"Converted: {source_path} -> {target_path}")
            return True
            
        except Exception as e:
            print(f"[ERROR] Conversion failed: {e}")
            return False
    
    def sync_directory(
        self,
        workspace: str,
        source_format: SkillFormat = SkillFormat.KILO,
        bidirectional: bool = False,
    ) -> Dict[str, bool]:
        """Sync all skills in a workspace directory."""
        results = {}
        
        paths = SkillPaths.get_project_paths(workspace)
        
        # Get source and target directories
        if source_format == SkillFormat.KILO:
            source_dir = paths[SkillFormat.KILO]
            target_dir = paths[SkillFormat.CLAUDE]
            target_format = SkillFormat.CLAUDE
        else:
            source_dir = paths[SkillFormat.CLAUDE]
            target_dir = paths[SkillFormat.KILO]
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
        
        return results
    
    def sync_global(
        self,
        source_format: SkillFormat = SkillFormat.KILO,
        bidirectional: bool = False,
    ) -> Dict[str, bool]:
        """Sync global skills."""
        results = {}
        
        paths = SkillPaths.get_global_paths()
        
        if source_format == SkillFormat.KILO:
            source_dir = paths[SkillFormat.KILO]
            target_dir = paths[SkillFormat.CLAUDE]
            target_format = SkillFormat.CLAUDE
        else:
            source_dir = paths[SkillFormat.CLAUDE]
            target_dir = paths[SkillFormat.KILO]
            target_format = SkillFormat.KILO
        
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
        
        return results
    
    def watch_and_sync(
        self,
        workspace: str,
        interval_seconds: int = 5,
        bidirectional: bool = True,
    ):
        """Watch for changes and sync automatically."""
        print(f"[INFO] Watching {workspace} for skill changes...")
        print(f"[INFO] Press Ctrl+C to stop")
        
        last_mtimes: Dict[str, float] = {}
        
        while True:
            try:
                paths = SkillPaths.get_project_paths(workspace)
                current_mtimes: Dict[str, float] = {}
                
                # Check all skill files
                for fmt, base_dir in paths.items():
                    if base_dir.exists():
                        for skill_dir in base_dir.iterdir():
                            if skill_dir.is_dir():
                                skill_file = skill_dir / "SKILL.md"
                                if skill_file.exists():
                                    key = str(skill_file)
                                    mtime = skill_file.stat().st_mtime
                                    current_mtimes[key] = mtime
                                    
                                    # Check if file changed
                                    if key in last_mtimes and last_mtimes[key] != mtime:
                                        print(f"[CHANGE] {skill_file}")
                                        self.sync_directory(workspace, bidirectional=bidirectional)
                                        break
                
                last_mtimes = current_mtimes
                time.sleep(interval_seconds)
                
            except KeyboardInterrupt:
                print("\n[INFO] Stopped watching")
                break
            except Exception as e:
                print(f"[ERROR] {e}")
                time.sleep(interval_seconds)
    
    def list_skills(self, workspace: str) -> None:
        """List all skills in a workspace."""
        paths = SkillPaths.get_project_paths(workspace)
        
        print(f"\n{'='*60}")
        print(f"Skills in: {workspace}")
        print(f"{'='*60}")
        
        for fmt, base_dir in paths.items():
            print(f"\n[{fmt.value.upper()}] {base_dir}")
            
            if not base_dir.exists():
                print("  (directory does not exist)")
                continue
            
            skills_found = False
            for skill_dir in sorted(base_dir.iterdir()):
                if skill_dir.is_dir():
                    skill_file = skill_dir / "SKILL.md"
                    if skill_file.exists():
                        skills_found = True
                        content = skill_file.read_text()
                        skill = Skill.from_skill_md(content, skill_dir.name, fmt)
                        print(f"  • {skill.name}: {skill.description[:50]}...")
            
            if not skills_found:
                print("  (no skills found)")
        
        print()
    
    def diff_skills(self, workspace: str) -> None:
        """Show differences between Kilo and Claude skill directories."""
        paths = SkillPaths.get_project_paths(workspace)
        
        kilo_skills = set()
        claude_skills = set()
        
        if paths[SkillFormat.KILO].exists():
            for skill_dir in paths[SkillFormat.KILO].iterdir():
                if skill_dir.is_dir() and (skill_dir / "SKILL.md").exists():
                    kilo_skills.add(skill_dir.name)
        
        if paths[SkillFormat.CLAUDE].exists():
            for skill_dir in paths[SkillFormat.CLAUDE].iterdir():
                if skill_dir.is_dir() and (skill_dir / "SKILL.md").exists():
                    claude_skills.add(skill_dir.name)
        
        only_kilo = kilo_skills - claude_skills
        only_claude = claude_skills - kilo_skills
        both = kilo_skills & claude_skills
        
        print(f"\n{'='*60}")
        print(f"Skill Diff: {workspace}")
        print(f"{'='*60}")
        
        if both:
            print(f"\n[SYNCED] In both directories ({len(both)}):")
            for name in sorted(both):
                print(f"  ✓ {name}")
        
        if only_kilo:
            print(f"\n[KILO ONLY] Need to sync to Claude ({len(only_kilo)}):")
            for name in sorted(only_kilo):
                print(f"  → {name}")
        
        if only_claude:
            print(f"\n[CLAUDE ONLY] Need to sync to Kilo ({len(only_claude)}):")
            for name in sorted(only_claude):
                print(f"  ← {name}")
        
        if not only_kilo and not only_claude:
            print("\n✓ All skills are synced!")
        
        print()


# ==================== CLI ====================

def main():
    parser = argparse.ArgumentParser(
        description="Convert and sync skills between Kilo Code and Claude Code",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Convert a single skill file
  %(prog)s convert ./skill/SKILL.md ./output/SKILL.md --from kilo --to claude
  
  # Sync all skills in a project (Kilo -> Claude)
  %(prog)s sync /path/to/project --from kilo
  
  # Bidirectional sync
  %(prog)s sync /path/to/project --bidirectional
  
  # Sync global skills
  %(prog)s sync-global --from kilo --bidirectional
  
  # Watch for changes and auto-sync
  %(prog)s watch /path/to/project --interval 5
  
  # List all skills
  %(prog)s list /path/to/project
  
  # Show diff between directories
  %(prog)s diff /path/to/project
"""
    )
    
    parser.add_argument("-v", "--verbose", action="store_true", help="Verbose output")
    
    subparsers = parser.add_subparsers(dest="command", help="Commands")
    
    # Convert command
    convert_parser = subparsers.add_parser("convert", help="Convert a single skill file")
    convert_parser.add_argument("source", help="Source SKILL.md path")
    convert_parser.add_argument("target", help="Target SKILL.md path")
    convert_parser.add_argument(
        "--from", dest="source_format", choices=["kilo", "claude"],
        default="kilo", help="Source format (default: kilo)"
    )
    convert_parser.add_argument(
        "--to", dest="target_format", choices=["kilo", "claude"],
        default="claude", help="Target format (default: claude)"
    )
    
    # Sync command
    sync_parser = subparsers.add_parser("sync", help="Sync skills in a workspace")
    sync_parser.add_argument("workspace", help="Workspace directory")
    sync_parser.add_argument(
        "--from", dest="source_format", choices=["kilo", "claude"],
        default="kilo", help="Primary source format (default: kilo)"
    )
    sync_parser.add_argument(
        "-b", "--bidirectional", action="store_true",
        help="Sync in both directions"
    )
    
    # Sync global command
    sync_global_parser = subparsers.add_parser("sync-global", help="Sync global skills")
    sync_global_parser.add_argument(
        "--from", dest="source_format", choices=["kilo", "claude"],
        default="kilo", help="Primary source format (default: kilo)"
    )
    sync_global_parser.add_argument(
        "-b", "--bidirectional", action="store_true",
        help="Sync in both directions"
    )
    
    # Watch command
    watch_parser = subparsers.add_parser("watch", help="Watch and sync automatically")
    watch_parser.add_argument("workspace", help="Workspace directory")
    watch_parser.add_argument(
        "-i", "--interval", type=int, default=5,
        help="Check interval in seconds (default: 5)"
    )
    watch_parser.add_argument(
        "-b", "--bidirectional", action="store_true", default=True,
        help="Sync in both directions (default: true)"
    )
    
    # List command
    list_parser = subparsers.add_parser("list", help="List all skills")
    list_parser.add_argument("workspace", help="Workspace directory")
    
    # Diff command
    diff_parser = subparsers.add_parser("diff", help="Show skill differences")
    diff_parser.add_argument("workspace", help="Workspace directory")
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        sys.exit(0)
    
    converter = SkillConverter(verbose=args.verbose)
    
    if args.command == "convert":
        source_fmt = SkillFormat.KILO if args.source_format == "kilo" else SkillFormat.CLAUDE
        target_fmt = SkillFormat.KILO if args.target_format == "kilo" else SkillFormat.CLAUDE
        
        success = converter.convert_file(
            args.source, args.target, source_fmt, target_fmt
        )
        
        if success:
            print(f"✓ Converted: {args.source} -> {args.target}")
        sys.exit(0 if success else 1)
    
    elif args.command == "sync":
        source_fmt = SkillFormat.KILO if args.source_format == "kilo" else SkillFormat.CLAUDE
        
        results = converter.sync_directory(
            args.workspace, source_fmt, args.bidirectional
        )
        
        synced = len([r for r in results.values() if r])
        failed = len([r for r in results.values() if not r])
        
        print(f"✓ Synced {synced} skills" + (f", {failed} failed" if failed else ""))
        sys.exit(0 if failed == 0 else 1)
    
    elif args.command == "sync-global":
        source_fmt = SkillFormat.KILO if args.source_format == "kilo" else SkillFormat.CLAUDE
        
        results = converter.sync_global(source_fmt, args.bidirectional)
        
        synced = len([r for r in results.values() if r])
        failed = len([r for r in results.values() if not r])
        
        print(f"✓ Synced {synced} global skills" + (f", {failed} failed" if failed else ""))
        sys.exit(0 if failed == 0 else 1)
    
    elif args.command == "watch":
        converter.watch_and_sync(args.workspace, args.interval, args.bidirectional)
    
    elif args.command == "list":
        converter.list_skills(args.workspace)
    
    elif args.command == "diff":
        converter.diff_skills(args.workspace)


if __name__ == "__main__":
    main()
