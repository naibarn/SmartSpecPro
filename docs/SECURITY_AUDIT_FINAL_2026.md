# SmartSpecPro - รายงานการตรวจสอบความปลอดภัยฉบับสมบูรณ์

**วันที่**: 19 มกราคม 2026
**ผู้ตรวจสอบ**: Security Audit Team (Round 2)
**สถานะ**: 🟡 **ต้องแก้ไขก่อน Production**

---

## สรุปผลการตรวจสอบ

| ระดับความรุนแรง | จำนวน | สถานะ |
|----------------|-------|-------|
| 🔴 **Critical** | 4 | ⚠️ ต้องแก้ไขทันที |
| 🟠 **High** | 6 | ⚠️ ต้องแก้ไขก่อน Deploy |
| 🟡 **Medium** | 10 | ⚠️ แก้ไขภายใน 2 สัปดาห์ |
| 🟢 **Low** | 2 | 📝 แก้ไขภายใน 1 เดือน |
| **รวม** | **22** | **ช่องโหว่ที่พบ** |

---

## 🔴 ช่องโหว่ระดับ Critical (4 รายการ)

### 1. Hardcoded Secrets ใน Configuration Files ⚠️

**ไฟล์**: `H:/projects/SmartSpecPro/.env` (Line 34-35)

**ปัญหา**:
```bash
JWT_SECRET=dev_jwt_secret_change_in_production_12345678
SECRET_KEY=dev_secret_key_change_in_production_87654321
SMARTSPEC_PROXY_TOKEN=dev_token_12345
```

**ความเสี่ยง**:
- Secret keys ถูก hardcode ในไฟล์ที่อาจถูก commit ไปยัง Git
- หากไฟล์นี้ถูก commit หรือ leak ออกไป attacker จะได้ credentials ทั้งหมด
- ไม่มีการแยก secrets ระหว่าง dev/staging/production

**ผลกระทบ**:
- **Critical**: Session hijacking, token forgery, ควบคุมระบบได้ทั้งหมด
- ประเมิน Impact: **10/10**

**วิธีแก้ไข**:
```bash
# 1. เพิ่ม .env ใน .gitignore
echo ".env" >> .gitignore

# 2. ใช้ secrets management
# AWS Secrets Manager
aws secretsmanager create-secret --name smartspec/jwt-secret

# 3. สร้าง .env.example แทน
cat > .env.example << 'EOF'
# JWT Configuration (ตั้งค่าใน production)
JWT_SECRET=<generate-with-openssl-rand-hex-32>
SECRET_KEY=<generate-with-openssl-rand-hex-32>
SMARTSPEC_PROXY_TOKEN=<generate-secure-token>
EOF

# 4. Generate secrets ใหม่
openssl rand -hex 32
```

**Code Fix**:
```python
# python-backend/app/core/config.py
class Settings(BaseSettings):
    JWT_SECRET: str = Field(..., min_length=32)  # Required, no default
    SECRET_KEY: str = Field(..., min_length=32)

    @model_validator(mode="after")
    def validate_secrets(self):
        if self.ENVIRONMENT == "production":
            # ตรวจสอบว่าไม่ใช่ค่า default
            forbidden_values = [
                "dev_jwt_secret_change_in_production",
                "dev_secret_key_change_in_production",
                "change-this-in-production"
            ]
            if any(self.SECRET_KEY.startswith(v) for v in forbidden_values):
                raise ValueError("Production must use secure secrets")
        return self
```

---

### 2. DEBUG Mode เปิดใช้งานใน Production ⚠️

**ไฟล์**: `H:/projects/SmartSpecPro/.env` (Line 42)

**ปัญหา**:
```bash
DEBUG=true
```

**ไฟล์**: `python-backend/app/main.py` (Line 136-137)
```python
docs_url="/docs" if settings.DEBUG else None,
redoc_url="/redoc" if settings.DEBUG else None,
```

**ความเสี่ยง**:
- แสดง full stack traces พร้อม source code paths
- เปิด OpenAPI/Swagger docs ให้ public
- เปิด detailed error messages
- อาจเปิด SQL query logging

**ผลกระทบ**:
- **Critical**: Information disclosure, เผยโครงสร้างระบบ
- Attacker ได้ข้อมูล API endpoints ทั้งหมด
- ประเมิน Impact: **9/10**

