# SmartSpecPro - Security Fix Plan

## แผนการแก้ไขช่องโหว่ Critical และ High Priority

---

## 🔴 Critical Issues (3 รายการ)

### CRIT-001: CSP (Content Security Policy) ถูกปิดใช้งาน

| รายละเอียด | ข้อมูล |
|------------|--------|
| **Issue ID** | CRIT-001 |
| **ระดับความรุนแรง** | 🔴 Critical |
| **ไฟล์ที่ต้องแก้ไข** | `src-tauri/tauri.conf.json` |
| **ความเสี่ยง** | XSS attacks, Code injection, Data exfiltration |
| **ระยะเวลาแก้ไข** | 2 ชั่วโมง |
| **ผู้รับผิดชอบ** | Security Team |
| **Priority** | P0 - แก้ไขทันที |

**โค้ดปัจจุบัน:**
```json
"security": {
  "csp": null
}
```

**โค้ดที่ต้องแก้ไข:**
```json
"security": {
  "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://api.openrouter.ai https://*.anthropic.com https://*.openai.com https://*.deepseek.com; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
}
```

**Checklist:**
- [ ] อัพเดท tauri.conf.json
- [ ] ทดสอบว่า app ยังทำงานได้ปกติ
- [ ] ทดสอบ LLM API connections
- [ ] ทดสอบ image loading
- [ ] Verify CSP headers ใน DevTools

---

### CRIT-002: Auth Token เก็บใน localStorage โดยไม่เข้ารหัส

| รายละเอียด | ข้อมูล |
|------------|--------|
| **Issue ID** | CRIT-002 |
| **ระดับความรุนแรง** | 🔴 Critical |
| **ไฟล์ที่ต้องแก้ไข** | `src/pages/Login.tsx`, `src/services/authService.ts`, `src-tauri/src/secure_store.rs` |
| **ความเสี่ยง** | Token theft via XSS, Session hijacking |
| **ระยะเวลาแก้ไข** | 4 ชั่วโมง |
| **ผู้รับผิดชอบ** | Backend + Frontend Team |
| **Priority** | P0 - แก้ไขทันที |

**Tasks:**

| # | Task | ไฟล์ | สถานะ |
|---|------|------|-------|
| 1 | เพิ่ม Tauri commands สำหรับ auth token | `secure_store.rs` | ⬜ |
| 2 | สร้าง TypeScript bindings | `authService.ts` | ⬜ |
| 3 | แก้ไข Login.tsx ให้ใช้ secure store | `Login.tsx` | ⬜ |
| 4 | ลบ localStorage usage ทั้งหมด | Multiple files | ⬜ |
| 5 | เพิ่ม token encryption | `secure_store.rs` | ⬜ |
| 6 | ทดสอบ login/logout flow | - | ⬜ |

**โค้ดที่ต้องเพิ่มใน secure_store.rs:**
```rust
#[tauri::command]
pub fn set_auth_token(token: String) -> Result<(), String> {
    let entry = Entry::new(SERVICE, "auth_token").map_err(|e| e.to_string())?;
    entry.set_password(&token).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_auth_token() -> Result<Option<String>, String> {
    let entry = Entry::new(SERVICE, "auth_token").map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn delete_auth_token() -> Result<(), String> {
    let entry = Entry::new(SERVICE, "auth_token").map_err(|e| e.to_string())?;
    match entry.delete_password() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
```

---

### CRIT-003: API Keys อาจถูก Expose ผ่าน Frontend

| รายละเอียด | ข้อมูล |
|------------|--------|
| **Issue ID** | CRIT-003 |
| **ระดับความรุนแรง** | 🔴 Critical |
| **ไฟล์ที่ต้องแก้ไข** | `src/services/chatService.ts`, `src-tauri/src/llm_service.rs` |
| **ความเสี่ยง** | API key leakage, Unauthorized API usage, Cost implications |
| **ระยะเวลาแก้ไข** | 6 ชั่วโมง |
| **ผู้รับผิดชอบ** | Backend Team |
| **Priority** | P0 - แก้ไขทันที |

**Tasks:**

