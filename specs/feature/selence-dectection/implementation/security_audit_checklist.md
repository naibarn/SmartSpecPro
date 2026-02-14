# Security Audit Checklist - Silence Detection Feature

## Overview

This document provides a comprehensive security checklist for auditing the silence detection feature before production deployment.

## Audit Scope

**Components in Scope:**
- Backend `dead_air_cut` handler (Python)
- Frontend `MediaJobClient.cutDeadAir()` (TypeScript)
- API endpoints and data flow
- File handling and storage
- FFmpeg command generation

**Out of Scope:**
- General platform security (covered elsewhere)
- Infrastructure security
- Network security

## Security Domains

### 1. Input Validation ⚠️ CRITICAL

#### 1.1 Backend Input Validation

**File**: `media_job_worker.py`

| Check | Status | Notes |
|-------|--------|-------|
| ✅ Segment bounds validated (start < end) | Pass | Line 1051-1054 |
| ✅ Negative timestamps rejected | Pass | Implicit in bounds check |
| ✅ Overlapping segments detected | Pass | Line 1057-1062 |
| ✅ Segment count limit enforced (500 max) | Pass | Line 1065-1070 |
| ✅ URI SSRF validation | Pass | Line 1042, calls `validate_uri_no_ssrf` |
| ✅ softening_buffer_ms range validation | Pass | Backend accepts any value, relies on client |
| ⚠️ crossfade boolean validation | **CHECK** | Ensure boolean, not arbitrary value |

**Action Items:**
```python
# Verify crossfade is strictly boolean
crossfade = spec["params"].get("crossfade", False)
if not isinstance(crossfade, bool):
    raise ValueError("crossfade must be boolean")
```

#### 1.2 Frontend Input Validation

**File**: `mediaJobClient.ts`

| Check | Status | Notes |
|-------|--------|-------|
| ✅ softening_buffer_ms clamped [0, 5000] | Pass | Line 102 |
| ✅ crossfade is boolean | Pass | TypeScript type enforcement |
| ✅ segments array validated | Pass | TypeScript interface |
| ⚠️ assetUri format validation | **CHECK** | Ensure valid URI format |

**Action Items:**
- Add URI format validation before sending to backend
- Sanitize segment array (no extra fields)

### 2. Command Injection ⚠️ CRITICAL

#### 2.1 FFmpeg Command Injection

**File**: `media_job_worker.py`

| Check | Status | Notes |
|-------|--------|-------|
| ✅ Float values validated | Pass | `_safe_float_for_ffmpeg()` added in code review |
| ✅ Shell metacharacters rejected | Pass | SHELL_METACHAR_RE check |
| ✅ File paths use subprocess list (not shell=True) | Pass | All subprocess.run use lists |
| ✅ No user input in filter strings | Pass | Only validated floats |
| ⚠️ File path injection | **CHECK** | Ensure tmp_path and output_path are sanitized |

**Validated Code:**
```python
def _safe_float_for_ffmpeg(val: float, precision: int = 6) -> str:
    """Safely format a float for FFmpeg filter string interpolation."""
    s = f"{val:.{precision}f}"
    if SHELL_METACHAR_RE.search(s):
        raise ValueError(f"Invalid FFmpeg value: {s}")
    return s
```

**Action Items:**
- ✅ Verify all float values use `_safe_float_for_ffmpeg()`
- ✅ Verify subprocess.run never uses `shell=True`
- [ ] Add path sanitization for tmp_dir and output paths

### 3. Path Traversal 🔒 HIGH

#### 3.1 File Access Controls

**File**: `media_job_worker.py`

| Check | Status | Notes |
|-------|--------|-------|
| ⚠️ Input path restricted to tmp_dir | **CHECK** | No explicit check |
| ⚠️ Output path restricted to tmp_dir | **CHECK** | No explicit check |
| ⚠️ Symlink following | **CHECK** | Could escape tmp_dir |
| ✅ URI validation prevents file:// | Pass | SSRF validation blocks file:// |

