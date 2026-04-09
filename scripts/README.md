# SmartSpecPro Scripts

Collection of utility scripts for managing and validating SmartSpecPro services.

## Desktop Build And Runtime

SmartSpecPro desktop has two distinct modes:

- **Repo development (`npm run dev:desktop`)** uses Tauri dev mode with `http://localhost:3000`.
- **Packaged installers (`npm run build:desktop`, `npm run release:desktop:gh`)** embed a public SmartSpec web URL such as `https://smartaihub.app`.

### What end users should expect

- End users **do not** run `python-backend` manually.
- End users **do not** need direct access to port `8000`.
- Desktop installers should connect to your public HTTPS domain through Nginx / Cloudflare.
- The web server can keep talking to `PYTHON_BACKEND_URL` privately on the server side.

### Local development

Desktop dev auto-starts the web dev server when possible:

```bash
npm run dev:desktop
```

If you need local login, media, or Python-powered features, run the Python backend separately:

```bash
cd python-backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Build a packaged desktop app

Use your public HTTPS domain so the installed app works immediately after installation:

```bash
SMARTSPEC_DESKTOP_PUBLIC_URL=https://smartaihub.app npm run build:desktop
```

Or pass the URL explicitly with the local builder:

```bash
npm run build:desktop:local -- --web-url https://smartaihub.app
```

### Trigger a manual GitHub desktop build

This is the recommended path when building Windows from Linux/macOS:

```bash
npm run release:desktop:gh -- --tag v0.1.0 --platform windows --web-url https://smartaihub.app --watch
```

### FFmpeg sidecars

Desktop bundles expect `ffmpeg` and `ffprobe` sidecars. The build scripts now prepare them automatically from the current host environment or from explicit paths:

```bash
node scripts/prepare-ffmpeg-sidecars.mjs --dry-run
```

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
