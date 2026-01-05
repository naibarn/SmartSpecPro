---
description: Refine spec.md (SPEC-first) with 100% duplication prevention and reuse-first
  governance.
version: 7.3.0
workflow: /smartspec_generate_spec
category: core
---

# smartspec_generate_spec

> **Canonical path:** `.smartspec/workflows/smartspec_generate_spec.md`  
> **Version:** 7.3.0  
> **Status:** Production Ready  
> **Category:** core

## Purpose

Create or refine a `spec.md` with **100% duplication prevention** and **reuse-first** governance.

This workflow is the canonical entry point for:

- **preventing duplicate components** before they are created
- enforcing spec completeness (UX/UI baseline + NFRs)
- enforcing reuse-first behavior (avoid duplicates)
- producing an auditable preview + diff before any governed writes
- **populating all component registries** (`.spec/registry/**`)

It is **safe-by-default** and writes governed artifacts only when explicitly applied.

---

## File Locations (Important for AI Agents)

**All SmartSpec configuration and registry files are located in the `.spec/` folder:**

- **Config:** `.spec/smartspec.config.yaml`
- **Spec Index:** `.spec/SPEC_INDEX.json`
- **Registry:** `.spec/registry/` (component registry, reuse index)
- **Reports:** `.spec/reports/` (workflow outputs, previews, diffs)
- **Scripts:** `.smartspec/scripts/` (automation scripts)

**When searching for these files, ALWAYS use the `.spec/` prefix from project root.**

---

## Governance contract

This workflow MUST follow:

- `knowledge_base_smartspec_handbook.md` (v6)
- `.spec/smartspec.config.yaml`

### Write scopes (enforced)

Allowed writes:

- Governed specs: `specs/**` (**requires** `--apply`)
- Governed registry: `.spec/SPEC_INDEX.json` (**requires** `--apply` and allowlisted)
- **Component registry:** `.spec/registry/**` (**requires** `--apply`)
- Safe outputs (previews/reports): `.spec/reports/generate-spec/**` (no `--apply` required)

Forbidden writes (must hard-fail):

- Any path outside config `safety.allow_writes_only_under`
- Any path under config `safety.deny_writes_under` (excluding `.spec/registry/**`)
- Any runtime source tree modifications

### `--apply` behavior

- Without `--apply`:
  - MUST NOT create/modify `specs/**`, `.spec/SPEC_INDEX.json`, or `.spec/registry/**`.
  - MUST write a deterministic preview bundle to `.spec/reports/`.

- With `--apply`:
  - MAY update target `spec.md` and required companion reference files.
  - MAY update `.spec/SPEC_INDEX.json` **only if** allowlisted.
  - MAY update `.spec/registry/**` files.

---

## Flags

### Universal flags (must support)

All SmartSpec workflows support these universal flags:

| Flag | Required | Description |
|---|---|---|
| `--config` | No | Path to custom config file (default: `.spec/smartspec.config.yaml`) |
| `--lang` | No | Output language (`th` for Thai, `en` for English, `auto` for automatic detection) |
| `--platform` | No | Platform mode (`cli` for CLI, `kilo` for Kilo Code, `ci` for CI/CD, `other` for custom integrations) |
| `--out` | No | Base output directory for reports and generated files (must pass safety checks) |
| `--json` | No | Output results in JSON format for machine parsing and automation |
| `--quiet` | No | Suppress non-essential output, showing only errors and critical information |

### Workflow-specific flags

Flags specific to `/smartspec_generate_spec`:

| Flag | Required | Description |
|---|---|---|
| `--spec` | Yes (positional) | Path to the spec file to create or refine (e.g., `specs/feature/spec-001/spec.md`) |
| `--apply` | No | Enable writes to governed artifacts (spec.md, SPEC_INDEX.json, registry files) |
| `--validate-only` | No | Run validation and preview without writing any files |
| `--skip-duplication-check` | No | Skip pre-generation duplication validation (not recommended) |
| `--registry-roots` | No | Additional registry directories to check for duplicates (comma-separated) |

### Flag usage notes