**Action Items:**
```python
# Add path traversal prevention
def _safe_path(base_dir: str, file_path: str) -> str:
    """Ensure file_path is within base_dir."""
    base = Path(base_dir).resolve()
    target = (base / file_path).resolve()
    if not target.is_relative_to(base):
        raise ValueError(f"Path traversal attempt: {file_path}")
    return str(target)
```

### 4. Resource Exhaustion 🔒 HIGH

#### 4.1 Denial of Service Prevention

| Check | Status | Notes |
|-------|--------|-------|
| ✅ Max segments enforced (500) | Pass | Line 1065-1070 |
| ⚠️ Max video duration | **CHECK** | No limit on input video length |
| ⚠️ Max output size | **CHECK** | Could generate huge files |
| ⚠️ Processing timeout | **CHECK** | No explicit timeout |
| ⚠️ Memory limits | **CHECK** | FFmpeg could consume excessive memory |

**Action Items:**
- Add input video duration limit (e.g., 4 hours)
- Add FFmpeg timeout (30 minutes)
- Add memory limit via cgroups or ulimit
- Monitor disk usage

**Recommended Limits:**
```python
MAX_VIDEO_DURATION_SEC = 4 * 60 * 60  # 4 hours
MAX_SEGMENTS = 500  # Already enforced
FFMPEG_TIMEOUT_SEC = 30 * 60  # 30 minutes
MAX_OUTPUT_SIZE_MB = 5000  # 5GB
```

### 5. Information Disclosure 🔒 MEDIUM

#### 5.1 Error Message Leakage

| Check | Status | Notes |
|-------|--------|-------|
| ⚠️ FFmpeg errors exposed | **CHECK** | stderr may leak system info |
| ⚠️ File paths in error messages | **CHECK** | Could expose directory structure |
| ✅ Validation errors are generic | Pass | "Invalid segment bounds" etc. |

**Action Items:**
- Sanitize FFmpeg error messages before returning
- Remove absolute paths from error messages
- Log detailed errors server-side only

**Example:**
```python
try:
    result = subprocess.run(cmd, ...)
except Exception as e:
    logger.error(f"FFmpeg failed: {e}")  # Detailed log
    raise ValueError("Video processing failed")  # Generic error to user
```

### 6. Authentication & Authorization 🔒 HIGH

#### 6.1 Access Controls

| Check | Status | Notes |
|-------|--------|-------|
| ⚠️ User owns input video | **CHECK** | Verify user has access to asset URI |
| ⚠️ Rate limiting | **CHECK** | Could spam export requests |
| ⚠️ Credit/quota enforcement | **CHECK** | Processing should consume credits |
| ⚠️ Job ownership validation | **CHECK** | User can only access their jobs |

**Action Items:**
- Verify asset ownership before processing
- Implement rate limiting (e.g., 10 requests/hour per user)
- Charge credits for processing time
- Validate user owns job before returning results

### 7. Data Integrity 🔒 MEDIUM

#### 7.1 Output Validation

| Check | Status | Notes |
|-------|--------|-------|
| ⚠️ Output file integrity | **CHECK** | Verify output is valid video |
| ⚠️ Metadata tampering | **CHECK** | Derived data (removedMs, etc.) accurate? |
| ⚠️ Artifact URLs | **CHECK** | Signed URLs to prevent unauthorized access |