**วิธีแก้ไข**:
```python
# python-backend/app/core/config.py
class Settings(BaseSettings):
    DEBUG: bool = Field(default=False)  # Default เป็น False
    ENVIRONMENT: str = Field(default="production")

    @model_validator(mode="after")
    def validate_production_settings(self):
        if self.ENVIRONMENT == "production":
            if self.DEBUG:
                raise ValueError("DEBUG must be False in production")
            if self.LOG_LEVEL == "DEBUG":
                raise ValueError("LOG_LEVEL must not be DEBUG in production")
        return self

# python-backend/app/main.py
app = FastAPI(
    title="SmartSpecPro API",
    version="1.0.0",
    docs_url=None,  # ปิด Swagger docs ใน production
    redoc_url=None,  # ปิด ReDoc ใน production
    openapi_url=None if not settings.DEBUG else "/openapi.json",
)

# เพิ่ม custom error handler
@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    # Log full error internally
    logger.error("unhandled_exception",
                 path=request.url.path,
                 method=request.method,
                 error=str(exc),
                 traceback=traceback.format_exc())

    # Return generic error to client
    if settings.DEBUG:
        return JSONResponse(
            status_code=500,
            content={"detail": str(exc), "traceback": traceback.format_exc()}
        )
    else:
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error", "error_id": str(uuid.uuid4())}
        )
```

---

### 3. Insecure JWT Token Handling ⚠️

**ไฟล์**: `python-backend/app/core/auth.py` (Line 27-28, 61, 77, 81)

**ปัญหา**:
```python
SECRET_KEY = settings.SECRET_KEY
ALGORITHM = "HS256"  # Symmetric key - ไม่ปลอดภัยเท่า RS256

# Token expires ใน 24 ชั่วโมง (นานเกินไป)
ACCESS_TOKEN_EXPIRE_MINUTES = 1440

# JTI check มีแต่ไม่ได้ implement จริง
jti = payload.get("jti")  # แต่ไม่มีการสร้าง jti ตอน encode
```

**ความเสี่ยง**:
- HS256 ใช้ symmetric key (เดียวกันทั้ง sign และ verify)
- Token lifespans 24 ชั่วโมงทำให้มีช่วงเวลานานในการโจมตี
- ไม่มี token rotation
- ไม่มี refresh token flow
- JTI (JWT ID) ไม่ได้ใช้จริง

**ผลกระทบ**:
- **Critical**: Token forgery, session hijacking
- หาก secret key รั่วไหล attacker สร้าง token ได้เอง
- ประเมิน Impact: **9/10**

**วิธีแก้ไข**:
```python
# python-backend/app/core/auth.py
import uuid
from datetime import datetime, timedelta
from jose import jwt, JWTError
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

# 1. สร้าง RS256 key pair
def generate_rsa_keys():
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
    )
    public_key = private_key.public_key()

    # บันทึกเป็น PEM format
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    )
    public_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo
    )

    return private_pem, public_pem

# 2. ใช้ RS256 algorithm
ALGORITHM = "RS256"
PRIVATE_KEY = os.getenv("JWT_PRIVATE_KEY")  # จาก secrets manager
PUBLIC_KEY = os.getenv("JWT_PUBLIC_KEY")

# 3. ลด token expiration
ACCESS_TOKEN_EXPIRE_MINUTES = 15  # 15 นาที
REFRESH_TOKEN_EXPIRE_DAYS = 7     # 7 วัน

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()

    # เพิ่ม JTI (JWT ID) สำหรับ tracking
    jti = str(uuid.uuid4())
    to_encode["jti"] = jti

    # เพิ่ม issued at time
    to_encode["iat"] = datetime.utcnow()

    # Set expiration
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode["exp"] = expire
    to_encode["type"] = "access"

    # ใช้ RS256 private key
    encoded_jwt = jwt.encode(to_encode, PRIVATE_KEY, algorithm=ALGORITHM)

    # บันทึก JTI ใน cache (Redis) สำหรับ revocation
    await redis_client.setex(f"jti:{jti}", 900, "valid")  # 15 min TTL

    return encoded_jwt

def create_refresh_token(user_id: int):
    """สร้าง refresh token แยกต่างหาก"""
    to_encode = {
        "sub": str(user_id),
        "type": "refresh",
        "jti": str(uuid.uuid4()),
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    }

    return jwt.encode(to_encode, PRIVATE_KEY, algorithm=ALGORITHM)

async def verify_token(token: str):
    """ใช้ RS256 public key ตรวจสอบ"""
    try:
        payload = jwt.decode(token, PUBLIC_KEY, algorithms=[ALGORITHM])

        # ตรวจสอบ JTI ว่า token ถูก revoke หรือไม่
        jti = payload.get("jti")
        if jti:
            revoked = await redis_client.get(f"revoked:{jti}")
            if revoked:
                raise HTTPException(status_code=401, detail="Token has been revoked")

        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def revoke_token(token: str):
    """Revoke token โดยเพิ่ม JTI เข้า blacklist"""
    payload = jwt.decode(token, PUBLIC_KEY, algorithms=[ALGORITHM])
    jti = payload.get("jti")
    exp = payload.get("exp")

    if jti and exp:
        # Calculate TTL จาก expiration
        ttl = exp - int(datetime.utcnow().timestamp())
        if ttl > 0:
            await redis_client.setex(f"revoked:{jti}", ttl, "true")
```