| # | Task | ไฟล์ | สถานะ |
|---|------|------|-------|
| 1 | ย้าย API calls ไป backend | `llm_service.rs` | ⬜ |
| 2 | เก็บ API keys ใน secure store | `secure_store.rs` | ⬜ |
| 3 | สร้าง API key management UI | `Settings.tsx` | ⬜ |
| 4 | ลบ API key handling จาก frontend | `chatService.ts` | ⬜ |
| 5 | Implement key rotation | `llm_service.rs` | ⬜ |

---

## 🟠 High Priority Issues (5 รายการ)

### HIGH-001: Excessive use of `.unwrap()` ใน Rust Code

| รายละเอียด | ข้อมูล |
|------------|--------|
| **Issue ID** | HIGH-001 |
| **ระดับความรุนแรง** | 🟠 High |
| **ไฟล์ที่ต้องแก้ไข** | `repository.rs` (40), `workspace_db.rs` (13), `database.rs` (13) |
| **ความเสี่ยง** | Application crashes (panic), Denial of Service |
| **ระยะเวลาแก้ไข** | 8 ชั่วโมง |
| **ผู้รับผิดชอบ** | Backend Team |
| **Priority** | P1 - แก้ไขภายใน 3 วัน |

**แผนการแก้ไขแต่ละไฟล์:**

| ไฟล์ | จำนวน unwrap() | แนวทางแก้ไข | สถานะ |
|------|---------------|-------------|-------|
| `repository.rs` | 40 | ใช้ `?` operator และ `map_err()` | ⬜ |
| `workspace_db.rs` | 13 | ใช้ `?` operator และ `unwrap_or_default()` | ⬜ |
| `database.rs` | 13 | ใช้ `?` operator และ custom error types | ⬜ |
| `template_engine.rs` | 4 | ใช้ `?` operator | ⬜ |
| `python_bridge.rs` | 4 | ใช้ `?` operator | ⬜ |
| `memory_manager.rs` | 3 | ใช้ `?` operator | ⬜ |

**Pattern ที่ต้องแก้ไข:**
```rust
// ❌ Before
let result = operation().unwrap();

// ✅ After - Option 1: Propagate error
let result = operation().map_err(|e| format!("Operation failed: {}", e))?;

// ✅ After - Option 2: Default value
let result = operation().unwrap_or_default();

// ✅ After - Option 3: Handle explicitly
let result = match operation() {
    Ok(v) => v,
    Err(e) => {
        log::error!("Operation failed: {}", e);
        return Err(e.into());
    }
};
```

---

### HIGH-002: SQL Query Construction ที่ไม่ปลอดภัย

| รายละเอียด | ข้อมูล |
|------------|--------|
| **Issue ID** | HIGH-002 |
| **ระดับความรุนแรง** | 🟠 High |
| **ไฟล์ที่ต้องแก้ไข** | `src-tauri/src/repository.rs` |
| **ความเสี่ยง** | SQL Injection, Query manipulation |
| **ระยะเวลาแก้ไข** | 4 ชั่วโมง |
| **ผู้รับผิดชอบ** | Backend Team |
| **Priority** | P1 - แก้ไขภายใน 3 วัน |

**ตำแหน่งที่ต้องแก้ไข:**

| Line | โค้ดปัจจุบัน | โค้ดที่ต้องแก้ไข |
|------|-------------|-----------------|
| 109 | `sql.push_str(&format!(" LIMIT {}", limit));` | ใช้ parameterized query |
| 113 | `sql.push_str(&format!(" OFFSET {}", offset));` | ใช้ parameterized query |
| 283 | `sql.push_str(&format!(" LIMIT {}", limit));` | ใช้ parameterized query |
| 287 | `sql.push_str(&format!(" OFFSET {}", offset));` | ใช้ parameterized query |

**โค้ดที่ต้องแก้ไข:**
```rust
// ❌ Before
sql.push_str(&format!(" LIMIT {}", limit));
sql.push_str(&format!(" OFFSET {}", offset));

// ✅ After
sql.push_str(" LIMIT ?");
sql.push_str(" OFFSET ?");
// แล้วใช้ params![..., limit, offset] ใน query
```

---

### HIGH-003: Command Execution โดยไม่มี Input Validation

