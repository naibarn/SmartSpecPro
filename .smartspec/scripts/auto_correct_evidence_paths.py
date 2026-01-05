#!/usr/bin/env python3
"""
Auto-Correct Evidence Paths in tasks.md

This script automatically corrects evidence paths in tasks.md files
to follow the naming convention standard.

Usage:
    python3 auto_correct_evidence_paths.py <tasks_md_path> [--dry-run] [--report-dir <dir>]

Examples:
    # Correct evidence paths in tasks.md
    python3 auto_correct_evidence_paths.py specs/core/spec-core-001-authentication/tasks.md
    
    # Dry run (show what would be corrected)
    python3 auto_correct_evidence_paths.py specs/core/spec-core-001-authentication/tasks.md --dry-run
    
    # Save correction report
    python3 auto_correct_evidence_paths.py specs/core/spec-core-001-authentication/tasks.md \\
        --report-dir .spec/reports/corrections
"""

import sys
import re
import argparse
from pathlib import Path
from typing import List, Dict, Tuple
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from naming_convention_helper import (
    load_naming_standard,
    auto_correct_paths_batch,
)


def extract_evidence_paths(tasks_md_content: str) -> List[Tuple[int, str]]:
    """
    Extract all evidence paths from tasks.md content.
    
    Returns:
        List of (line_number, path) tuples
    """
    evidence_paths = []
    lines = tasks_md_content.split('\n')
    
    for i, line in enumerate(lines, 1):
        # Match evidence lines: - 📄 `path/to/file.ts`
        match = re.match(r'^\s*-\s*📄\s*`([^`]+)`', line)
        if match:
            path = match.group(1)
            evidence_paths.append((i, path))
    
    return evidence_paths


def apply_corrections(
    tasks_md_content: str,
    corrections: List[Dict]
) -> Tuple[str, int]:
    """
    Apply corrections to tasks.md content.
    
    Returns:
        Tuple of (corrected_content, num_corrections_applied)
    """
    lines = tasks_md_content.split('\n')
    num_applied = 0
    
    # Build correction map
    correction_map = {
        c['original']: c['corrected']
        for c in corrections
    }
    
    # Apply corrections line by line
    for i, line in enumerate(lines):
        match = re.match(r'^(\s*-\s*📄\s*)`([^`]+)`(.*)$', line)
        if match:
            prefix = match.group(1)
            path = match.group(2)
            suffix = match.group(3)
            
            if path in correction_map:
                corrected_path = correction_map[path]
                lines[i] = f"{prefix}`{corrected_path}`{suffix}"
                num_applied += 1
    
    return '\n'.join(lines), num_applied


def format_correction_report(
    corrections: List[Dict],
    statistics: Dict,
    tasks_md_path: str
) -> str:
    """Format correction report as markdown."""
    
    report = f"""# Evidence Path Auto-Correction Report

**Generated:** {datetime.now().isoformat()}
**Tasks File:** {tasks_md_path}
**Script:** auto_correct_evidence_paths.py

## Summary

- **Total Evidence Paths:** {statistics['total']}
- **Corrected:** {statistics['corrected']}
- **Unchanged:** {statistics['unchanged']}
- **Compliance Rate:** {statistics['compliance_rate'] * 100:.1f}%

"""
    
    if corrections:
        report += "## Corrections Applied\n\n"
        
        for i, correction in enumerate(corrections, 1):
            report += f"### {i}. {Path(correction['original']).name}\n\n"
            report += f"**Original:**\n```\n{correction['original']}\n```\n\n"
            report += f"**Corrected:**\n```\n{correction['corrected']}\n```\n\n"
            report += "**Changes:**\n"
            for change in correction['changes']:
                report += f"- {change}\n"
            report += "\n"
    else:
        report += "## ✅ No Corrections Needed\n\n"
        report += "All evidence paths already follow the naming convention standard.\n\n"
    
    return report


def main():
    parser = argparse.ArgumentParser(
        description='Auto-correct evidence paths in tasks.md files'
    )
    parser.add_argument(
        'tasks_md',
        help='Path to tasks.md file'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Show what would be corrected without making changes'
    )
    parser.add_argument(
        '--report-dir',
        help='Directory to save correction report'
    )
    
    args = parser.parse_args()
    
    # Validate inputs
    tasks_md_path = Path(args.tasks_md)
    if not tasks_md_path.exists():
        print(f"❌ Error: {tasks_md_path} not found", file=sys.stderr)
        sys.exit(1)
    
    # Load tasks.md
    print(f"📖 Reading {tasks_md_path}...")
    tasks_md_content = tasks_md_path.read_text()
    
    # Extract evidence paths
    print("🔍 Extracting evidence paths...")
    evidence_paths = extract_evidence_paths(tasks_md_content)
    print(f"   Found {len(evidence_paths)} evidence paths")
    
    if not evidence_paths:
        print("✅ No evidence paths found")
        sys.exit(0)
    
    # Load naming standard
    print("📋 Loading naming convention standard...")
    repo_root = Path.cwd()
    naming_standard = load_naming_standard(repo_root)
    
    # Auto-correct paths
    print("🔧 Auto-correcting paths...")
    paths_only = [path for _, path in evidence_paths]
    result = auto_correct_paths_batch(paths_only, naming_standard)
    
    corrections = result['corrections']
    statistics = result['statistics']
    
    # Print summary
    print(f"\n📊 Summary:")
    print(f"   Total: {statistics['total']}")
    print(f"   Corrected: {statistics['corrected']}")
    print(f"   Unchanged: {statistics['unchanged']}")
    print(f"   Compliance Rate: {statistics['compliance_rate'] * 100:.1f}%")
    
    if corrections:
        print(f"\n✏️  Corrections to apply:")
        for correction in corrections:
            print(f"   {correction['original']}")
            print(f"   → {correction['corrected']}")
            for change in correction['changes']:
                print(f"     • {change}")
            print()
    else:
        print("\n✅ All evidence paths already compliant!")
    
    # Generate report
    report = format_correction_report(
        corrections,
        statistics,
        str(tasks_md_path)
    )
    
    # Save report if requested
    if args.report_dir:
        report_dir = Path(args.report_dir)
        report_dir.mkdir(parents=True, exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        report_file = report_dir / f"evidence-corrections-{timestamp}.md"
        
        print(f"\n📄 Saving report to {report_file}...")
        report_file.write_text(report)
        print(f"   ✅ Report saved")
    
    # Apply corrections (unless dry-run)
    if args.dry_run:
        print("\n🔍 Dry run - no changes made")
        print("   Remove --dry-run to apply corrections")
    else:
        if corrections:
            print(f"\n✏️  Applying corrections to {tasks_md_path}...")
            corrected_content, num_applied = apply_corrections(
                tasks_md_content,
                corrections
            )
            
            # Backup original
            backup_path = tasks_md_path.with_suffix('.md.backup')
            print(f"   💾 Backing up to {backup_path}...")
            tasks_md_path.rename(backup_path)
            
            # Write corrected version
            tasks_md_path.write_text(corrected_content)
            print(f"   ✅ Applied {num_applied} corrections")
            print(f"   ✅ Original backed up to {backup_path}")
        else:
            print("\n✅ No corrections needed")
    
    print("\n🎉 Done!")
    
    # Exit with appropriate code
    if corrections and args.dry_run:
        sys.exit(1)  # Indicate corrections are needed
    else:
        sys.exit(0)


if __name__ == '__main__':
    main()