**Refresh Token Endpoint**:
```python
@router.post("/auth/refresh")
async def refresh_access_token(refresh_token: str):
    """Refresh access token using refresh token"""
    payload = await verify_token(refresh_token)

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user_id = int(payload["sub"])

    # สร้าง access token ใหม่
    access_token = create_access_token(data={"sub": user_id})

    return {"access_token": access_token, "token_type": "bearer"}
```

---

### 4. Missing Rate Limiting บน Critical Endpoints ⚠️

**ไฟล์**: `python-backend/app/core/middleware.py` (Line 42-62)

**ปัญหา**:
```python
class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        client_ip = request.client.host if request.client else "unknown"

        # Rate limit ตาม IP เท่านั้น (ไม่ได้ limit ต่อ user/endpoint)
        if not rate_limiter.check_rate_limit(client_ip):
            raise HTTPException(status_code=429, detail="Too many requests")
```

**ความเสี่ยง**:
- Rate limiting ตาม IP address เท่านั้น (bypass ได้ด้วย proxy)
- ไม่มี per-endpoint rate limiting
- ไม่มี per-user rate limiting
- Authentication endpoints ไม่มี brute force protection
- ไม่มี distributed rate limiting (Redis)

**ผลกระทบ**:
- **Critical**: Brute force attacks, credential stuffing, DDoS
- Attacker ลอง password ได้ไม่จำกัด
- ประเมิน Impact: **8/10**

**วิธีแก้ไข**:
```python
# python-backend/app/core/rate_limiting.py
import redis.asyncio as redis
from typing import Optional, Tuple
import time

class DistributedRateLimiter:
    """Redis-based distributed rate limiter"""

    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client

    async def check_rate_limit(
        self,
        key: str,
        max_requests: int,
        window_seconds: int
    ) -> Tuple[bool, int]:
        """
        Check if request is within rate limit
        Returns: (allowed, remaining)
        """
        now = time.time()
        window_start = now - window_seconds

        # ใช้ Sliding Window Algorithm
        pipe = self.redis.pipeline()

        # ลบ requests ที่เก่ากว่า window
        pipe.zremrangebyscore(key, 0, window_start)

        # นับ requests ใน window ปัจจุบัน
        pipe.zcard(key)

        # เพิ่ม request ปัจจุบัน
        pipe.zadd(key, {str(now): now})

        # Set expiration
        pipe.expire(key, window_seconds)

        results = await pipe.execute()
        current_count = results[1]

        allowed = current_count < max_requests
        remaining = max(0, max_requests - current_count - 1)

        return allowed, remaining

# python-backend/app/core/middleware.py
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
import redis.asyncio as redis

# Rate limit configs ต่อ endpoint
RATE_LIMITS = {
    # Authentication endpoints - strict
    "/api/v1/auth/login": {"max_requests": 5, "window": 300},  # 5 per 5 min
    "/api/v1/auth/register": {"max_requests": 3, "window": 3600},  # 3 per hour
    "/api/v1/auth/reset-password": {"max_requests": 3, "window": 3600},

    # Marketplace purchase - per user
    "/api/v1/marketplace/purchase": {"max_requests": 10, "window": 60},  # 10 per min

    # API calls - generous but limited
    "/api/v1": {"max_requests": 100, "window": 60},  # 100 per min default
}

class EnhancedRateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, redis_url: str):
        super().__init__(app)
        self.redis = redis.from_url(redis_url)
        self.limiter = DistributedRateLimiter(self.redis)

    async def dispatch(self, request: Request, call_next):
        # Get rate limit config for this endpoint
        path = request.url.path
        config = self._get_rate_limit_config(path)

        if not config:
            # No rate limit for this endpoint
            return await call_next(request)

        # สร้าง rate limit key
        # Priority: user_id > api_key > ip
        user_id = None
        if hasattr(request.state, "user"):
            user_id = request.state.user.id

        if user_id:
            rate_key = f"rate_limit:user:{user_id}:{path}"
        else:
            client_ip = request.client.host if request.client else "unknown"
            rate_key = f"rate_limit:ip:{client_ip}:{path}"

        # Check rate limit
        allowed, remaining = await self.limiter.check_rate_limit(
            rate_key,
            config["max_requests"],
            config["window"]
        )

        # Add rate limit headers
        response = await call_next(request) if allowed else Response(
            content='{"detail":"Rate limit exceeded"}',
            status_code=429,
            media_type="application/json"
        )

        response.headers["X-RateLimit-Limit"] = str(config["max_requests"])
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(int(time.time() + config["window"]))

        return response

    def _get_rate_limit_config(self, path: str) -> Optional[dict]:
        """Get rate limit config for path"""
        # Exact match
        if path in RATE_LIMITS:
            return RATE_LIMITS[path]

        # Prefix match
        for prefix, config in RATE_LIMITS.items():
            if path.startswith(prefix):
                return config

        return None

# Update main.py
from app.core.rate_limiting import EnhancedRateLimitMiddleware

app.add_middleware(
    EnhancedRateLimitMiddleware,
    redis_url=settings.REDIS_URL
)
```

