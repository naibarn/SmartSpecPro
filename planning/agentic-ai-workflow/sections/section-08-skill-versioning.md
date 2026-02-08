# Section 08: Skill Versioning & Forking

**Phase**: 2 - Skill Marketplace
**Estimated Time**: 3-4 days
**Priority**: Medium
**Dependencies**: Sections 06, 07

---

## Overview

Implement semantic versioning for skills and auto-upgrade on workflow resume.

---

## Goals

- ✅ Semantic versioning (MAJOR.MINOR.PATCH)
- ✅ Auto-upgrade paused workflows to latest version
- ✅ Changelog display on upgrade
- ✅ Breaking change detection + user confirmation
- ✅ Rollback support

---

## Implementation

**Database**:
- Store all versions in `workflow_templates` table
- `workflow_executions` references specific `skill_version_id`

**Logic**:
```python
async def resume_workflow(execution_id: str):
    execution = get_execution(execution_id)
    current_version = execution.skill_version

    # Get latest version
    latest_version = get_latest_skill_version(execution.template_id)

    if latest_version > current_version:
        # Show changelog, prompt user
        if has_breaking_changes(latest_version):
            confirm = await prompt_user_upgrade(execution_id, latest_version)
            if not confirm:
                return  # Stay on old version

        # Upgrade
        execution.skill_version_id = latest_version.id

    # Resume execution
```

---

## Completion Checklist

- [ ] Versioning logic implemented
- [ ] Auto-upgrade on resume works
- [ ] Changelog display implemented
- [ ] Tests pass

**Estimated Completion**: 3-4 days