- **Config-first approach:** Prefer setting defaults in `.spec/smartspec.config.yaml` to minimize command-line flags
- **Positional arguments:** Use positional argument for spec path: `/smartspec_generate_spec specs/feature/spec-001/spec.md`
- **Boolean flags:** Flags without values are boolean (presence = true, absence = false)
- **Path safety:** All path arguments must pass safety validation (no directory traversal, symlink escape, or absolute paths outside project)
- **Secret handling:** Never pass secrets as flag values; use `env:VAR_NAME` references or config file
- **Preview-first:** Always run without `--apply` first to review changes
- **Duplication prevention:** Never use `--skip-duplication-check` unless explicitly instructed

---

## Behavior

### 0) Spec Discovery (MANDATORY - Run First - BLOCKING)

> **⚠️ CRITICAL:** This step is **BLOCKING**. The AI agent **MUST NOT** proceed to Step 1 until `spec-inventory.json` has been created and saved.

Before any validation or generation, the AI agent **MUST** scan the `specs/` folder to discover all existing and planned spec files. This prevents duplication and ensures the agent is aware of the overall spec structure.

**Purpose:**
- Identify all spec files and directories that already exist or are planned
- Understand the scope boundaries of each spec to avoid content overlap
- Prevent putting all details into the first spec when other specs are planned
- Enable the agent to create appropriate cross-references

**Discovery Command:**
```bash
# Scan specs folder for all spec files and directories
find specs -type d -name "SPEC-*" 2>/dev/null | sort
find specs -name "spec*.md" 2>/dev/null | sort
find specs -type d -mindepth 2 -maxdepth 3 2>/dev/null | sort
```

**Discovery Output:**
The agent **MUST** create a **Spec Inventory** file (`spec-inventory.json`) containing:

| Field | Description |
|---|---|
| `spec_id` | The spec identifier (e.g., `SPEC-001-PROJECT-OVERVIEW`) |
| `path` | Full path to the spec file or directory |
| `status` | `complete` (has content >500 chars), `placeholder` (empty/minimal), or `planned` (directory only) |
| `title` | Extracted title from spec.md frontmatter or directory name |
| `scope_hint` | Brief description of intended scope (from title or first paragraph) |

**Example Spec Inventory (spec-inventory.json):**
```json
{
  "discovery_timestamp": "2026-01-01T12:00:00Z",
  "current_spec": "SPEC-002-BACKEND-API",
  "total_specs_found": 8,
  "specs": [
    {
      "spec_id": "SPEC-001-PROJECT-OVERVIEW",
      "path": "specs/feature/SPEC-001-PROJECT-OVERVIEW/spec.md",
      "status": "complete",
      "title": "Project Overview",
      "scope_hint": "High-level architecture, vision, and cross-cutting concerns"
    },
    {
      "spec_id": "SPEC-002-BACKEND-API",
      "path": "specs/feature/SPEC-002-BACKEND-API/spec.md",
      "status": "placeholder",
      "title": "Backend API",
      "scope_hint": "API endpoints, data models, and backend services"
    },
    {
      "spec_id": "SPEC-003-AUTH-CREDITS",
      "path": "specs/feature/SPEC-003-AUTH-CREDITS/",
      "status": "planned",
      "title": "Authentication & Credits",
      "scope_hint": "Auth flows, credit system, and payment integration"
    }
  ],
  "scope_boundaries": {
    "SPEC-001": ["vision", "architecture", "cross-cutting concerns", "NFRs"],
    "SPEC-002": ["API endpoints", "data models", "backend services"],
    "SPEC-003": ["authentication", "authorization", "credits", "payments"],
    "SPEC-004": ["LLM gateway", "provider routing", "cost tracking"],
    "SPEC-005": ["web dashboard", "UI components", "frontend"],
    "SPEC-006": ["desktop app", "Tauri", "Kilo Code CLI"],
    "SPEC-007": ["orchestrator", "workflows", "LangGraph"],
    "SPEC-008": ["testing", "coverage", "quality assurance"]
  }
}
```

**Enforcement Rules (MUST FOLLOW):**

