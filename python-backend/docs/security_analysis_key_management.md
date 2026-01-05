# Security Analysis: Key Management System

## Executive Summary

การวิเคราะห์ความเสี่ยงด้านความปลอดภัยของ Secure Key Management System ใน SmartSpec Pro พบประเด็นสำคัญหลายด้านที่ต้องปรับปรุง โดยเฉพาะในส่วนของ **Key Rotation**, **Storage Security**, และ **Cryptographic Implementation**

---

## 1. Current Implementation Analysis

### 1.1 Encryption Service

**โค้ดปัจจุบัน:**
```python
class EncryptionService:
    def _create_fernet(self) -> Fernet:
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=b"smartspec_salt_v1",  # Static salt
            iterations=100000,
        )
```

### 1.2 Key Rotation

**โค้ดปัจจุบัน:**
```python
async def rotate_key(self, key_id: str, user_id: str) -> Optional[APIKeyWithSecret]:
    # Generate new key
    new_api_key = self.generate_test_key() if is_test else self.generate_api_key()
    
    # Remove old hash from index
    del self._key_hash_index[old_key_hash]
    
    # Update key info immediately
    key_info["key_hash"] = new_key_hash
```

### 1.3 Storage

**โค้ดปัจจุบัน:**
```python
# In-memory storage (should use database in production)
self._keys: Dict[str, Dict[str, Any]] = {}
```

---

## 2. Risk Assessment

### 2.1 Critical Risks (ความเสี่ยงระดับวิกฤต)

| Risk ID | Description | Impact | Likelihood | Risk Level |
|---------|-------------|--------|------------|------------|
| **R-001** | Static Salt ใน PBKDF2 | High | High | **Critical** |
| **R-002** | In-Memory Storage สูญหายเมื่อ restart | High | High | **Critical** |
| **R-003** | Instant Key Invalidation ไม่มี Grace Period | Medium | High | **High** |
| **R-004** | ไม่มี Key Version Tracking | Medium | Medium | **High** |
| **R-005** | ไม่มี Audit Trail สำหรับ Key Operations | Medium | Medium | **High** |

### 2.2 Detailed Risk Analysis

#### R-001: Static Salt in PBKDF2

**ปัญหา:**
```python
salt=b"smartspec_salt_v1"  # Static salt for consistency
```

**ความเสี่ยง:**
- หาก Master Key ถูก compromise, attacker สามารถ derive encryption key ได้ทันที
- Rainbow table attacks เป็นไปได้เนื่องจาก salt เหมือนกันทุก instance
- ไม่สามารถ rotate Master Key ได้โดยไม่ต้อง re-encrypt ข้อมูลทั้งหมด

**Severity: CRITICAL**

---

#### R-002: In-Memory Storage

**ปัญหา:**
```python
self._keys: Dict[str, Dict[str, Any]] = {}
self._key_hash_index: Dict[str, str] = {}
```

**ความเสี่ยง:**
- ข้อมูลสูญหายเมื่อ server restart
- ไม่สามารถ scale horizontally ได้ (multiple instances)
- Memory dump attack สามารถเข้าถึง keys ได้

**Severity: CRITICAL**

---

#### R-003: Instant Key Invalidation (No Grace Period)

**ปัญหา:**
```python
async def rotate_key(self, key_id: str, user_id: str):
    # Remove old hash from index IMMEDIATELY
    del self._key_hash_index[old_key_hash]
    
    # Update key info
    key_info["key_hash"] = new_key_hash
```

**ความเสี่ยง:**
- In-flight requests ที่ใช้ old key จะ fail ทันที
- Client applications ที่ cache old key จะหยุดทำงาน
- ไม่มี transition period สำหรับ distributed systems

**Severity: HIGH**

---

#### R-004: No Key Version Tracking

**ปัญหา:**
- ไม่มีการเก็บ history ของ key versions
- ไม่สามารถ rollback ได้หาก rotation มีปัญหา
- ไม่มี metadata บอกว่า key ถูก rotate กี่ครั้ง

**Severity: HIGH**

---

#### R-005: Insufficient Audit Trail

**ปัญหา:**
```python
logger.info("API key rotated", key_id=key_id)  # Basic logging only
```

