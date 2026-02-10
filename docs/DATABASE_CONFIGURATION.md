# Database Configuration Management

## Overview

SmartSpecPro uses **PostgreSQL** as its primary database. To prevent configuration drift and connection issues, all database credentials **MUST** follow a single source of truth pattern.

## ⚠️ Problem This Document Solves

**Configuration drift** has historically caused database connection failures after service restarts. The root causes were:

1. **Multiple hardcoded values** in shell scripts (`setup.sh`, `dev-local.sh`)
2. **Inconsistent passwords** across docker-compose files (`smartspec_dev` vs `smartspec123`)
3. **Conflicting .env.example files** between apps/web and python-backend
4. **No validation mechanism** to detect mismatches

This led to repeated failures where `DATABASE_URL` would reset to wrong values after service restarts, security updates, or new feature deployments.

## ✅ Single Source of Truth

### Standardized Credentials (Development)

```bash
POSTGRES_USER=smartspec
POSTGRES_PASSWORD=smartspec123
POSTGRES_DB=smartspec
```

### Connection Strings

**Node.js/apps/web (synchronous driver)**:
```
DATABASE_URL=postgresql://smartspec:smartspec123@localhost:5432/smartspec
```

**Python backend (async driver)**:
```
DATABASE_URL=postgresql+asyncpg://smartspec:smartspec123@localhost:5432/smartspec
```

**Docker containers** (use container hostname):
```
DATABASE_URL=postgresql://smartspec:smartspec123@postgres:5432/smartspec
```

## 📋 Configuration Files Hierarchy

### 1. **Production: docker-compose.yml** (Authoritative)

Location: `/docker-compose.yml`

```yaml
services:
  postgres:
    environment:
      POSTGRES_USER: smartspec
      POSTGRES_PASSWORD: smartspec123
      POSTGRES_DB: smartspec
```

**This is the primary source for production deployments.**

### 2. **Development: .env Files**

| File | Purpose | Driver |
|------|---------|--------|
| `apps/web/.env` | Node.js/Express/tRPC | `postgresql://` |
| `python-backend/.env` | FastAPI/Celery | `postgresql+asyncpg://` |

**Copy from `.env.example` files** - never create manually.

### 3. **Examples: .env.example Files** (Templates)

| File | Updated | Verified |
|------|---------|----------|
| `.env.example` | ✅ Yes | Feb 2026 |
| `apps/web/.env.example` | ✅ Yes | Feb 2026 |
| `python-backend/.env.example` | ✅ Yes | Feb 2026 |

**All `.env.example` files are now synchronized** with the same credentials.

### 4. **Scripts** (No Longer Hardcode)

| File | Status | Note |
|------|--------|------|
| `setup.sh` | ✅ Fixed | Falls back to .env.example, not hardcoded values |
| `dev-local.sh` | ✅ Fixed | Reads from .env.local, not hardcoded defaults |

## 🛠️ Setup Instructions

### New Developer Setup

1. **Copy environment files**:
   ```bash
   cp .env.example .env
   cp apps/web/.env.example apps/web/.env
   cp python-backend/.env.example python-backend/.env
   ```

2. **Start infrastructure**:
   ```bash
   docker compose up -d postgres redis
   ```

3. **Verify connection**:
   ```bash
   docker exec smartspec-postgres psql -U smartspec -d smartspec -c "SELECT version();"
   ```

4. **Run validation**:
   ```bash
   ./scripts/validate-db-config.sh
   ```

### Existing Project (Migration from old credentials)

If you have an existing `.env` with `smartspec_dev` password:

1. **Backup current database** (if it has data):
   ```bash
   mkdir -p .db-backups
   docker exec smartspec-postgres pg_dump -U smartspec -d smartspec \
     > .db-backups/migration_$(date +%Y%m%d_%H%M%S).sql
   ```

2. **Update .env files** (replace `smartspec_dev` with `smartspec123`):
   ```bash
   # Automated fix
   sed -i 's/smartspec_dev/smartspec123/g' apps/web/.env
   sed -i 's/smartspec_dev/smartspec123/g' python-backend/.env
   ```

3. **Restart PostgreSQL**:
   ```bash
   docker compose down postgres
   docker compose up -d postgres
   ```

4. **Test connection**:
   ```bash
   psql "postgresql://smartspec:smartspec123@localhost:5432/smartspec" -c "\\conninfo"
   ```

## 🔍 Validation

### Automatic Validation Script

Run this **before committing changes**:

```bash
./scripts/validate-db-config.sh
```

**What it checks**:
- ✅ All `.env.example` files use consistent credentials
- ✅ No hardcoded `smartspec_dev` in scripts
- ✅ No legacy `smartspecpro` database names
- ✅ docker-compose files are synchronized
- ✅ Running containers match expected configuration

**Exit codes**:
- `0` = All checks passed
- `1` = Validation failed (fix errors before committing)

### Manual Verification

**Check running database**:
```bash
docker exec smartspec-postgres psql -U smartspec -d smartspec -c "
  SELECT current_database(), current_user, version();
"
```

**Check volumes**:
```bash
docker volume ls | grep smartspec
```

Expected volumes:
- `smartspec_postgres_data` ← **ACTIVE** (contains user data)
- `smartspec_redis_data`

**Check connection from Node.js**:
```bash
cd apps/web
node -e "require('./server/db.ts')" && echo "Connection OK"
```

**Check connection from Python**:
```bash
cd python-backend
python -c "from app.core.database import engine; print('Connection OK')"
```

## 🚨 Troubleshooting

### Problem: "FATAL: password authentication failed for user smartspec"

**Root cause**: DATABASE_URL has wrong password

