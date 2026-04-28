# Security Audit Protocol — the target repository

กลไก security audit อัตโนมัติ 3 ชั้น ทำงานใน 3 จังหวะที่ต่างกัน

---

## ชั้นที่ 1: Inline Security Check (ทุกครั้งที่เขียน code)

**เมื่อไหร่:** ทุกครั้งที่ LLM เขียนหรือแก้ไข code in the active repository
**ใครทำ:** LLM ที่กำลังเขียน code (main session / deep-implement / orchestra agent)
**วิธีการ:** ตรวจขณะเขียน ไม่ต้องรอจบ

### Checklist (ตรวจอัตโนมัติทุกไฟล์ที่แก้)

**ถ้าแก้ไฟล์ `routers/*.ts` (tRPC):**
- [ ] ทุก procedure มี `.use(isAuthenticated)` หรือ auth middleware
- [ ] ทุก query มี `WHERE tenantId = ctx.tenantId`
- [ ] Input validate ด้วย Zod schema
- [ ] ไม่มี `raw()` SQL query
- [ ] ไม่ return decrypted secrets ใน response
- Ref: `skills/cybersecurity/exploiting-idor-vulnerabilities.md`

**ถ้าแก้ไฟล์ `python-backend/app/`:**
- [ ] ไม่มี `subprocess.run(shell=True)` หรือ `os.system()`
- [ ] ไม่มี `text()` SQL กับ user input
- [ ] ไม่มี `print()` ที่ log secrets
- [ ] Celery task args ไม่มี decrypted credentials
- Ref: `skills/cybersecurity/exploiting-sql-injection-vulnerabilities.md`

**ถ้าแก้ไฟล์ `client/src/`:**
- [ ] ไม่มี `dangerouslySetInnerHTML` กับ user content
- [ ] Token อยู่ใน httpOnly cookie ไม่ใช่ localStorage
- [ ] ไม่มี `VITE_` prefix สำหรับ server-only secrets
- Ref: `skills/cybersecurity/testing-for-xss-vulnerabilities.md`

**ถ้าแก้ไฟล์ `crypto.ts` / encryption:**
- [ ] IV unique ทุกครั้งที่ encrypt (ไม่ reuse)
- [ ] Auth tag validated ตอน decrypt
- [ ] ไม่ log decrypted values
- Ref: `skills/cybersecurity/implementing-aes-encryption-for-data-at-rest.md`

**ถ้าแก้ไฟล์ LLM / skill execution:**
- [ ] User input ไม่ embed ตรงใน system prompt
- [ ] ใช้ XML delimiter แยก user data จาก instructions
- [ ] ไม่ส่ง sensitive data (API keys, passwords) ใน prompt

---

## ชั้นที่ 2: Post-Implementation Security Scan (จบ feature)

**เมื่อไหร่:**
- `/deep-implement` finalization (หลัง cross-section review)
- `/orchestra` Step 6 security gate
- หลัง commit ก่อน create PR

**ใครทำ:** ssp-security agent (dispatch อัตโนมัติ)
**วิธีการ:** สแกน diff ของ branch ทั้งหมดเทียบกับ main

### Trigger (ทำอัตโนมัติ ไม่ต้องสั่ง)

เมื่อ deep-implement finalization หรือ orchestra Step 6 ทำงาน:

1. รัน `git diff main...HEAD --name-only` เพื่อหา changed files
2. ตรวจว่า changed files ตรง trigger conditions ของ security gate หรือไม่:

| Trigger | File Pattern |
|---------|-------------|
| Auth modified | `*/middleware/*`, `*/lib/jwt*`, `*/lib/permissions*` |
| New endpoint | `routers/*.ts` มี procedure ใหม่, `app/api/**/*.py` มี route ใหม่ |
| Encryption changed | `crypto.ts`, `*Encrypted` columns, `encryption.py` |
| File upload | endpoint ที่รับ `multipart/form-data` |
| Config changed | `nginx/`, `docker-compose*`, systemd files |
| LLM integration | `skillExecutor*`, `llmRouter*`, `aiPresentationService*` |