**ความเสี่ยง:**
- ไม่มี detailed audit log สำหรับ compliance
- ไม่สามารถ trace ได้ว่าใครทำอะไรเมื่อไหร่
- ไม่มี alerting mechanism

**Severity: HIGH**

---

## 3. Additional Security Concerns

### 3.1 Cryptographic Issues

| Issue | Description | Recommendation |
|-------|-------------|----------------|
| **Fixed Iterations** | PBKDF2 iterations=100000 อาจไม่เพียงพอในอนาคต | ใช้ Argon2id แทน หรือเพิ่ม iterations |
| **No Key Wrapping** | Keys ถูกเก็บโดยตรง | ใช้ Key Wrapping (KEK/DEK pattern) |
| **Single Encryption Layer** | เข้ารหัสชั้นเดียว | ใช้ Envelope Encryption |

### 3.2 Operational Issues

| Issue | Description | Recommendation |
|-------|-------------|----------------|
| **No Automatic Rotation** | ต้อง rotate manually | Implement scheduled rotation |
| **No Expiry Warning** | ไม่มีการแจ้งเตือนก่อน key หมดอายุ | Add notification system |
| **No Rate Limit on Rotation** | สามารถ rotate ได้ไม่จำกัด | Limit rotation frequency |

### 3.3 Access Control Issues

| Issue | Description | Recommendation |
|-------|-------------|----------------|
| **No MFA for Key Operations** | ไม่ต้อง verify identity ก่อน rotate | Require MFA for sensitive ops |
| **No IP Restriction** | สามารถ rotate จาก IP ใดก็ได้ | Add IP allowlist |
| **No Approval Workflow** | ไม่มี approval สำหรับ production keys | Add approval for critical keys |

---

## 4. Threat Modeling

### 4.1 Attack Vectors

```
┌─────────────────────────────────────────────────────────────────┐
│                     THREAT MODEL                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [Attacker] ──► Memory Dump ──► Extract Keys from RAM           │
│                                                                  │
│  [Attacker] ──► Server Restart ──► Keys Lost (DoS)              │
│                                                                  │
│  [Attacker] ──► Compromise Master Key ──► Decrypt All Keys      │
│                                                                  │
│  [Insider] ──► No Audit Trail ──► Undetected Key Theft          │
│                                                                  │
│  [Client] ──► Key Rotation ──► Service Disruption               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 STRIDE Analysis

| Threat | Applicable | Current Mitigation | Gap |
|--------|------------|-------------------|-----|
| **Spoofing** | Yes | Key hash validation | Need MFA |
| **Tampering** | Yes | Encryption | Need integrity checks |
| **Repudiation** | Yes | Basic logging | Need audit trail |
| **Information Disclosure** | Yes | Encryption | Need key isolation |
| **Denial of Service** | Yes | None | Need persistence |
| **Elevation of Privilege** | Yes | Scope checking | Need better RBAC |

---

## 5. Compliance Considerations

### 5.1 Standards Alignment

| Standard | Requirement | Current Status | Gap |
|----------|-------------|----------------|-----|
| **PCI-DSS** | Key rotation every 12 months | Manual only | Need automation |
| **SOC 2** | Audit logging | Basic | Need comprehensive |
| **GDPR** | Data protection | Encryption | Need key isolation |
| **ISO 27001** | Key management policy | None | Need documentation |

---

## 6. Risk Matrix Summary

```
                    LIKELIHOOD
                    Low    Medium    High
              ┌─────────┬─────────┬─────────┐
        High  │ Medium  │  HIGH   │CRITICAL │  R-001, R-002
              ├─────────┼─────────┼─────────┤
IMPACT Medium │   Low   │ Medium  │  HIGH   │  R-003, R-004, R-005
              ├─────────┼─────────┼─────────┤
        Low   │   Low   │   Low   │ Medium  │
              └─────────┴─────────┴─────────┘
