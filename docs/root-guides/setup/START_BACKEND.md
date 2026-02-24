# SmartSpecPro Python Backend - Quick Start Guide

## ✅ Setup Complete!

### 🎯 System Status
- **Backend**: Running on port 8000
- **Database**: PostgreSQL (healthy)
- **Cache**: Redis (healthy)
- **Admin Seeding**: ✓ Complete
- **Tenant Creation**: ✓ Complete

---

## 👤 Default Admin Credentials

```
Email    : admin@smartspec.pro
Password : Admin@123!
Role     : admin
Credits  : 100,000
```

**⚠️ IMPORTANT**: Change this password after first login!

---

## 🏢 Default Tenant

```
Name     : SmartSpec Pro
Slug     : smartspec-pro
Plan     : ENTERPRISE
Status   : ACTIVE
```

**Note**: Tenant is stored in-memory (Phase 3 multi-tenancy design)

---

## 🔗 API Endpoints

| Service | URL |
|---------|-----|
| API Base | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs |
| ReDoc | http://localhost:8000/redoc |
| Health Check | http://localhost:8000/health |

---

## 🚀 Starting the Backend

### Method 1: Using dev-local.sh (Recommended)

```bash
# Start infrastructure only (if not running)
./dev-local.sh infra start

# Start backend in a new terminal
./dev-local.sh backend
```

### Method 2: Manual Start

```bash
cd python-backend
source .venv/bin/activate

# Set environment variables
export DATABASE_URL="postgresql+asyncpg://smartspec:smartspec_dev@localhost:5432/smartspec"
export REDIS_URL="redis://localhost:6379"
export DEBUG="true"
export SECRET_KEY="dev_secret_key_change_in_production"

# Start uvicorn
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

---

## 🛠️ Common Tasks

### Check Backend Status
```bash
curl http://localhost:8000/health | jq
```

### View Admin User
```bash
docker exec smartspec-postgres psql -U smartspec -d smartspec -c \
  "SELECT id, email, role, credits FROM users;"
```

### Check Backend Logs
```bash
# If running with dev-local.sh
# Logs appear in the terminal where you ran the command

# If running manually in background
tail -f /tmp/backend-run.log
```

### Stop Backend
```bash
# Find and kill the process
pkill -f "uvicorn app.main"

# Or use Ctrl+C if running in foreground
```

---

## 📋 Database Schema Changes

### Fixed Issues:
1. ✅ Changed 30+ foreign key references from `String(36)` / `UUID` to `Integer`
2. ✅ Updated `users.currentTenantId` from `Integer` to `String(36)`
3. ✅ All foreign keys to `users.id` are now `Integer` type
4. ✅ Tables created successfully without errors

### Key Model Files Modified:
- `app/models/user.py` - currentTenantId type fixed
- `app/models/api_key.py` - user_id FK fixed
- `app/models/oauth.py` - user_id FK fixed
- `app/models/tenant.py` - owner_id FK fixed
- Plus 14 other model files

---

## 🔧 Configuration Files

### Environment Variables (.env.local)
Located at: `/home/dev/projects/SmartSpecPro/.env.local`

Key variables:
```bash
DATABASE_URL=postgresql://smartspec:smartspec_dev@localhost:5432/smartspec
DATABASE_URL_ASYNC=postgresql+asyncpg://smartspec:smartspec_dev@localhost:5432/smartspec
REDIS_URL=redis://localhost:6379
SECRET_KEY=dev_secret_key_change_in_production
```

### Virtual Environment
Location: `/data/venvs/smartspec` (symlinked to `.venv`)
Python Version: 3.13.5

---

## ⚠️ Known Issues

1. **LLM Proxy Unhealthy**: No API keys configured yet. Add keys to fix:
   - OPENAI_API_KEY
   - ANTHROPIC_API_KEY
   - etc.

2. **Tenant In-Memory Storage**: Phase 3 multi-tenancy uses in-memory storage. Will be persisted to database in future updates.

---

## 📚 Next Steps

1. Configure LLM provider API keys in `.env.local`
2. Start the frontend (SmartSpecWeb) to test the full stack
3. Test OAuth login flow
4. Explore API documentation at `/docs`

---

## 🆘 Troubleshooting

### Backend won't start
```bash
# Check if port 8000 is in use
lsof -i:8000

# Check database connection
docker exec smartspec-postgres pg_isready -U smartspec

# Check Redis
docker exec smartspec-redis redis-cli ping
```

### Database connection errors
```bash
# Restart infrastructure
./dev-local.sh infra stop
./dev-local.sh infra start
```

### Permission errors
```bash
# Fix ownership
sudo chown -R dev:dev /home/dev/projects/SmartSpecPro
sudo chown -R dev:dev /data/venvs/smartspec
```

---

## 📞 Support

For issues or questions:
- Check logs in `/tmp/backend-*.log`
- Review API docs at http://localhost:8000/docs
- Check database tables with `psql`

**Setup completed successfully! 🎉**