3. ถ้า trigger → dispatch 3 agents parallel:
   - `ssp-security-trpc` → scan tRPC routers
   - `ssp-security-fastapi` → scan Python endpoints
   - `ssp-security-frontend` → scan React components

4. Aggregate findings → `ssp-security-review`
5. CRITICAL findings → AUTO-FIX ถ้าทำได้ (80%+ confident)
6. ที่เหลือ → log ใน risk register

### Reference Skills ที่ agents ต้องอ่าน

Agents ต้องอ่าน cybersecurity skills ที่เกี่ยวข้อง:
```
skills/cybersecurity/exploiting-idor-vulnerabilities.md
skills/cybersecurity/exploiting-sql-injection-vulnerabilities.md
skills/cybersecurity/testing-for-xss-vulnerabilities.md
skills/cybersecurity/performing-csrf-attack-simulation.md
skills/cybersecurity/performing-directory-traversal-testing.md
skills/cybersecurity/exploiting-jwt-algorithm-confusion-attack.md
skills/cybersecurity/implementing-api-key-security-controls.md
skills/cybersecurity/implementing-secret-scanning-with-gitleaks.md
```

---

## ชั้นที่ 3: Full Security Audit (รายเดือน / ก่อน release)

**เมื่อไหร่:**
- ทุกเดือน (scheduled)
- ก่อน major release
- หลังเพิ่ม feature ใหม่ที่เกี่ยวกับ auth/payment/encryption

**ใครทำ:** `/orchestra` กับ task "Full security audit"
**วิธีการ:** สแกน codebase ทั้งหมด ไม่ใช่แค่ diff

### ขั้นตอน

1. สั่ง `/orchestra Full security audit of target codebase`
2. Orchestra จะ:
   - Wave 1: dispatch ssp-security agents สแกนทุก domain parallel
   - Wave 2: cross-reference findings กับ cybersecurity skills
   - Wave 3: AUTO-FIX สิ่งที่ทำได้ + สร้าง risk register
3. Output: `orchestra/risk_register.md` พร้อมรายการ findings ทั้งหมด

### Audit Checklist (25 skills)

| หมวด | สิ่งที่ตรวจ | Skills Reference |
|------|-----------|-----------------|
| **Injection** | SQL injection ทุก query, command injection ทุก subprocess, XSS ทุก render, SSRF ทุก outbound call | 5 skills |
| **Auth** | JWT validation, session security, RBAC enforcement, OAuth flows | 5 skills |
| **Secrets** | ไม่มี secrets ใน logs/responses/VITE_ vars, encryption ถูกต้อง | 3 skills |
| **API** | Rate limiting, API key management, IDOR ทุก endpoint | 3 skills |
| **Data** | Path traversal, file upload validation, deserialization safety | 3 skills |
| **Infra** | Docker hardening, CORS/CSP config, S3 permissions, dependency scan | 6 skills |

---

## Integration Points (ที่ต้องแก้ไข code)

### 1. deep-implement finalization — เพิ่ม security scan

ใน `skills/deep-implement/references/finalization.md` — Final Quality Pass section:
เพิ่มขั้นตอนก่อน generate usage.md

### 2. orchestra security gate — อ้างอิง cybersecurity skills

ใน `skills/orchestra/references/security-review-protocol.md`:
เพิ่ม instruction ให้ agents อ่าน `skills/cybersecurity/` เป็น reference

### 3. ssp-security agents — เพิ่ม skills reference

ทุก ssp-security agent ควรได้รับ path ไปยัง cybersecurity skills:
```
CONTEXT: Reference cybersecurity skills at skills/cybersecurity/ for:
- Attack patterns and test payloads
- Secure coding patterns
- Verification checklists
```