1. **MUST** create `spec-inventory.json` **BEFORE** proceeding to Step 1
2. **MUST** save `spec-inventory.json` to **TWO locations**:
   - `.spec/reports/generate-spec/<run-id>/spec-inventory.json` (per-run snapshot for audit trail)
   - `specs/spec-inventory.json` (global inventory for easy access)
3. **MUST** verify BOTH files exist before continuing
4. **MUST** include `scope_boundaries` to clarify what belongs in each spec
5. **MUST** set `current_spec` to the spec being generated

**Agent Behavior Rules (Content Scoping):**

1. **MUST** check `scope_boundaries` before adding any section to the spec
2. **MUST NOT** include detailed content that belongs to another spec (even if that spec is `planned` or `placeholder`)
3. **MUST** add cross-references using format: `→ See [SPEC-XXX](../SPEC-XXX/spec.md) for details`
4. **MUST** warn user if content appears to overlap with another spec's scope
5. **SHOULD** keep the current spec focused on its designated scope only

**Validation Check (Before Step 1):**
```
IF spec-inventory.json does NOT exist:
  → STOP and create it first
  → DO NOT proceed to Pre-Generation Validation

IF spec-inventory.json exists:
  → Read and parse it
  → Use scope_boundaries to guide content decisions
  → Proceed to Step 1
```

**Write Locations (Dual-Save):**

| Location | Purpose | When Updated |
|---|---|---|
| `.spec/reports/generate-spec/<run-id>/spec-inventory.json` | Per-run snapshot for audit trail and debugging | Every workflow run |
| `specs/spec-inventory.json` | Global inventory for easy access by AI agents and developers | Every workflow run (overwrites previous) |

**Why Two Locations?**
- **Per-run snapshot** preserves historical state for each workflow execution, useful for debugging and audit
- **Global inventory** provides a single source of truth that's always up-to-date and easy to find

---

### 1) Pre-Generation Validation (MANDATORY)

Before generating or refining a spec, the AI agent **MUST** check for potential duplicates.

**Validation Command:**
```bash
python3 .smartspec/scripts/detect_duplicates.py \
  --registry-dir .spec/registry/ \
  --threshold 0.8
```

**Validation Rules:**
- **Exit Code `0` (Success):** No duplicates found. The agent may proceed.
- **Exit Code `1` (Failure):** Potential duplicates found. The agent **MUST**:
  - Present the duplicates to the user.
  - Ask the user to:
    a) Reuse existing components
    b) Justify creating new components
    c) Cancel and review existing specs
  - **MUST NOT** proceed until the user confirms.

### 2) Refine Spec & Extract Registry Information (MANDATORY)

- Refine `spec.md` based on requirements.
- **Parse the refined spec.md** to extract:
  - API endpoints (method, path, description, status codes)
  - Data models (name, fields, description)
  - **UI components** (name, type, props, dependencies)
  - **Services** (name, responsibilities, dependencies)
  - **Workflows** (name, steps, description)
  - **Integrations** (name, type, provider)
  - Terminology (terms, definitions, categories)
  - Critical sections (sections marked as immutable)

### 3) Preview & Report (Always)

Write:

- `.spec/reports/generate-spec/<run-id>/spec-inventory.json` (per-run snapshot from Step 0)
- `specs/spec-inventory.json` (global inventory from Step 0)
- `.spec/reports/generate-spec/<run-id>/preview/spec.md`
- `.spec/reports/generate-spec/<run-id>/preview/registry/api-registry.json`
- `.spec/reports/generate-spec/<run-id>/preview/registry/data-model-registry.json`
- `.spec/reports/generate-spec/<run-id>/preview/registry/ui-components-registry.json`
- `.spec/reports/generate-spec/<run-id>/preview/registry/services-registry.json`
- `.spec/reports/generate-spec/<run-id>/preview/registry/workflows-registry.json`
- `.spec/reports/generate-spec/<run-id>/preview/registry/integrations-registry.json`
- `.spec/reports/generate-spec/<run-id>/preview/registry/glossary.json`
- `.spec/reports/generate-spec/<run-id>/preview/registry/critical-sections-registry.json`
- `.spec/reports/generate-spec/<run-id>/diff/spec.patch` (best-effort)
- `.spec/reports/generate-spec/<run-id>/report.md`
- `.spec/reports/generate-spec/<run-id>/summary.json` (if `--json`)

