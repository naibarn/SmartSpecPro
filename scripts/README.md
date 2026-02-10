# SmartSpecPro Scripts

Collection of utility scripts for managing and validating SmartSpecPro services.

## Database Configuration Validator

**File**: `validate-db-config.sh`

**Purpose**: ตรวจสอบว่า credentials ใน `.env` ตรงกับ `docker-compose.yml` หรือไม่ เพื่อป้องกันปัญหา authentication failure

**Usage**:
```bash
./scripts/validate-db-config.sh
```

**What it checks**:
- ✅ PostgreSQL username matches
- ✅ PostgreSQL password matches  
- ✅ Database name matches
- ⚠️  Warns if using external volume (may have old credentials)

**Exit codes**:
- `0` = All credentials match
- `1` = Configuration mismatch found

**Auto-runs**: This script runs automatically when you execute `./run-services.sh start`

## How it prevents the database issue

### Problem it solves:
เมื่อใช้ external volume ใน docker-compose.yml, PostgreSQL container จะใช้ข้อมูลเก่าที่มี password ต่างจาก .env ทำให้เกิด authentication failure

### Solution:
1. Validates credentials **before** starting services
2. Detects mismatches early (before containers start)
3. Provides clear error messages with fix instructions
4. Prevents services from starting with wrong config

## Fixing mismatches

If validation fails, you have 2 options:

### Option 1: Update .env to match docker-compose.yml
```bash
# Edit apps/web/.env
DATABASE_URL=postgresql://smartspec:smartspec123@localhost:5432/smartspec
```

### Option 2: Reset password in PostgreSQL
```bash
docker exec smartspec-postgres psql -U smartspec -d smartspec \
  -c "ALTER USER smartspec WITH PASSWORD 'smartspec123';"
```

## Integration with run-services.sh

The validator is automatically called in `run-services.sh`:

```bash
./run-services.sh start  # ← Runs validation first
```

If validation fails, services won't start and you'll see:
```
[ERROR] Database configuration validation failed!
[WARN] Fix the configuration mismatch before starting services.
```

## Future enhancements

Planned improvements:
- [ ] Validate Redis configuration
- [ ] Check port availability before starting
- [ ] Validate Python backend environment variables
- [ ] Auto-fix option (with user confirmation)
