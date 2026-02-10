# SmartSpecPro Troubleshooting Guide

## Database Authentication Failures

### Symptom
```
PostgresError: password authentication failed for user "smartspec"
Code: 28P01
```

### Root Cause
The PostgreSQL container uses an external volume (`smartspec_postgres_data`) that may contain old data with a different password than what's configured in `.env`.

### Quick Fix
Reset the password inside the running container:
```bash
docker exec -e PGPASSWORD=smartspec smartspec-postgres \
  psql -U smartspec -d smartspec \
  -c "ALTER USER smartspec WITH PASSWORD 'smartspec123';"
```

Then restart the web server:
```bash
./run-services.sh restart web
```

### Permanent Fix
Either:

1. **Remove external volume flag** (recommended for dev):
   Edit `docker-compose.yml`:
   ```yaml
   volumes:
     postgres_data:
       driver: local  # Change from: external: true
   ```

2. **Or ensure volume password matches .env**:
   ```bash
   # Backup first!
   docker exec smartspec-postgres pg_dump -U smartspec smartspec > backup.sql

   # Remove old volume
   docker compose down
   docker volume rm smartspec_postgres_data

   # Recreate with correct password
   docker compose up -d postgres

   # Restore if needed
   cat backup.sql | docker exec -i smartspec-postgres psql -U smartspec -d smartspec
   ```

### Prevention
- ✅ **Auto-validation enabled**: `./run-services.sh start` now validates credentials before starting
- ✅ **Fixed docker-compose.yml**: Changed from `external: true` to `driver: local`
- ✅ **Validation script available**: Run `./scripts/validate-db-config.sh` anytime to check configuration
- Keep `.env` and docker-compose.yml credentials in sync
- Document password changes
- Use secrets management for production

See [scripts/README.md](scripts/README.md) for details on the validation system.

---

## Redis Connection Failures

### Symptom
```
Error: connect ECONNREFUSED 127.0.0.1:6379
```

### Fix
```bash
docker compose up -d redis
./run-services.sh restart web
```

---

## Port Already in Use

### Symptom
```
Error: listen EADDRINUSE: address already in use :::3000
```

### Fix
Find and kill the process:
```bash
lsof -ti:3000 | xargs kill -9
./run-services.sh restart web
```

---

## Skill Template Not Loading

### Symptom
Skill generates wrong content, ignoring user inputs.

### Check
Look for this log message:
```
[Skills] Loaded prompt template from: /path/to/prompts/storyboard.prompt.md
```

If missing, ensure:
1. Skill has `folderPath` in database
2. Prompt file exists at `skills/{slug}/prompts/*.prompt.md`
3. File permissions are readable

### Verify
```sql
SELECT slug, "folderPath" FROM skills WHERE slug = 'video-storyboard-to-prompts';
```

---

## Common Infrastructure Issues

### All services down after reboot
```bash
docker compose up -d
./run-services.sh restart all
```

### Cloudflared tunnel timeout
```bash
sudo systemctl restart cloudflared
sudo journalctl -u cloudflared -n 50
```

### Database migrations not applied
```bash
cd apps/web
pnpm db:push
```

---

**Last Updated**: 2026-02-09
