#!/usr/bin/env bash
# setup-glitchtip.sh — First-time GlitchTip setup
#
# What this script does:
#   1. Creates the 'glitchtip' PostgreSQL database
#   2. Generates .env.glitchtip with a random SECRET_KEY
#   3. Starts the containers so Django runs its migrations
#
# Usage: ./scripts/setup-glitchtip.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.glitchtip"

echo "========================================="
echo "  GlitchTip Setup"
echo "========================================="
echo ""

# ── Step 1: Load PostgreSQL credentials ───────────────────────────────────────
# Try to read from apps/web/.env first, then fall back to env vars
WEB_ENV="$ROOT_DIR/apps/web/.env"
if [[ -f "$WEB_ENV" ]]; then
  DB_URL=$(grep -E '^DATABASE_URL=' "$WEB_ENV" | head -1 | cut -d= -f2-)
else
  DB_URL="${DATABASE_URL:-}"
fi

if [[ -n "$DB_URL" ]]; then
  PG_USER=$(echo "$DB_URL" | sed -E 's|.*://([^:@]+):.*|\1|')
else
  PG_USER="${POSTGRES_USER:-smartspec}"
fi

echo "Using PostgreSQL container: smartspec-postgres (user: ${PG_USER})"
echo ""

# ── Step 2: Create the glitchtip database ─────────────────────────────────────
echo "1. Creating 'glitchtip' database..."
if docker exec smartspec-postgres psql -U "$PG_USER" -lqt 2>/dev/null \
    | cut -d'|' -f1 | grep -qw glitchtip; then
  echo "   ✓ Database 'glitchtip' already exists"
else
  docker exec smartspec-postgres psql -U "$PG_USER" \
    -c "CREATE DATABASE glitchtip;"
  echo "   ✓ Database 'glitchtip' created"
fi

# ── Step 3: Generate .env.glitchtip ───────────────────────────────────────────
echo ""
echo "2. Generating $ENV_FILE..."

if [[ -f "$ENV_FILE" ]]; then
  echo "   ✓ Already exists — skipping (delete to regenerate)"
else
  # Generate a 50-byte hex SECRET_KEY
  if command -v python3 &>/dev/null; then
    SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(50))")
  else
    SECRET_KEY=$(openssl rand -hex 50)
  fi

  # Extract password for the generated DATABASE_URL
  if [[ -n "$DB_URL" ]]; then
    PG_PASS=$(echo "$DB_URL" | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|')
    PG_HOST=$(echo "$DB_URL" | sed -E 's|.*@([^:/]+).*|\1|')
    PG_PORT=$(echo "$DB_URL" | sed -E 's|.*@[^:]+:([0-9]+)/.*|\1|')
  else
    PG_PASS="${POSTGRES_PASSWORD:-smartspec_dev}"
    PG_HOST="localhost"
    PG_PORT="5432"
  fi

  cat > "$ENV_FILE" << EOF
# GlitchTip Configuration — auto-generated $(date +%Y-%m-%d)
# DO NOT COMMIT this file

GLITCHTIP_SECRET_KEY=${SECRET_KEY}

DATABASE_URL=postgres://${PG_USER}:${PG_PASS}@smartspec-postgres:5432/glitchtip
REDIS_URL=redis://smartspec-redis:6379/5

GLITCHTIP_DOMAIN=https://glitchtip.smartaihub.app
PORT=8000

ENABLE_OPEN_USER_REGISTRATION=false

# Uncomment to enable email notifications:
# EMAIL_URL=smtp://user:password@smtp.example.com:587
# DEFAULT_FROM_EMAIL=glitchtip@smartaihub.app
EOF
  echo "   ✓ Generated $ENV_FILE"
fi

# ── Step 4: Start containers (runs Django migrations on first boot) ────────────
echo ""
echo "3. Starting GlitchTip containers..."
cd "$ROOT_DIR"
docker compose -f docker-compose.glitchtip.yml up -d

echo ""
echo "   Waiting 20 s for migrations to complete..."
sleep 20

# Quick health check
if docker exec smartspec-glitchtip-web \
    python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/0/health/', timeout=5)" &>/dev/null; then
  echo "   ✓ GlitchTip is healthy"
else
  echo "   ⚠ Health check not ready yet — migrations may still be running."
  echo "     Run: docker logs smartspec-glitchtip-web"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "========================================="
echo "  Setup complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo ""
echo "  1. Create your admin account:"
echo "     docker exec -it smartspec-glitchtip-web \\"
echo "       ./manage.py createsuperuser"
echo ""
echo "  2. Open GlitchTip:"
echo "     https://glitchtip.smartaihub.app"
echo ""
echo "  3. Create a project → copy the DSN"
echo ""
echo "  4. In SmartAIHub Admin → Infrastructure → Monitoring:"
echo "     Paste the DSN into 'Sentry DSN (Node.js)' and"
echo "     'Sentry DSN (Python)' — the existing Sentry SDK"
echo "     works without any code changes."
echo ""