| รายละเอียด | ข้อมูล |
|------------|--------|
| **Issue ID** | HIGH-003 |
| **ระดับความรุนแรง** | 🟠 High |
| **ไฟล์ที่ต้องแก้ไข** | `docker_manager.rs`, `git_workflow.rs`, `python_bridge.rs`, `template_engine.rs` |
| **ความเสี่ยง** | Command injection, Arbitrary code execution |
| **ระยะเวลาแก้ไข** | 8 ชั่วโมง |
| **ผู้รับผิดชอบ** | Backend Team |
| **Priority** | P1 - แก้ไขภายใน 3 วัน |

**Tasks แต่ละไฟล์:**

| ไฟล์ | Command Types | Validation Needed | สถานะ |
|------|--------------|-------------------|-------|
| `docker_manager.rs` | docker run, exec, ps | Container name, image name | ⬜ |
| `git_workflow.rs` | git merge, checkout | Branch name, commit hash | ⬜ |
| `python_bridge.rs` | python execution | Script path, arguments | ⬜ |
| `template_engine.rs` | git init, add | Repository path | ⬜ |

**Validation Functions ที่ต้องสร้าง:**
```rust
// สร้างไฟล์ใหม่: src-tauri/src/input_validation.rs

use regex::Regex;

pub fn validate_container_name(name: &str) -> Result<(), String> {
    let re = Regex::new(r"^[a-zA-Z0-9][a-zA-Z0-9_.-]*$").unwrap();
    if name.len() > 128 {
        return Err("Container name too long".to_string());
    }
    if !re.is_match(name) {
        return Err("Invalid container name format".to_string());
    }
    Ok(())
}

pub fn validate_branch_name(name: &str) -> Result<(), String> {
    let re = Regex::new(r"^[a-zA-Z0-9/_.-]+$").unwrap();
    if name.contains("..") || name.starts_with('/') || name.ends_with('/') {
        return Err("Invalid branch name".to_string());
    }
    if !re.is_match(name) {
        return Err("Invalid branch name format".to_string());
    }
    Ok(())
}

pub fn validate_file_path(path: &str, base_dir: &Path) -> Result<PathBuf, String> {
    let path = PathBuf::from(path);
    let canonical = path.canonicalize()
        .map_err(|e| format!("Invalid path: {}", e))?;
    
    if !canonical.starts_with(base_dir) {
        return Err("Path traversal detected".to_string());
    }
    Ok(canonical)
}
```

---

### HIGH-004: ไม่มี Rate Limiting สำหรับ LLM API Calls

| รายละเอียด | ข้อมูล |
|------------|--------|
| **Issue ID** | HIGH-004 |
| **ระดับความรุนแรง** | 🟠 High |
| **ไฟล์ที่ต้องแก้ไข** | `src-tauri/src/llm_service.rs`, `src-tauri/src/chat_commands.rs` |
| **ความเสี่ยง** | API cost explosion, DoS on LLM providers, Account suspension |
| **ระยะเวลาแก้ไข** | 6 ชั่วโมง |
| **ผู้รับผิดชอบ** | Backend Team |
| **Priority** | P1 - แก้ไขภายใน 5 วัน |

**Rate Limits ที่ต้อง Implement:**

| Provider | Requests/min | Tokens/min | Tokens/day |
|----------|-------------|------------|------------|
| OpenRouter | 60 | 100,000 | 1,000,000 |
| OpenAI | 60 | 90,000 | 500,000 |
| Anthropic | 60 | 100,000 | 1,000,000 |
| Deepseek | 60 | 100,000 | Unlimited |

**โค้ดที่ต้องเพิ่ม:**
```rust
// src-tauri/src/rate_limiter.rs

use std::collections::HashMap;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

pub struct RateLimiter {
    limits: HashMap<String, ProviderLimits>,
    usage: Mutex<HashMap<String, UsageTracker>>,
}

struct ProviderLimits {
    requests_per_minute: u32,
    tokens_per_minute: u32,
    tokens_per_day: u32,
}

struct UsageTracker {
    minute_requests: u32,
    minute_tokens: u32,
    day_tokens: u32,
    minute_reset: Instant,
    day_reset: Instant,
}

impl RateLimiter {
    pub async fn check_and_wait(&self, provider: &str, estimated_tokens: u32) -> Result<(), String> {
        let mut usage = self.usage.lock().await;
        let tracker = usage.entry(provider.to_string()).or_insert_with(|| UsageTracker::new());
        let limits = self.limits.get(provider).ok_or("Unknown provider")?;
        
        // Reset counters if needed
        tracker.maybe_reset();
        
        // Check limits
        if tracker.minute_requests >= limits.requests_per_minute {
            let wait_time = tracker.time_until_minute_reset();
            tokio::time::sleep(wait_time).await;
            tracker.reset_minute();
        }
        
        if tracker.minute_tokens + estimated_tokens > limits.tokens_per_minute {
            return Err("Token rate limit exceeded".to_string());
        }
        
        if tracker.day_tokens + estimated_tokens > limits.tokens_per_day {
            return Err("Daily token limit exceeded".to_string());
        }
        
        // Update usage
        tracker.minute_requests += 1;
        tracker.minute_tokens += estimated_tokens;
        tracker.day_tokens += estimated_tokens;
        
        Ok(())
    }
}
```