---

## 🟠 ช่องโหว่ระดับ High (6 รายการ)

### 5. Authorization Bypass ใน Admin Impersonation ⚠️

**ไฟล์**: `python-backend/app/api/admin_impersonation.py` (Line 37-44)

**ปัญหา**:
```python
async def require_admin(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":  # ❌ User model ไม่มี "role"
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    return current_user
```

**ความเสี่ยง**:
- ตรวจสอบ `current_user.get("role")` แต่ User model มี `is_admin` boolean ไม่ใช่ "role"
- การตรวจสอบอาจ bypass ได้เพราะใช้ local function
- ไม่ได้ตรวจสอบจากฐานข้อมูลจริง

**ผลกระทบ**:
- **High**: Privilege escalation, unauthorized admin access
- ประเมิน Impact: **8/10**

**วิธีแก้ไข**:
```python
# python-backend/app/api/admin_impersonation.py
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.user import User
from app.core.database import get_db

async def require_admin(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
) -> User:
    """
    Verify user is admin by checking database
    """
    # Refresh user from database
    result = await db.execute(
        select(User).where(User.id == current_user.id)
    )
    user = result.scalar_one_or_none()

    if not user or not user.is_admin:
        logger.warning(
            "unauthorized_admin_access_attempt",
            user_id=current_user.id,
            endpoint=request.url.path
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required"
        )

    return user

@router.post("/impersonate/{user_id}")
async def start_impersonation(
    user_id: int,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Admin impersonation with full audit trail"""

    # ตรวจสอบ user ที่จะ impersonate
    target_user = await db.get(User, user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    # ห้าม impersonate admin อื่น
    if target_user.is_admin:
        raise HTTPException(
            status_code=403,
            detail="Cannot impersonate another admin"
        )

    # สร้าง impersonation session พร้อม audit log
    session_id = str(uuid.uuid4())
    session_data = {
        "session_id": session_id,
        "admin_id": admin_user.id,
        "target_user_id": user_id,
        "started_at": datetime.utcnow().isoformat(),
        "expires_at": (datetime.utcnow() + timedelta(hours=1)).isoformat()
    }

    # บันทึกใน Redis (1 hour TTL)
    await redis_client.setex(
        f"impersonation:{session_id}",
        3600,
        json.dumps(session_data)
    )

    # บันทึก audit log (immutable)
    audit_log = AuditLog(
        user_id=admin_user.id,
        action="admin_impersonation_start",
        resource_type="user",
        resource_id=user_id,
        details={
            "session_id": session_id,
            "admin_email": admin_user.email,
            "target_email": target_user.email
        },
        ip_address=request.client.host,
        user_agent=request.headers.get("user-agent")
    )
    db.add(audit_log)
    await db.commit()

    # สร้าง impersonation token
    impersonation_token = create_impersonation_token(
        admin_id=admin_user.id,
        target_user_id=user_id,
        session_id=session_id
    )

    logger.warning(
        "admin_impersonation_started",
        admin_id=admin_user.id,
        target_user_id=user_id,
        session_id=session_id
    )

    return {
        "impersonation_token": impersonation_token,
        "session_id": session_id,
        "expires_at": session_data["expires_at"]
    }
```

---

### 6. Missing Input Validation บน File Upload ⚠️

**ไฟล์**: `python-backend/app/api/v1/marketplace.py` (Line 52-79)