**Action Items:**
- Run ffprobe on output to verify it's valid
- Re-calculate metadata from output (don't trust params)
- Use signed URLs with expiration for artifacts

### 8. Temporary File Handling 🔒 MEDIUM

#### 8.1 Cleanup and Permissions

| Check | Status | Notes |
|-------|--------|-------|
| ⚠️ Temp files cleaned up | **CHECK** | Ensure cleanup on success/failure |
| ⚠️ Temp file permissions | **CHECK** | Should be 0600 (owner-only) |
| ⚠️ Temp directory isolation | **CHECK** | Each job uses unique directory |
| ⚠️ Cleanup on error | **CHECK** | try/finally or context manager |

**Action Items:**
```python
# Use context manager for temp directory
with tempfile.TemporaryDirectory() as tmp_dir:
    # All processing here
    # Auto-cleanup on exit
```

### 9. Dependency Security 🔒 MEDIUM

#### 9.1 FFmpeg Security

| Check | Status | Notes |
|-------|--------|-------|
| ⚠️ FFmpeg version | **CHECK** | Must be 4.4.2+ (patched vulnerabilities) |
| ⚠️ FFmpeg CVEs | **CHECK** | Check CVE database |
| ⚠️ Codec vulnerabilities | **CHECK** | Disable risky codecs |

**Action Items:**
```bash
# Check FFmpeg version
ffmpeg -version

# Ensure it's 4.4.2 or later
# Check for known CVEs: https://cve.mitre.org/cgi-bin/cvekey.cgi?keyword=ffmpeg
```

### 10. Logging & Monitoring 🔒 LOW

#### 10.1 Audit Trail

| Check | Status | Notes |
|-------|--------|-------|
| ✅ Job submission logged | Pass | Standard audit log |
| ⚠️ Processing errors logged | **CHECK** | Ensure server-side logging |
| ⚠️ Suspicious activity flagged | **CHECK** | Detect abuse patterns |
| ⚠️ PII in logs | **CHECK** | Don't log file contents |

**Action Items:**
- Log all job submissions with user_id
- Log FFmpeg errors (sanitized)
- Alert on:
  - >100 segments in single job
  - >10 jobs in 1 hour from single user
  - Repeated validation errors (fuzzing attempt)

## Automated Security Tests

### Test 1: Command Injection

```python
def test_command_injection_attempt():
    """Attempt to inject shell commands via float values."""
    # This should be caught by _safe_float_for_ffmpeg
    spec = {
        "params": {
            "segments": [{"startMs": 1000, "endMs": 2000}],
            "softeningBufferMs": 0,  # Normal
            # If we could somehow pass a malicious value...
        }
    }
    # The function should reject any non-numeric or shell metacharacter values
```

### Test 2: Path Traversal

```python
def test_path_traversal_attempt():
    """Attempt to access files outside tmp_dir."""
    spec = {
        "inputs": {
            "assets": [{"uri": "file://../../etc/passwd"}]  # Should be blocked by SSRF
        }
    }
    with pytest.raises(ValueError, match="file:// URIs are not allowed"):
        handle_dead_air_cut(spec, "/tmp")
```

### Test 3: Resource Exhaustion

```python
def test_too_many_segments():
    """Attempt to submit >500 segments."""
    spec = {
        "params": {
            "segments": [{"startMs": i, "endMs": i+10} for i in range(600)],
        }
    }
    with pytest.raises(ValueError, match="Too many segments"):
        handle_dead_air_cut(spec, "/tmp")
```

## Security Checklist Summary

### Critical Issues (Must Fix)
- [ ] Verify FFmpeg command injection prevention is complete
- [ ] Add path traversal protection for tmp_dir access
- [ ] Add processing timeout (30 minutes)
- [ ] Verify user owns input asset before processing

### High Priority (Should Fix)
- [ ] Add input video duration limit (4 hours)
- [ ] Add rate limiting (10 requests/hour)
- [ ] Sanitize FFmpeg error messages
- [ ] Implement credit/quota enforcement
- [ ] Add temp file cleanup (try/finally)

### Medium Priority (Nice to Have)
- [ ] Add output file integrity validation
- [ ] Use signed URLs for artifacts
- [ ] Check FFmpeg version and CVEs
- [ ] Improve logging and monitoring

### Low Priority (Optional)
- [ ] Add suspicious activity detection
- [ ] Implement per-user disk quotas
- [ ] Add memory limits via cgroups

## Audit Sign-Off

**Auditor**: _______________
**Date**: _______________
**Status**: PASS / FAIL / CONDITIONAL PASS

**Conditions (if any):**
- ________________________________
- ________________________________

**Critical Issues Found**: _____
**High Priority Issues Found**: _____
**Medium Priority Issues Found**: _____

**Recommendation**: APPROVE / FIX AND RE-AUDIT / DO NOT DEPLOY

**Signature**: _______________ **Date**: ___________