---

### HIGH-005: Missing Input Sanitization ใน Template Engine

| รายละเอียด | ข้อมูล |
|------------|--------|
| **Issue ID** | HIGH-005 |
| **ระดับความรุนแรง** | 🟠 High |
| **ไฟล์ที่ต้องแก้ไข** | `src-tauri/src/template_engine.rs` |
| **ความเสี่ยง** | Path traversal attacks, Template injection, File system access |
| **ระยะเวลาแก้ไข** | 4 ชั่วโมง |
| **ผู้รับผิดชอบ** | Backend Team |
| **Priority** | P1 - แก้ไขภายใน 5 วัน |

**ตำแหน่งที่ต้องเพิ่ม Validation:**

| Function | Input | Validation Needed |
|----------|-------|-------------------|
| `create_project()` | project_path | Path traversal check |
| `apply_template()` | template_id | Whitelist check |
| `generate_files()` | file_paths | Path traversal check |
| `read_template()` | template_path | Path within templates dir |

**Checklist:**
- [ ] เพิ่ม path validation function
- [ ] เพิ่ม template ID whitelist
- [ ] เพิ่ม file extension whitelist
- [ ] ทดสอบ path traversal attacks
- [ ] ทดสอบ template injection

---

## 📅 Timeline Summary

| Week | Issues | Tasks | Hours |
|------|--------|-------|-------|
| **Week 1** | CRIT-001, CRIT-002, CRIT-003 | CSP, Auth tokens, API keys | 12 hrs |
| **Week 2** | HIGH-001, HIGH-002 | Error handling, SQL queries | 12 hrs |
| **Week 3** | HIGH-003, HIGH-004, HIGH-005 | Input validation, Rate limiting | 18 hrs |

**Total Estimated Hours:** 42 hours

---

## 📊 Progress Tracking

### Critical Issues

| ID | Issue | Status | Assigned | Due Date |
|----|-------|--------|----------|----------|
| CRIT-001 | CSP Configuration | ✅ Fixed | Security Team | Week 1 |
| CRIT-002 | Auth Token Storage | ✅ Fixed | Security Team | Week 1 |
| CRIT-003 | API Key Protection | ✅ Fixed | Security Team | Week 1 |

### High Priority Issues

| ID | Issue | Status | Assigned | Due Date |
|----|-------|--------|----------|----------|
| HIGH-001 | Remove .unwrap() | ✅ Fixed | Backend Team | Week 2 |
| HIGH-002 | SQL Parameterization | ✅ Fixed | Backend Team | Week 2 |
| HIGH-003 | Command Validation | ✅ Fixed | Backend Team | Week 3 |
| HIGH-004 | Rate Limiting | ✅ Fixed | Backend Team | Week 3 |
| HIGH-005 | Template Sanitization | ✅ Fixed | Backend Team | Week 3 |

---

## ✅ Definition of Done

แต่ละ issue จะถือว่าเสร็จสมบูรณ์เมื่อ:

1. ✅ โค้ดได้รับการแก้ไขตามแผน
2. ✅ Unit tests ผ่านทั้งหมด
3. ✅ Security tests ผ่าน
4. ✅ Code review ผ่าน
5. ✅ Documentation อัพเดท
6. ✅ Merge to main branch
7. ✅ Verify in staging environment

---

## 🔗 Related Documents

- [Security Audit Report](./SECURITY_AUDIT_REPORT.md)
- [Architecture Overview](./architecture/OVERVIEW.md)
- [API Documentation](./api/README.md)