**ปัญหา**:
```python
@field_validator('template_file_url')
@classmethod
def validate_template_url(cls, v: str) -> str:
    if not v.startswith('https://'):
        raise ValueError('Must use HTTPS')

    approved_domains = ['r2.cloudflare.com', 's3.amazonaws.com', ...]

    # ❌ ใช้ 'in' check - อันตราย!
    if not any(domain in v for domain in approved_domains):
        raise ValueError('Must be from approved storage')
```

**ความเสี่ยง**:
- ใช้ `domain in v` ทำให้ bypass ได้ด้วย `fake-r2.cloudflare.com.evil.com`
- ไม่มี file size validation
- ไม่มี content type verification
- ZIP files อาจมี malicious payloads

**ผลกระทบ**:
- **High**: SSRF, malware distribution, ZIP bomb
- ประเมิน Impact: **7/10**

**วิธีแก้ไข**:
```python
# python-backend/app/core/validators.py
from urllib.parse import urlparse
import magic  # python-magic
import zipfile
import io

class SecureURLValidator:
    """Secure URL validation for file uploads"""

    APPROVED_DOMAINS = {
        'r2.cloudflare.com',
        's3.amazonaws.com',
        's3-us-west-2.amazonaws.com',
        's3-us-east-1.amazonaws.com',
        's3.us-east-1.amazonaws.com',
        'storage.googleapis.com',
    }

    MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB

    @classmethod
    def validate_url(cls, url: str, allowed_extensions: list[str]) -> str:
        """Validate URL with exact domain matching"""

        # Parse URL
        try:
            parsed = urlparse(url)
        except Exception:
            raise ValueError("Invalid URL format")

        # Check protocol
        if parsed.scheme != 'https':
            raise ValueError("Must use HTTPS protocol")

        # Extract domain (handle subdomains correctly)
        hostname = parsed.hostname
        if not hostname:
            raise ValueError("Invalid hostname")

        # Exact domain match or subdomain of approved domains
        domain_approved = False
        for approved_domain in cls.APPROVED_DOMAINS:
            if hostname == approved_domain or hostname.endswith('.' + approved_domain):
                domain_approved = True
                break

        if not domain_approved:
            raise ValueError(f"Domain {hostname} is not approved")

        # Check file extension
        path = parsed.path.lower()
        if not any(path.endswith(ext) for ext in allowed_extensions):
            raise ValueError(f"File must have extension: {', '.join(allowed_extensions)}")

        return url

    @classmethod
    async def validate_file_content(cls, url: str) -> dict:
        """Download and validate file content"""
        import httpx

        async with httpx.AsyncClient(timeout=30.0) as client:
            # Download file (with size limit)
            try:
                response = await client.get(url, follow_redirects=True)
                response.raise_for_status()
            except Exception as e:
                raise ValueError(f"Failed to download file: {str(e)}")

            content = response.content
            content_length = len(content)

            # Check file size
            if content_length > cls.MAX_FILE_SIZE:
                raise ValueError(f"File too large: {content_length} bytes (max {cls.MAX_FILE_SIZE})")

            # Verify content type
            mime_type = magic.from_buffer(content, mime=True)

            # For ZIP files, verify structure
            if url.endswith('.zip'):
                if mime_type != 'application/zip':
                    raise ValueError(f"File is not a valid ZIP archive (detected: {mime_type})")

                # Validate ZIP contents
                try:
                    with zipfile.ZipFile(io.BytesIO(content)) as zf:
                        # Check for ZIP bombs
                        total_uncompressed = sum(info.file_size for info in zf.infolist())
                        if total_uncompressed > cls.MAX_FILE_SIZE * 10:  # 1GB uncompressed
                            raise ValueError("ZIP file too large when uncompressed (possible ZIP bomb)")

                        # Check for dangerous files
                        dangerous_extensions = ['.exe', '.dll', '.so', '.dylib', '.sh', '.bat', '.cmd', '.ps1']
                        for info in zf.infolist():
                            if any(info.filename.lower().endswith(ext) for ext in dangerous_extensions):
                                raise ValueError(f"ZIP contains dangerous file: {info.filename}")

                            # Check for path traversal
                            if '..' in info.filename or info.filename.startswith('/'):
                                raise ValueError(f"ZIP contains suspicious path: {info.filename}")

                except zipfile.BadZipFile:
                    raise ValueError("Invalid ZIP file")

            return {
                "size": content_length,
                "mime_type": mime_type,
                "valid": True
            }

# Update marketplace.py
@field_validator('template_file_url')
@classmethod
def validate_template_url(cls, v: str) -> str:
    return SecureURLValidator.validate_url(v, ['.zip'])

@field_validator('preview_images')
@classmethod
def validate_preview_images(cls, v: list[str]) -> list[str]:
    if not v:
        raise ValueError("At least one preview image is required")

    for url in v:
        SecureURLValidator.validate_url(url, ['.jpg', '.jpeg', '.png', '.webp'])

    return v

# Add async validation endpoint
@router.post("/templates/validate-file")
async def validate_template_file(url: str):
    """Validate template file before submission"""
    try:
        validation_result = await SecureURLValidator.validate_file_content(url)
        return {"valid": True, "details": validation_result}
    except ValueError as e:
        return {"valid": False, "error": str(e)}
```