```

---

## 7. Recommendations Priority

### Immediate (Week 1)
1. ✅ Implement persistent storage (Database)
2. ✅ Add unique salt per key
3. ✅ Add grace period for key rotation

### Short-term (Month 1)
4. ✅ Implement key versioning
5. ✅ Add comprehensive audit logging
6. ✅ Implement automatic key rotation scheduling

### Medium-term (Quarter 1)
7. ✅ Migrate to Argon2id or increase PBKDF2 iterations
8. ✅ Implement envelope encryption
9. ✅ Add MFA for key operations

### Long-term (Year 1)
10. ✅ Integrate with HSM/KMS (AWS KMS, HashiCorp Vault)
11. ✅ Implement approval workflows
12. ✅ Achieve compliance certifications

---

*Document Version: 1.0*
*Analysis Date: January 3, 2025*
*Author: SmartSpec Security Team*


---

## 8. Proposed Solutions (Implemented in v2)

### 8.1 Enhanced Encryption Service

**ปัญหาที่แก้ไข:** Static Salt (R-001)

**Solution:**
```python
class EnhancedEncryptionService:
    def encrypt(self, plaintext: str) -> Tuple[str, str]:
        # Generate UNIQUE salt per encryption
        salt = os.urandom(SALT_LENGTH)  # 32 bytes
        
        # Derive key from master key + unique salt
        derived_key = self._derive_key(salt)
        
        # Return both ciphertext AND salt
        return (ciphertext, salt)
```

**Benefits:**
- แต่ละ key มี salt เป็นของตัวเอง
- Rainbow table attacks ไม่สามารถทำได้
- Master key compromise ไม่ทำให้ decrypt ได้ทันที

---

### 8.2 Key Versioning with Grace Period

**ปัญหาที่แก้ไข:** Instant Key Invalidation (R-003), No Version Tracking (R-004)

**Solution:**
```python
async def rotate_key(self, key_id: str, grace_period_hours: int = 24):
    # Old key remains valid during grace period
    for v in key_info["versions"]:
        if v["is_primary"]:
            v["is_primary"] = False
            v["grace_period_ends_at"] = datetime.utcnow() + timedelta(hours=grace_period_hours)
    
    # Create new version as primary
    new_version = KeyVersion(
        version=new_version_num,
        is_primary=True,
        ...
    )
```

**Key Version Lifecycle:**
```
┌─────────────────────────────────────────────────────────────────┐
│                    KEY VERSION LIFECYCLE                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Version 1 ──► [PRIMARY] ──► Rotation ──► [GRACE PERIOD]        │
│                                              │                   │
│                                              ▼ (24 hours)        │
│                                          [INACTIVE]              │
│                                                                  │
│  Version 2 ──────────────────────────► [PRIMARY]                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Benefits:**
- In-flight requests ไม่ fail ทันที
- Client applications มีเวลา update
- สามารถ track history ของ key versions

---

### 8.3 Comprehensive Audit Logging

**ปัญหาที่แก้ไข:** Insufficient Audit Trail (R-005)

**Solution:**
```python
class KeyAuditLogger:
    async def log_event(
        self,
        event_type: AuditEventType,
        user_id: str,
        key_id: Optional[str] = None,
        key_version: Optional[int] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
    ) -> AuditEvent:
        # Log with full context
        ...
        
        # Check for suspicious patterns
        await self._check_suspicious_activity(event)
```

**Audit Events:**
| Event Type | Description |
|------------|-------------|
| `KEY_CREATED` | New key created |
| `KEY_ROTATED` | Key rotated to new version |
| `KEY_REVOKED` | Key revoked |
| `KEY_VALIDATED` | Successful validation |
| `KEY_VALIDATION_FAILED` | Failed validation attempt |
| `GRACE_PERIOD_STARTED` | Old version entered grace period |
| `GRACE_PERIOD_ENDED` | Grace period expired |
| `SUSPICIOUS_ACTIVITY` | Anomaly detected |

**Benefits:**
- Full audit trail for compliance
- Suspicious activity detection
- Forensic investigation support

---

### 8.4 Rate Limiting on Rotation

**Solution:**
```python
async def _check_rotation_rate_limit(self, user_id: str, key_id: str) -> bool:
    # Max 3 rotations per hour per key
    if len(recent_rotations) >= 3:
        return False
    return True
```

**Benefits:**
- ป้องกัน abuse ของ rotation feature
- ลดความเสี่ยงจาก compromised account

