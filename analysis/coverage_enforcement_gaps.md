# SmartSpec Coverage Enforcement Gap Analysis

**Date:** 2026-01-02  
**Purpose:** ระบุ gaps ใน SmartSpec workflow สำหรับการบังคับ 80% coverage

## 1. Workflow ที่มีอยู่แล้ว

| Workflow | Purpose | Coverage Enforcement |
|----------|---------|---------------------|
| `smartspec_generate_tests` | สร้าง test plan จาก spec | ❌ ไม่มี coverage threshold |
| `smartspec_test_suite_runner` | รัน tests และสร้าง report | ❌ รายงานผลแต่ไม่บังคับ threshold |
| `smartspec_quality_gate` | Quality gate สำหรับ CI/release | ⚠️ มี checks แต่ไม่มี coverage check |
| `smartspec_implement_tasks` | Implement code จาก tasks | ❌ ไม่มี coverage validation |
| `smartspec_verify_tasks_progress_strict` | Verify task completion | ❌ ไม่ตรวจสอบ coverage |

## 2. Gaps ที่พบ

### Gap 1: ไม่มี Coverage Threshold Enforcement

**ปัญหา:** ไม่มี workflow ที่บังคับว่า code ใหม่ต้องมี coverage ≥ 80%

**ตำแหน่งที่ควรเพิ่ม:**
- `smartspec_quality_gate` - เพิ่ม check `QG-xxx Coverage Threshold`
- `smartspec_implement_tasks` - เพิ่ม post-implementation coverage check

### Gap 2: ไม่มี Coverage Delta Check

**ปัญหา:** ไม่มีการตรวจสอบว่า PR/commit ใหม่ทำให้ coverage ลดลงหรือไม่

**ตำแหน่งที่ควรเพิ่ม:**
- `smartspec_quality_gate --profile=ci` - เพิ่ม coverage delta check

### Gap 3: Test Generation ไม่ผูกกับ Coverage Target

**ปัญหา:** `smartspec_generate_tests` สร้าง test plan แต่ไม่ได้คำนวณว่าจะได้ coverage เท่าไหร่

**ตำแหน่งที่ควรเพิ่ม:**
- `smartspec_generate_tests` - เพิ่ม coverage estimation

### Gap 4: ไม่มี Config สำหรับ Coverage Threshold

**ปัญหา:** `smartspec.config.yaml` ไม่มี setting สำหรับ coverage threshold

**ตำแหน่งที่ควรเพิ่ม:**
```yaml
quality:
  coverage:
    minimum_threshold: 80
    new_code_threshold: 80
    allow_decrease: false
```

### Gap 5: ไม่มี Integration กับ pytest-cov

**ปัญหา:** Workflow ไม่ได้ integrate กับ Python coverage tools โดยตรง

**ตำแหน่งที่ควรเพิ่ม:**
- `smartspec_test_suite_runner` - เพิ่ม support สำหรับ pytest-cov

## 3. Workflow Chain ที่แนะนำ

### สำหรับ Feature ใหม่ (New Feature Development)

```
1. /smartspec_generate_spec
   ↓
2. /smartspec_generate_plan
   ↓
3. /smartspec_generate_tasks
   ↓
4. /smartspec_generate_tests  ← สร้าง test plan ก่อน implement
   ↓
5. /smartspec_implement_tasks  ← implement พร้อม tests
   ↓
6. /smartspec_test_suite_runner  ← รัน tests และวัด coverage
   ↓
7. /smartspec_quality_gate --profile=ci  ← ตรวจสอบ coverage threshold
   ↓
8. /smartspec_verify_tasks_progress_strict  ← verify completion
```

### Key Principle: Test-First Development

**ต้องสร้าง tests ก่อน implement code:**
1. `smartspec_generate_tests` สร้าง test plan
2. เขียน test cases ตาม test plan
3. Implement code ให้ tests ผ่าน
4. วัด coverage และปรับปรุงจนถึง 80%

## 4. สิ่งที่ต้องเพิ่มใน SmartSpec

### 4.1 เพิ่ม Coverage Config ใน smartspec.config.yaml

```yaml
quality:
  coverage:
    # Minimum coverage threshold for new code
    minimum_threshold: 80
    
    # Coverage threshold for entire codebase
    overall_threshold: 50
    
    # Allow coverage to decrease in PR
    allow_decrease: false
    
    # Coverage tool configuration
    tool: pytest-cov  # pytest-cov | jest | vitest
    
    # Paths to include/exclude
    include_paths:
      - app/
      - src/
    exclude_paths:
      - tests/
      - migrations/
```

### 4.2 เพิ่ม Coverage Check ใน smartspec_quality_gate

```markdown
### Profile: `ci`

MUST checks:
- **QG-301 Coverage Threshold**: New code coverage ≥ config threshold
- **QG-302 Coverage Delta**: Coverage did not decrease from baseline
- **QG-303 Critical Path Coverage**: Critical paths have ≥ 90% coverage
```

### 4.3 เพิ่ม Coverage Validation ใน smartspec_implement_tasks

```markdown
### 4) Post-Implementation Validation (MANDATORY)

**Coverage Validation Command:**
```bash
python3 -m pytest tests/ --cov=app --cov-report=json --cov-fail-under=80
```

**Validation Rules:**
- **Exit Code `0`:** Coverage ≥ 80%. May proceed with `--apply`.
- **Exit Code `1`:** Coverage < 80%. MUST NOT use `--apply`.
```

### 4.4 สร้าง Workflow ใหม่: smartspec_coverage_report

```markdown
# smartspec_coverage_report

Purpose: Generate coverage report และ enforce threshold

Outputs:
- `.spec/reports/coverage/<run-id>/report.md`
- `.spec/reports/coverage/<run-id>/summary.json`
- `.spec/reports/coverage/<run-id>/coverage.json`

Checks:
- CR-001: Overall coverage ≥ threshold
- CR-002: New code coverage ≥ threshold
- CR-003: No uncovered critical paths
- CR-004: Coverage delta check
```

## 5. Implementation Priority

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| P0 | เพิ่ม coverage config ใน smartspec.config.yaml | Low | High |
| P0 | เพิ่ม coverage check ใน smartspec_quality_gate | Medium | High |
| P1 | เพิ่ม coverage validation ใน smartspec_implement_tasks | Medium | High |
| P1 | สร้าง smartspec_coverage_report workflow | High | Medium |
| P2 | เพิ่ม coverage estimation ใน smartspec_generate_tests | High | Medium |

## 6. Quick Win: ใช้ pytest.ini

สำหรับ python-backend สามารถบังคับ coverage ได้ทันทีโดยเพิ่มใน `pytest.ini`:

```ini
[pytest]
addopts = --cov=app --cov-report=term-missing --cov-fail-under=80
```

หรือใน `pyproject.toml`:

```toml
[tool.pytest.ini_options]
addopts = "--cov=app --cov-report=term-missing --cov-fail-under=80"

[tool.coverage.run]
source = ["app"]
omit = ["*/tests/*", "*/migrations/*"]

[tool.coverage.report]
fail_under = 80
exclude_lines = [
    "pragma: no cover",
    "if TYPE_CHECKING:",
    "raise NotImplementedError",
]
```