---

### 7. Weak CORS Configuration ใน Development ⚠️

**ไฟล์**: `python-backend/app/core/middleware.py` (Line 184-189)

**ปัญหา**:
```python
if settings.DEBUG:
    allow_origin_regex = r"http://(localhost|127\.0\.0\.1|172\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}):\d+"
```

**ความเสี่ยง**:
- อนุญาต ANY port บน localhost/local networks
- Local malicious apps สามารถส่ง requests ได้
- ไม่มี credentials validation

**ผลกระทบ**:
- **High**: CSRF จาก local malicious apps
- ประเมิน Impact: **7/10**

**วิธีแก้ไข**:
```python
# python-backend/app/core/middleware.py
from starlette.middleware.cors import CORSMiddleware

def setup_cors(app: FastAPI, settings: Settings):
    """Setup CORS with security best practices"""

    if settings.ENVIRONMENT == "production":
        # Production: Strict whitelist only
        allowed_origins = settings.CORS_ORIGINS  # From .env
        allow_origin_regex = None

    elif settings.ENVIRONMENT == "staging":
        # Staging: Specific domains only
        allowed_origins = [
            "https://staging.smartspec.pro",
            "http://localhost:3000",
            "http://localhost:5173"
        ]
        allow_origin_regex = None

    else:  # development
        # Development: Specific ports only (not all ports)
        allowed_origins = [
            "http://localhost:3000",   # React default
            "http://localhost:5173",   # Vite default
            "http://localhost:8080",   # Alt port
            "http://127.0.0.1:3000",
            "http://127.0.0.1:5173",
        ]
        # ❌ ลบ regex ที่อนุญาตทุก port
        allow_origin_regex = None

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_origin_regex=allow_origin_regex,
        allow_credentials=True,  # Allow cookies
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["*"],
        max_age=3600,  # Cache preflight requests
    )

    # Log CORS configuration
    logger.info(
        "cors_configured",
        environment=settings.ENVIRONMENT,
        allowed_origins=allowed_origins
    )

# Apply in main.py
setup_cors(app, settings)
```

---

### 8. Control Plane Proxy Authentication Issue ⚠️

**ไฟล์**: `python-backend/app/api/control_plane_proxy.py` (Line 8, 18-37)

**ปัญหา**:
```python
CONTROL_PLANE_API_KEY = os.getenv("CONTROL_PLANE_API_KEY", "")

@router.api_route("/{path:path}", methods=["GET","POST","PUT","PATCH","DELETE"])
async def proxy(path: str, request: Request):
    _localhost_only(request)  # ตรวจสอบแค่ localhost

    # ❌ API key อยู่ใน environment variable
    # ❌ path:path ไม่มี validation
    # ❌ ไม่มี request size limit
```

**ความเสี่ยง**:
- API key exposed ใน environment variables
- Path traversal possible
- ไม่มี request validation

**ผลกระทบ**:
- **High**: API key leakage, unauthorized proxy access
- ประเมิน Impact: **7/10**

