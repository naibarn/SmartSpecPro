# Test-Driven Workflow for New Features

**Date:** 2026-01-02  
**Author:** Manus AI  
**Purpose:** แนวทางปฏิบัติสำหรับการพัฒนาฟีเจอร์ใหม่ด้วย SmartSpec workflow เพื่อให้ได้ 80% coverage

## 1. Overview

แนวทางนี้ใช้หลักการ **Test-First Development** โดยผสานเข้ากับ SmartSpec workflow เพื่อให้มั่นใจว่าโค้ดใหม่มีคุณภาพสูงและมี test coverage ตามเป้าหมายตั้งแต่ต้น

## 2. Workflow Chain

| Step | Workflow | Purpose | Key Outputs |
|------|----------|---------|-------------|
| 1 | `/smartspec_generate_spec` | สร้าง spec สำหรับฟีเจอร์ใหม่ | `spec.md` |
| 2 | `/smartspec_generate_plan` | สร้าง plan การพัฒนา | `plan.md` |
| 3 | `/smartspec_generate_tasks` | สร้าง tasks สำหรับ implement | `tasks.md` |
| 4 | `/smartspec_generate_tests` | **สร้าง test plan** | `testplan/tests.md` |
| 5 | `/smartspec_implement_tasks` | **Implement tests ก่อน** | Test files (e.g., `test_*.py`) |
| 6 | `/smartspec_test_suite_runner` | **รัน tests (คาดว่า fail)** | Coverage report (low) |
| 7 | `/smartspec_implement_tasks` | **Implement code ให้ tests ผ่าน** | Source code files |
| 8 | `/smartspec_test_suite_runner` | **รัน tests และวัด coverage** | Coverage report (≥ 80%) |
| 9 | `/smartspec_quality_gate` | **ตรวจสอบคุณภาพ** | Quality report (pass) |
| 10 | `/smartspec_verify_tasks_progress_strict` | **Verify task completion** | Verification report (pass) |

## 3. Detailed Steps

### Step 1-3: Spec, Plan, Tasks

- เริ่มต้นด้วยการสร้าง spec, plan, และ tasks ตามปกติ
- `spec.md` ต้องระบุ Non-Functional Requirements (NFRs) ที่เกี่ยวกับ quality และ testing

### Step 4: Generate Test Plan

- **สำคัญ:** ต้องสร้าง test plan **ก่อน** implement code
- ใช้ `/smartspec_generate_tests` เพื่อสร้าง `testplan/tests.md`
- Test plan จะระบุ test cases, acceptance criteria, และ evidence ที่ต้องการ

### Step 5: Implement Tests First

- ใช้ `/smartspec_implement_tasks` เพื่อสร้าง test files ตาม `testplan/tests.md`
- เขียน test cases ที่ครอบคลุม business logic, edge cases, และ error handling
- ใช้ mocks และ stubs สำหรับ external dependencies

### Step 6: Run Tests (Red Phase)

- ใช้ `/smartspec_test_suite_runner` เพื่อรัน tests ที่สร้างขึ้น
- **คาดว่า tests ส่วนใหญ่จะ fail** เพราะยังไม่มี implementation (Red-Green-Refactor)
- ได้ coverage report ที่มี coverage ต่ำ

### Step 7: Implement Code (Green Phase)

- ใช้ `/smartspec_implement_tasks` เพื่อเขียน source code
- เป้าหมายคือทำให้ tests ที่เขียนไว้ใน Step 5 ผ่านทั้งหมด

### Step 8: Run Tests & Measure Coverage

- ใช้ `/smartspec_test_suite_runner` อีกครั้ง
- **คาดว่า tests ทั้งหมดจะ pass**
- วัด coverage และตรวจสอบว่าถึง 80% หรือไม่
- ถ้าไม่ถึง ให้กลับไป Step 5 เพื่อเพิ่ม tests

### Step 9: Quality Gate

- ใช้ `/smartspec_quality_gate --profile=ci` เพื่อตรวจสอบคุณภาพ
- Quality gate จะ fail ถ้า coverage ไม่ถึง 80% (เมื่อ config แล้ว)

### Step 10: Verify Completion

- ใช้ `/smartspec_verify_tasks_progress_strict` เพื่อตรวจสอบว่า tasks ทั้งหมดเสร็จสมบูรณ์

## 4. Configuration

### 4.1 pyproject.toml (สำหรับ Python)

เพิ่มใน `pyproject.toml` เพื่อบังคับ coverage:

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

### 4.2 smartspec.config.yaml

เพิ่ม quality configuration:

```yaml
quality:
  coverage:
    minimum_threshold: 80
    overall_threshold: 50
    allow_decrease: false
    tool: pytest-cov
    include_paths:
      - app/
    exclude_paths:
      - tests/
```

## 5. ตัวอย่างการใช้งาน

**Agent Prompt สำหรับ Feature ใหม่:**

```
As an AI Engineer, your task is to implement a new "Refund" feature.

**Workflow:**
1. Generate spec, plan, and tasks for the Refund feature.
2. Generate a test plan with at least 10 test cases.
3. Implement the test cases first. All tests should fail initially.
4. Implement the Refund feature code to make all tests pass.
5. Ensure the final code coverage for the Refund feature is at least 80%.
6. Run the quality gate and verify task completion.

**Constraints:**
- Follow the Test-Driven Workflow for New Features.
- Use mocks for external services (Stripe, email).
- All code must be committed to a new feature branch.
```

## 6. ประโยชน์ของแนวทางนี้

- **Coverage by Design:** ได้ coverage 80% ตั้งแต่ต้น ไม่ต้องมาแก้ทีหลัง
- **High Quality Code:** โค้ดที่เขียนมาเพื่อ test จะมี quality ที่ดีกว่า
- **Clear Requirements:** Tests ทำหน้าที่เป็น executable specification
- **Reduced Bugs:** พบ bug ตั้งแต่เนิ่นๆ ใน development cycle
- **Maintainability:** โค้ดที่ testable จะ maintain ง่ายกว่า