**Solution**:
1. Check your `.env` files:
   ```bash
   grep DATABASE_URL apps/web/.env
   grep DATABASE_URL python-backend/.env
   ```

2. Expected values:
   - Password must be `smartspec123` (NOT `smartspec_dev`)
   - Database must be `smartspec` (NOT `smartspecpro`)

3. Fix and restart:
   ```bash
   ./scripts/validate-db-config.sh
   docker compose restart postgres
   ```

### Problem: "database smartspecpro does not exist"

**Root cause**: Using old database name in connection string

**Solution**:
```bash
# Fix .env
sed -i 's/smartspecpro/smartspec/g' apps/web/.env
sed -i 's/smartspecpro/smartspec/g' python-backend/.env

# Restart services
docker compose restart
```

### Problem: Configuration keeps resetting after restart

**Root cause**: Scripts have hardcoded fallback values

**Solution**:
1. Ensure `.env` files exist (copy from `.env.example`)
2. Run validation script:
   ```bash
   ./scripts/validate-db-config.sh
   ```
3. Fix any errors reported

### Problem: "ECONNREFUSED" or connection timeout

**Root cause**: PostgreSQL not running or wrong hostname

**Solution**:
1. Check PostgreSQL is running:
   ```bash
   docker ps | grep postgres
   ```

2. If not running:
   ```bash
   docker compose up -d postgres
   ```

3. Check hostname:
   - **From host**: use `localhost`
   - **From Docker container**: use `postgres` or `smartspec-postgres`
   - **From dev-local.sh**: use `localhost` (apps run on host)

## 🔐 Security Notes

### Production Deployment

**NEVER use `smartspec123` in production.** This is a development-only password.

For production:

1. **Use environment variables**:
   ```yaml
   services:
     postgres:
       environment:
         POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}  # No default!
   ```

2. **Set strong password**:
   ```bash
   export POSTGRES_PASSWORD=$(openssl rand -base64 32)
   echo "POSTGRES_PASSWORD=$POSTGRES_PASSWORD" >> .env.production
   ```

3. **Use secrets management**:
   - Docker Swarm: `docker secret create`
   - Kubernetes: `kubectl create secret`
   - Cloud: AWS Secrets Manager, Google Secret Manager, Azure Key Vault

### Encryption Keys

**LLM_ENCRYPTION_KEY** in `apps/web/.env` is used to encrypt:
- API keys (OpenAI, Anthropic, etc.)
- SMTP passwords
- Stripe keys
- TOTP secrets

**NEVER change `LLM_ENCRYPTION_KEY`** unless you re-encrypt all encrypted data first.

**Database backups (.sql)** contain encrypted ciphertext - they're safe to store, but they require the encryption key to be useful.

## 📊 Configuration Matrix

| Environment | User | Password | Database | Driver | Hostname |
|-------------|------|----------|----------|--------|----------|
| **Development (host)** | smartspec | smartspec123 | smartspec | postgresql:// | localhost |
| **Development (Docker)** | smartspec | smartspec123 | smartspec | postgresql:// | postgres |
| **Python backend** | smartspec | smartspec123 | smartspec | postgresql+asyncpg:// | localhost |
| **Celery workers (Docker)** | smartspec | smartspec123 | smartspec | postgresql+asyncpg:// | smartspec-postgres |
| **Production** | smartspec | **<SECRET>** | smartspec | postgresql:// | postgres |

## ⚙️ Advanced Configuration

### Using Different Database Name

If you need to use a different database name (e.g., for testing):

1. **Override with environment variable**:
   ```bash
   export POSTGRES_DB=smartspec_test
   ```

2. **Update docker-compose.yml**:
   ```yaml
   environment:
     POSTGRES_DB: ${POSTGRES_DB:-smartspec}
   ```

3. **Update .env**:
   ```
   DATABASE_URL=postgresql://smartspec:smartspec123@localhost:5432/smartspec_test
   ```

### Multiple Environments

Create environment-specific files:

```
.env.development     # Uses smartspec123
.env.staging         # Uses different password
.env.production      # Uses production secrets
```

Load the appropriate file:
```bash
docker compose --env-file .env.production up -d
```

### Connection Pooling

**Node.js (Drizzle)**:
```typescript
// apps/web/server/db.ts
pool: {
  max: 20,  // Maximum connections
  min: 2,   // Minimum connections
  idleTimeoutMillis: 30000
}
```

**Python (SQLAlchemy)**:
```python
# python-backend/app/core/database.py
DATABASE_POOL_SIZE=10
DATABASE_MAX_OVERFLOW=20
```

## 📚 Additional Resources

- **PostgreSQL Documentation**: https://www.postgresql.org/docs/
- **Docker Compose Networking**: https://docs.docker.com/compose/networking/
- **Drizzle ORM**: https://orm.drizzle.team/
- **SQLAlchemy**: https://docs.sqlalchemy.org/

## 🔄 Changelog

### 2026-02-09: Configuration Standardization
- ✅ Unified all config files to use `smartspec123` password
- ✅ Removed hardcoded values from `setup.sh` and `dev-local.sh`
- ✅ Fixed `docker-compose.full.yml` database name (smartspecpro → smartspec)
- ✅ Created validation script `scripts/validate-db-config.sh`
- ✅ Documented single source of truth pattern

### Previous Issues (Resolved)
- ❌ `smartspec_dev` vs `smartspec123` password conflict
- ❌ `smartspec` vs `smartspecpro` database name conflict
- ❌ Hardcoded credentials in shell scripts
- ❌ No validation mechanism

---

**Maintained by**: SmartSpecPro Development Team
**Last Updated**: 2026-02-09
**Version**: 1.0.0