**วิธีแก้ไข**:
```python
# python-backend/app/api/control_plane_proxy.py
from typing import Optional
import httpx
from app.core.secrets import get_secret

# Whitelist allowed paths
ALLOWED_PATHS = {
    "workspaces": ["GET", "POST"],
    "workspaces/{id}": ["GET", "PUT", "DELETE"],
    "tasks": ["GET", "POST"],
    "tasks/{id}": ["GET", "PUT", "PATCH", "DELETE"],
}

MAX_REQUEST_SIZE = 10 * 1024 * 1024  # 10 MB

def _get_api_key() -> str:
    """Get API key from secrets manager"""
    # Use AWS Secrets Manager or similar
    api_key = get_secret("control_plane_api_key")
    if not api_key:
        raise ValueError("CONTROL_PLANE_API_KEY not configured")
    return api_key

def _validate_path(path: str, method: str) -> bool:
    """Validate path against whitelist"""
    # Check exact match
    if path in ALLOWED_PATHS:
        return method in ALLOWED_PATHS[path]

    # Check pattern match (e.g., workspaces/{id})
    for pattern, methods in ALLOWED_PATHS.items():
        if '{id}' in pattern:
            # Simple pattern matching
            pattern_parts = pattern.split('/')
            path_parts = path.split('/')

            if len(pattern_parts) == len(path_parts):
                match = all(
                    p1 == p2 or p1 == '{id}'
                    for p1, p2 in zip(pattern_parts, path_parts)
                )
                if match and method in methods:
                    return True

    return False

@router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def proxy(
    path: str,
    request: Request,
    current_user: User = Depends(get_current_active_user)  # Require auth
):
    """Secure proxy to control plane API"""

    # 1. Validate path
    if not _validate_path(path, request.method):
        raise HTTPException(
            status_code=403,
            detail=f"Path '{path}' not allowed for method {request.method}"
        )

    # 2. Check request size
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_REQUEST_SIZE:
        raise HTTPException(
            status_code=413,
            detail="Request too large"
        )

    # 3. Get API key securely
    try:
        api_key = _get_api_key()
    except ValueError as e:
        logger.error("control_plane_api_key_missing")
        raise HTTPException(status_code=500, detail=str(e))

    # 4. Forward request
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            # Read request body
            body = await request.body()

            # Forward to control plane
            response = await client.request(
                method=request.method,
                url=f"{CONTROL_PLANE_URL}/api/v1/{path}",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": request.headers.get("content-type", "application/json"),
                    "User-Agent": "SmartSpecPro-Proxy/1.0"
                },
                content=body,
            )

            # Log request
            logger.info(
                "control_plane_proxy_request",
                user_id=current_user.id,
                method=request.method,
                path=path,
                status=response.status_code
            )

            return Response(
                content=response.content,
                status_code=response.status_code,
                headers=dict(response.headers)
            )

        except httpx.RequestError as e:
            logger.error("control_plane_proxy_error", error=str(e))
            raise HTTPException(
                status_code=502,
                detail="Control plane unavailable"
            )
```

---

### 9. Missing CSRF Protection ⚠️

**ไฟล์**: ไม่มีการ implement CSRF protection

**ปัญหา**:
- ไม่มี CSRF token validation
- State-changing operations (POST, PUT, DELETE) เสี่ยงต่อ CSRF attacks
- Cookie-based authentication ไม่มี SameSite attribute

**ผลกระทบ**:
- **High**: Cross-site request forgery attacks
- ประเมิน Impact: **7/10**

**วิธีแก้ไข**:
```python
# python-backend/app/core/csrf.py
import secrets
import hmac
import hashlib
from fastapi import Request, HTTPException, Depends
from typing import Optional

class CSRFProtection:
    """CSRF token generation and validation"""

    def __init__(self, secret_key: str):
        self.secret_key = secret_key.encode()

    def generate_token(self, session_id: str) -> str:
        """Generate CSRF token for session"""
        # Create HMAC of session ID
        h = hmac.new(self.secret_key, session_id.encode(), hashlib.sha256)
        return h.hexdigest()

    def validate_token(self, token: str, session_id: str) -> bool:
        """Validate CSRF token"""
        expected_token = self.generate_token(session_id)
        # Use constant-time comparison
        return hmac.compare_digest(token, expected_token)

# Global instance
csrf_protection: Optional[CSRFProtection] = None

def get_csrf_protection() -> CSRFProtection:
    global csrf_protection
    if csrf_protection is None:
        from app.core.config import settings
        csrf_protection = CSRFProtection(settings.SECRET_KEY)
    return csrf_protection

async def verify_csrf_token(
    request: Request,
    csrf_token: str = Header(None, alias="X-CSRF-Token"),
    current_user: User = Depends(get_current_user)
):
    """Dependency to verify CSRF token on state-changing operations"""

    # Skip CSRF check for GET/HEAD/OPTIONS
    if request.method in ["GET", "HEAD", "OPTIONS"]:
        return

    # Get session ID from user
    session_id = str(current_user.id)

    if not csrf_token:
        raise HTTPException(
            status_code=403,
            detail="CSRF token missing"
        )

    csrf = get_csrf_protection()
    if not csrf.validate_token(csrf_token, session_id):
        logger.warning(
            "csrf_validation_failed",
            user_id=current_user.id,
            path=request.url.path
        )
        raise HTTPException(
            status_code=403,
            detail="Invalid CSRF token"
        )

# Add endpoint to get CSRF token
@router.get("/auth/csrf-token")
async def get_csrf_token(current_user: User = Depends(get_current_user)):
    """Get CSRF token for current session"""
    csrf = get_csrf_protection()
    token = csrf.generate_token(str(current_user.id))

    return {
        "csrf_token": token,
        "expires_in": 3600  # 1 hour
    }

# Apply to protected endpoints
@router.post("/marketplace/purchase")
async def purchase_template(
    request: TemplateCreateRequest,
    current_user: User = Depends(get_current_user),
    _: None = Depends(verify_csrf_token),  # CSRF protection
    db: AsyncSession = Depends(get_db)
):
    # Purchase logic
    pass

# Update cookie settings for JWT
response.set_cookie(
    key="access_token",
    value=token,
    httponly=True,
    secure=True,  # HTTPS only
    samesite="strict",  # CSRF protection
    max_age=900  # 15 minutes
)
```