---

### 8.5 Increased PBKDF2 Iterations

**Solution:**
```python
# NIST recommends minimum 10,000
# We use 310,000 for 2024+ security
PBKDF2_ITERATIONS = 310000
```

**Benefits:**
- ทนทานต่อ brute-force attacks มากขึ้น
- สอดคล้องกับ NIST recommendations

---

## 9. Migration Guide

### 9.1 From v1 to v2

```python
# Step 1: Import new service
from app.services.generation.key_management_v2 import (
    get_enhanced_key_management_service,
)

# Step 2: Migrate existing keys
async def migrate_keys():
    old_service = get_key_management_service()  # v1
    new_service = get_enhanced_key_management_service()  # v2
    
    for key_id, key_info in old_service._keys.items():
        # Re-encrypt with unique salt
        decrypted = old_service.encryption.decrypt(key_info["encrypted_key"])
        encrypted, salt = new_service.encryption.encrypt(decrypted)
        
        # Create versioned key
        await new_service.create_key(
            user_id=key_info["user_id"],
            project_id=key_info["project_id"],
            name=key_info["name"],
            scopes=key_info["scopes"],
        )

# Step 3: Update API endpoints to use v2
```

### 9.2 Database Schema (for Production)

```sql
-- Key versions table
CREATE TABLE api_key_versions (
    id UUID PRIMARY KEY,
    key_id UUID REFERENCES api_keys(id),
    version INTEGER NOT NULL,
    key_hash VARCHAR(64) NOT NULL UNIQUE,
    encrypted_key TEXT NOT NULL,
    salt VARCHAR(64) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    is_primary BOOLEAN DEFAULT FALSE,
    grace_period_ends_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(key_id, version)
);

-- Audit log table
CREATE TABLE key_audit_log (
    id UUID PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    user_id UUID NOT NULL,
    key_id UUID,
    key_version INTEGER,
    ip_address INET,
    user_agent TEXT,
    details JSONB,
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX idx_key_audit_user ON key_audit_log(user_id, created_at DESC);
CREATE INDEX idx_key_audit_key ON key_audit_log(key_id, created_at DESC);
```

---

## 10. Future Recommendations

### 10.1 Short-term (Next Sprint)

1. **Implement Database Persistence**
   - Replace in-memory storage with PostgreSQL
   - Add connection pooling

2. **Add Notification System**
   - Email alerts for key expiration
   - Slack/webhook notifications

3. **Implement MFA for Key Operations**
   - TOTP verification before rotation
   - Hardware key support (WebAuthn)

### 10.2 Medium-term (Next Quarter)

4. **Integrate with External KMS**
   - AWS KMS for master key management
   - HashiCorp Vault integration

5. **Add Approval Workflows**
   - Require approval for production key rotation
   - Multi-party authorization

6. **Implement Key Escrow**
   - Secure backup of encryption keys
   - Disaster recovery procedures

### 10.3 Long-term (Next Year)

7. **Hardware Security Module (HSM)**
   - Store master keys in HSM
   - FIPS 140-2 compliance

8. **Zero-Knowledge Architecture**
   - Client-side encryption
   - Server never sees plaintext keys

9. **Compliance Certifications**
   - SOC 2 Type II
   - ISO 27001

---

## 11. Conclusion

การปรับปรุง Key Management System จาก v1 เป็น v2 ช่วยแก้ไขความเสี่ยงหลักดังนี้:

| Risk | v1 Status | v2 Status | Improvement |
|------|-----------|-----------|-------------|
| R-001: Static Salt | ❌ Critical | ✅ Fixed | Unique salt per key |
| R-002: In-Memory Storage | ❌ Critical | ⚠️ Partial | Ready for DB migration |
| R-003: No Grace Period | ❌ High | ✅ Fixed | 24-hour default grace |
| R-004: No Versioning | ❌ High | ✅ Fixed | Full version tracking |
| R-005: No Audit Trail | ❌ High | ✅ Fixed | Comprehensive logging |

**Overall Security Posture:**
- v1: **High Risk** (multiple critical vulnerabilities)
- v2: **Medium Risk** (requires database persistence for production)

---