### 4) Post-Generation Validation (MANDATORY)

After generating the preview and before applying, the AI agent **MUST** validate the generated spec and registry files.

**Validation Command:**
```bash
python3 .smartspec/scripts/validate_spec_enhanced.py \
  --spec .spec/reports/generate-spec/<run-id>/preview/spec.md \
  --registry .spec/reports/generate-spec/<run-id>/preview/registry/ \
  --check-duplicates --threshold 0.8
```

**Validation Rules:**
- **Exit Code `0` (Success):** The spec and registry are valid. The agent may proceed with `--apply`.
- **Exit Code `1` (Failure):** The spec or registry is invalid. The agent **MUST NOT** use `--apply`.
- The full output from the validation script **MUST** be included in `report.md`.

### 5) Apply (only with `--apply` and if validation passes)

- Update `specs/<category>/<spec-id>/spec.md`.
- Update `.spec/SPEC_INDEX.json` (if allowlisted).
- Update all `.spec/registry/**` files.

---

## 11) Registry Generation (For AI Agent Implementation)

To ensure a complete and consistent component registry, the AI agent executing this workflow MUST use the following templates and logic when generating registry files.

### 11.1 Merge Logic

When updating registry files, the agent MUST:

1. **Load the existing registry file** from `.spec/registry/`.
2. **Load the new entries** extracted from the refined `spec.md`.
3. **Merge new entries** into the existing registry:
   - Add new items if they don't exist.
   - Update existing items if the `owner_spec` matches the current spec.
   - Preserve items owned by other specs.
   - Detect and report conflicts.
4. **Update `last_updated` and `specs_included`** fields.
5. **Write the merged content** to the preview directory.

### 11.2 `ui-components-registry.json` Template

```json
{
  "version": "1.0.0",
  "last_updated": "<ISO_DATETIME>",
  "source": "smartspec_generate_spec",
  "specs_included": ["<spec-id>", ...],
  "components": [
    {
      "name": "LoginForm",
      "type": "form",
      "description": "User login form with email and password",
      "owner_spec": "<spec-id>",
      "props": ["onSubmit", "loading", "error"],
      "dependencies": ["Button", "Input", "ErrorMessage"]
    }
  ]
}
```

### 11.3 `services-registry.json` Template

```json
{
  "version": "1.0.0",
  "last_updated": "<ISO_DATETIME>",
  "source": "smartspec_generate_spec",
  "specs_included": ["<spec-id>", ...],
  "services": [
    {
      "name": "AuthenticationService",
      "description": "Handles user authentication and session management",
      "owner_spec": "<spec-id>",
      "responsibilities": [
        "User login/logout",
        "Token generation/validation",
        "Session management"
      ],
      "dependencies": ["UserRepository", "TokenService"]
    }
  ]
}
```

### 11.4 `workflows-registry.json` Template

```json
{
  "version": "1.0.0",
  "last_updated": "<ISO_DATETIME>",
  "source": "smartspec_generate_spec",
  "specs_included": ["<spec-id>", ...],
  "workflows": [
    {
      "name": "User Registration Flow",
      "description": "End-to-end user registration process",
      "owner_spec": "<spec-id>",
      "steps": [
        "Enter email and password",
        "Verify email address",
        "Create user profile",
        "Send welcome email"
      ]
    }
  ]
}
```

### 11.5 `integrations-registry.json` Template

```json
{
  "version": "1.0.0",
  "last_updated": "<ISO_DATETIME>",
  "source": "smartspec_generate_spec",
  "specs_included": ["<spec-id>", ...],
  "integrations": [
    {
      "name": "Stripe Payment Gateway",
      "type": "payment",
      "provider": "Stripe",
      "description": "Integration with Stripe for payment processing",
      "owner_spec": "<spec-id>",
      "api_version": "2022-11-15"
    }
  ]
}
```
```

---

# End of workflow doc
