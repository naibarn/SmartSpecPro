# SmartSpecPro - Test Mapping & Coverage Plan

**เป้าหมาย:** เพิ่ม Test Coverage ให้ครอบคลุม 80% ของโค้ดทั้งหมด

---

## 🦀 1. Rust Backend (src-tauri/src)
**จำนวนไฟล์:** 52 ไฟล์

### Priority 1: Security & Core Logic (High Coverage Required)
- `secure_store.rs` - Keyring operations
- `input_validation.rs` - Validation rules
- `rate_limiter.rs` - Token bucket logic
- `sql_builder.rs` - Query generation
- `error_handling.rs` - Error mapping
- `workspace_db.rs` - Database connections

### Priority 2: Services & Commands
- `llm_service.rs` - API integration
- `cli_service.rs` - Command execution
- `job_manager.rs` - Lifecycle management
- `template_engine.rs` - Scaffolding logic

---

## ⚛️ 2. TypeScript Frontend (src/)
**จำนวนไฟล์:** 183 ไฟล์

### Priority 1: Services & Utils (Unit Tests)
- `services/*.ts` - API bindings, State management
- `utils/*.ts` - Helper functions
- `hooks/*.ts` - Custom React hooks

### Priority 2: UI Components (Component Tests)
- `components/common/*.tsx` - Shared UI components
- `components/chat/*.tsx` - Chat interface
- `components/wizard/*.tsx` - Template wizard

---

## 🛠️ 3. Testing Tools
- **Rust:** `cargo test`
- **Frontend:** `vitest` + `react-testing-library`

---

## 📊 Coverage Tracking
| Area | Current | Target |
|------|---------|--------|
| Rust Backend | ~5% | 80% |
| Frontend Services | ~20% | 80% |
| UI Components | ~5% | 60% |
| **Overall** | **~10%** | **80%** |