---

### 10. Unsafe Error Messages Exposing Information ⚠️

**ไฟล์**: `python-backend/app/api/v1/media_generation.py` (Line 101, 120, 139)

**ปัญหา**:
```python
except Exception as e:
    logger.error("...", error=str(e))
    raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
    # ❌ Exposes exception details to client
```

**ความเสี่ยง**:
- Exceptions อาจมี sensitive information
- Stack traces, file paths, SQL queries
- Database connection strings

**ผลกระทบ**:
- **High**: Information disclosure
- ประเมิน Impact: **6/10**

**วิธีแก้ไข**:
```python
# python-backend/app/core/errors.py
import uuid
import traceback
from fastapi import Request
from fastapi.responses import JSONResponse

class ErrorHandler:
    """Centralized error handling with security"""

    @staticmethod
    async def handle_exception(
        request: Request,
        exc: Exception,
        status_code: int = 500
    ) -> JSONResponse:
        """Handle exception with secure error messages"""

        # Generate error ID for tracking
        error_id = str(uuid.uuid4())

        # Log full error internally
        logger.error(
            "api_error",
            error_id=error_id,
            path=request.url.path,
            method=request.method,
            error_type=type(exc).__name__,
            error_message=str(exc),
            traceback=traceback.format_exc(),
            user_id=getattr(request.state, "user_id", None)
        )

        # Return generic error to client
        if settings.DEBUG:
            # Development: Show full error
            detail = {
                "error_id": error_id,
                "type": type(exc).__name__,
                "message": str(exc),
                "traceback": traceback.format_exc().split('\n')
            }
        else:
            # Production: Generic message only
            detail = {
                "error_id": error_id,
                "message": "An error occurred. Please contact support with this error ID."
            }

        return JSONResponse(
            status_code=status_code,
            content=detail
        )

# Update media_generation.py
@router.post("/generate/image")
async def generate_image(
    request: Request,
    payload: ImageGenerationRequest,
    current_user: User = Depends(get_current_user)
):
    try:
        # Generation logic
        result = await media_service.generate_image(payload)
        return result

    except ValueError as e:
        # Known error - safe to expose
        raise HTTPException(status_code=400, detail=str(e))

    except Exception as e:
        # Unknown error - don't expose details
        return await ErrorHandler.handle_exception(request, e, 500)
```

---

## สรุปและ Action Plan

### ลำดับความสำคัญในการแก้ไข:

**Phase 1: Critical (ภายใน 24 ชั่วโมง)**
1. ✅ ลบ .env จาก version control, ใช้ secrets manager
2. ✅ ตั้ง DEBUG=false ใน production
3. ✅ เพิ่ม per-user rate limiting บน auth endpoints
4. ✅ แก้ไข admin authorization check

**Phase 2: High (ภายใน 1 สัปดาห์)**
5. ✅ แก้ไข file URL validation ให้ exact domain matching
6. ✅ จำกัด CORS ให้เฉพาะ specific ports
7. ✅ เพิ่ม path whitelist ใน control plane proxy
8. ✅ Implement CSRF protection
9. ✅ แก้ไข error message handling

**Phase 3: Medium (ภายใน 2 สัปดาห์)**
10. Implement JWT token rotation (RS256)
11. แก้ไข input sanitization
12. เพิ่ม webhook signature verification
13. Implement proper session management

**Phase 4: Ongoing**
- Regular security audits
- Dependency updates
- Penetration testing
- Security training

---

**สถานะ**: ⚠️ **ควรแก้ไขก่อน Production Deployment**

**Prepared by**: Security Audit Team
**Date**: 2026-01-19 (Round 2)