*Document Version: 2.0*
*Updated: January 3, 2025*
*Author: SmartSpec Security Team*

---

## 12. Implementation Summary

### 12.1 Files Created

| File | Purpose |
|------|--------|
| `app/models/api_key_v2.py` | Database models with versioning |
| `app/services/generation/key_repository.py` | Database operations |
| `app/services/generation/key_service.py` | Main key management service |
| `app/services/generation/key_notifications.py` | Notification service |
| `app/services/generation/key_mfa.py` | MFA service with TOTP |
| `app/routers/keys.py` | API endpoints for key management |
| `app/routers/keys_mfa.py` | API endpoints for MFA |

### 12.2 Security Features Implemented

#### Database Layer
- ✅ Key versioning with `APIKeyVersion` model
- ✅ Comprehensive audit logging with `KeyAuditLog`
- ✅ MFA verification records with `KeyMFAVerification`
- ✅ Rotation scheduling with `KeyRotationSchedule`
- ✅ Proper indexes for performance

#### Encryption
- ✅ Unique salt per key (32 bytes)
- ✅ PBKDF2 with 310,000 iterations
- ✅ Fernet symmetric encryption
- ✅ SHA256 key hashing

#### Key Rotation
- ✅ Grace period support (default 24 hours)
- ✅ Multiple active versions during transition
- ✅ Rate limiting (3 rotations/hour)
- ✅ Automatic version cleanup

#### MFA
- ✅ TOTP (RFC 6238) implementation
- ✅ Backup codes (10 codes)
- ✅ Challenge-response flow
- ✅ Attempt limiting (3 attempts)

#### Notifications
- ✅ Key expiration warnings
- ✅ Rotation reminders
- ✅ Suspicious activity alerts
- ✅ Grace period ending notifications
- ✅ Multi-channel support (email, in-app, webhook, Slack)

### 12.3 API Endpoints

#### Key Management (`/api/keys`)
```
POST   /keys              - Create new key
GET    /keys              - List all keys
GET    /keys/{id}         - Get key details
POST   /keys/{id}/rotate  - Rotate key
POST   /keys/{id}/revoke  - Revoke key
DELETE /keys/{id}         - Delete key
GET    /keys/{id}/audit   - Get key audit log
GET    /keys/audit/all    - Get all audit logs
POST   /keys/validate     - Validate key (internal)
```

#### MFA (`/api/keys/mfa`)
```
GET    /keys/mfa/status              - Get MFA status
POST   /keys/mfa/totp/setup          - Setup TOTP
POST   /keys/mfa/totp/verify-setup   - Verify TOTP setup
POST   /keys/mfa/challenge           - Create MFA challenge
POST   /keys/mfa/verify              - Verify MFA challenge
POST   /keys/mfa/backup-codes/regenerate - Regenerate backup codes
GET    /keys/mfa/backup-codes/count  - Get backup codes count
```

### 12.4 Risk Mitigation Status

| Risk ID | Description | Status | Solution |
|---------|-------------|--------|----------|
| R-001 | Static Salt | ✅ Fixed | Unique 32-byte salt per key |
| R-002 | In-Memory Storage | ✅ Fixed | PostgreSQL with SQLAlchemy |
| R-003 | No Grace Period | ✅ Fixed | 24-hour default grace period |
| R-004 | No Versioning | ✅ Fixed | Full version tracking |
| R-005 | No Audit Trail | ✅ Fixed | Comprehensive audit logging |

### 12.5 Next Steps for Production

1. **Environment Variables**
   - Set `ENCRYPTION_MASTER_KEY` (32+ characters)
   - Configure email service credentials
   - Set up Slack webhook URL

2. **Database Migration**
   ```bash
   alembic revision --autogenerate -m "Add key management v2 tables"
   alembic upgrade head
   ```

3. **Background Tasks**
   - Schedule `cleanup_expired_grace_periods()` (hourly)
   - Schedule `cleanup_expired_mfa_challenges()` (hourly)
   - Schedule `check_and_send_scheduled_notifications()` (hourly)

4. **Monitoring**
   - Set up alerts for suspicious activity
   - Monitor key rotation failures
   - Track MFA failure rates
