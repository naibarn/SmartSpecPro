#!/bin/bash

# SmartSpecPro Local Development Script
# Runs infrastructure (postgres/redis) in Docker, apps on host
# Usage: ./dev-local.sh <command>

set -e

# ============================================
# Configuration
# ============================================

COMPOSE_FILE="docker-compose.infra.yml"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$PROJECT_ROOT/SmartSpecWeb"
BACKEND_DIR="$PROJECT_ROOT/python-backend"

# Load .env.local file (separate from Docker .env to avoid conflicts)
ENV_LOCAL_FILE="$PROJECT_ROOT/.env.local"

load_env() {
    if [ -f "$ENV_LOCAL_FILE" ]; then
        echo -e "${GREEN}[INFO]${NC} Loading environment from .env.local"
        set -a  # automatically export all variables
        source "$ENV_LOCAL_FILE"
        set +a
    else
        echo -e "${YELLOW}[WARN]${NC} .env.local not found. Using default values."
        export DATABASE_URL="postgresql://smartspec:smartspec_dev@localhost:5432/smartspec"
        export DATABASE_URL_ASYNC="postgresql+asyncpg://smartspec:smartspec_dev@localhost:5432/smartspec"
        export REDIS_URL="redis://localhost:6379"
        export NODE_ENV="development"
    fi
}

# Load environment early
load_env

# ============================================
# Colors
# ============================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# ============================================
# Helper Functions
# ============================================

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }

print_banner() {
    echo -e "${CYAN}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║              SmartSpecPro Local Development                   ║"
    echo "║         Infrastructure: Docker | Apps: Host                   ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_urls() {
    echo ""
    echo -e "${GREEN}Services URLs:${NC}"
    echo "  ┌─────────────────────────────────────────────────────────────┐"
    echo "  │ SmartSpec Web      │ http://localhost:3000                  │"
    echo "  │ Python Backend     │ http://localhost:8000                  │"
    echo "  │ PostgreSQL         │ localhost:5432                         │"
    echo "  │ Redis              │ localhost:6379                         │"
    echo "  └─────────────────────────────────────────────────────────────┘"
    echo ""
}

check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running"
        exit 1
    fi
}

check_node() {
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        exit 1
    fi
    log_info "Node.js: $(node --version)"
}

check_pnpm() {
    # Try multiple paths for pnpm
    if command -v pnpm &> /dev/null; then
        PNPM_CMD="pnpm"
    elif [ -f "/c/Program Files/nodejs/pnpm.CMD" ]; then
        PNPM_CMD="/c/Program Files/nodejs/pnpm.CMD"
    elif [ -f "$HOME/AppData/Local/pnpm/pnpm.CMD" ]; then
        PNPM_CMD="$HOME/AppData/Local/pnpm/pnpm.CMD"
    else
        log_error "pnpm is not installed. Run: npm install -g pnpm"
        exit 1
    fi
    log_info "pnpm found: $PNPM_CMD"
}

check_python() {
    if command -v python &> /dev/null; then
        PYTHON_CMD="python"
    elif command -v python3 &> /dev/null; then
        PYTHON_CMD="python3"
    else
        log_error "Python is not installed"
        exit 1
    fi
    log_info "Python: $($PYTHON_CMD --version)"
}

compose_cmd() {
    if docker compose version &> /dev/null 2>&1; then
        docker compose -f "$PROJECT_ROOT/$COMPOSE_FILE" "$@"
    else
        docker-compose -f "$PROJECT_ROOT/$COMPOSE_FILE" "$@"
    fi
}

wait_for_postgres() {
    log_step "Waiting for PostgreSQL..."
    local max_attempts=30
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        if docker exec smartspec-postgres pg_isready -U smartspec -d smartspec &> /dev/null; then
            log_info "PostgreSQL is ready!"
            return 0
        fi
        echo -n "."
        sleep 1
        attempt=$((attempt + 1))
    done

    echo ""
    log_error "PostgreSQL failed to start"
    return 1
}

wait_for_redis() {
    log_step "Waiting for Redis..."
    local max_attempts=30
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        if docker exec smartspec-redis redis-cli ping &> /dev/null; then
            log_info "Redis is ready!"
            return 0
        fi
        echo -n "."
        sleep 1
        attempt=$((attempt + 1))
    done

    echo ""
    log_error "Redis failed to start"
    return 1
}

# ============================================
# Commands
# ============================================

cmd_infra() {
    local action=${1:-start}

    case "$action" in
        start)
            log_step "Starting infrastructure (PostgreSQL, Redis)..."
            compose_cmd up -d
            wait_for_postgres
            wait_for_redis
            log_info "Infrastructure is ready!"
            ;;
        stop)
            log_step "Stopping infrastructure..."
            compose_cmd down
            log_info "Infrastructure stopped."
            ;;
        status)
            docker ps --filter "name=smartspec-postgres" --filter "name=smartspec-redis" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
            ;;
        logs)
            compose_cmd logs -f
            ;;
        *)
            echo "Usage: ./dev-local.sh infra [start|stop|status|logs]"
            ;;
    esac
}

cmd_web() {
    check_node
    check_pnpm

    log_step "Starting SmartSpec Web (Host)..."
    cd "$WEB_DIR"

    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        log_step "Installing dependencies..."
        "$PNPM_CMD" install
    fi

    # Environment is already loaded from .env.local
    # Override only if needed (use sync driver for SmartSpecWeb)
    export DATABASE_URL="${DATABASE_URL:-postgresql://smartspec:smartspec_dev@localhost:5432/smartspec}"
    export NODE_ENV="${NODE_ENV:-development}"
    export PORT="${WEB_PORT:-3000}"

    log_info "Environment: DATABASE_URL=$DATABASE_URL"
    log_info "Starting Vite dev server on port $PORT..."
    "$PNPM_CMD" dev
}

cmd_backend() {
    check_python

    log_step "Starting Python Backend (Host)..."
    cd "$BACKEND_DIR"

    # Check for virtual environment
    if [ -d ".venv" ]; then
        log_info "Activating virtual environment..."
        if [ -f ".venv/Scripts/activate" ]; then
            source .venv/Scripts/activate
        else
            source .venv/bin/activate
        fi
    elif [ -d "venv" ]; then
        log_info "Activating virtual environment..."
        if [ -f "venv/Scripts/activate" ]; then
            source venv/Scripts/activate
        else
            source venv/bin/activate
        fi
    else
        log_warn "No virtual environment found. Creating one..."
        $PYTHON_CMD -m venv .venv
        if [ -f ".venv/Scripts/activate" ]; then
            source .venv/Scripts/activate
        else
            source .venv/bin/activate
        fi
        pip install -r requirements.txt
    fi

    # Environment is already loaded from .env.local
    # Use async driver for Python backend
    export DATABASE_URL="${DATABASE_URL_ASYNC:-postgresql+asyncpg://smartspec:smartspec_dev@localhost:5432/smartspec}"
    export REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
    export CELERY_BROKER_URL="${CELERY_BROKER_URL:-redis://localhost:6379/0}"
    export CELERY_RESULT_BACKEND="${CELERY_RESULT_BACKEND:-redis://localhost:6379/0}"
    export DEBUG="${DEBUG:-true}"
    export LOG_LEVEL="${LOG_LEVEL:-DEBUG}"
    export CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:3000,http://localhost:3001,http://localhost:5173}"

    log_info "Environment: DATABASE_URL=$DATABASE_URL"
    log_info "Starting uvicorn with hot reload on port ${BACKEND_PORT:-8000}..."
    uvicorn app.main:app --host 0.0.0.0 --port ${BACKEND_PORT:-8000} --reload
}

cmd_celery() {
    check_python

    log_step "Starting Celery Worker (Host)..."
    cd "$BACKEND_DIR"

    # Activate virtual environment
    if [ -f ".venv/Scripts/activate" ]; then
        source .venv/Scripts/activate
    elif [ -f ".venv/bin/activate" ]; then
        source .venv/bin/activate
    elif [ -f "venv/Scripts/activate" ]; then
        source venv/Scripts/activate
    elif [ -f "venv/bin/activate" ]; then
        source venv/bin/activate
    fi

    export DATABASE_URL="postgresql+asyncpg://smartspec:smartspec_dev@localhost:5432/smartspec"
    export CELERY_BROKER_URL="redis://localhost:6379/0"
    export CELERY_RESULT_BACKEND="redis://localhost:6379/0"

    celery -A app.core.celery_app worker --loglevel=info --concurrency=2
}

cmd_start() {
    print_banner
    check_docker

    log_step "Starting full local development environment..."

    # Start infrastructure
    cmd_infra start

    echo ""
    log_info "Infrastructure is running. Now start apps in separate terminals:"
    echo ""
    echo -e "  ${CYAN}Terminal 1 (Web):${NC}"
    echo "    ./dev-local.sh web"
    echo ""
    echo -e "  ${CYAN}Terminal 2 (Backend):${NC}"
    echo "    ./dev-local.sh backend"
    echo ""
    echo -e "  ${CYAN}Terminal 3 (Celery - optional):${NC}"
    echo "    ./dev-local.sh celery"
    echo ""

    print_urls
}

cmd_stop() {
    log_step "Stopping all local development services..."

    # Stop infrastructure
    cmd_infra stop

    # Note: App processes running on host need to be stopped manually (Ctrl+C)
    log_warn "Note: Apps running on host need to be stopped manually with Ctrl+C"

    log_info "Infrastructure stopped."
}

cmd_status() {
    echo ""
    echo -e "${CYAN}Infrastructure Status:${NC}"
    docker ps --filter "name=smartspec-postgres" --filter "name=smartspec-redis" --filter "name=smartspec-chromadb" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "No containers running"

    echo ""
    echo -e "${CYAN}Host Processes:${NC}"

    # Check if web is running
    if lsof -i:3000 &>/dev/null || netstat -an 2>/dev/null | grep -q ":3000.*LISTEN"; then
        echo -e "  ${GREEN}✓${NC} SmartSpec Web (port 3000)"
    else
        echo -e "  ${RED}✗${NC} SmartSpec Web (not running)"
    fi

    # Check if backend is running
    if lsof -i:8000 &>/dev/null || netstat -an 2>/dev/null | grep -q ":8000.*LISTEN"; then
        echo -e "  ${GREEN}✓${NC} Python Backend (port 8000)"
    else
        echo -e "  ${RED}✗${NC} Python Backend (not running)"
    fi

    echo ""
}

cmd_db() {
    local action=$1

    case "$action" in
        shell)
            log_info "Opening PostgreSQL shell..."
            docker exec -it smartspec-postgres psql -U smartspec -d smartspec
            ;;
        migrate)
            log_step "Running database migrations..."
            cd "$WEB_DIR"
            check_pnpm
            "$PNPM_CMD" db:push
            log_info "Migrations complete."
            ;;
        *)
            echo "Database commands:"
            echo "  ./dev-local.sh db shell    - Open PostgreSQL shell"
            echo "  ./dev-local.sh db migrate  - Run Drizzle migrations"
            ;;
    esac
}

cmd_help() {
    print_banner

    echo "Usage: ./dev-local.sh <command> [options]"
    echo ""
    echo -e "${CYAN}Quick Start:${NC}"
    echo "  start              Start infrastructure, then run apps in separate terminals"
    echo "  stop               Stop infrastructure"
    echo "  status             Show status of all services"
    echo ""
    echo -e "${CYAN}Infrastructure (Docker):${NC}"
    echo "  infra start        Start PostgreSQL + Redis"
    echo "  infra stop         Stop infrastructure"
    echo "  infra status       Show infrastructure status"
    echo "  infra logs         View infrastructure logs"
    echo ""
    echo -e "${CYAN}Applications (Host):${NC}"
    echo "  web                Start SmartSpec Web (Vite dev server)"
    echo "  backend            Start Python Backend (uvicorn)"
    echo "  celery             Start Celery worker"
    echo ""
    echo -e "${CYAN}Database:${NC}"
    echo "  db shell           Open PostgreSQL shell"
    echo "  db migrate         Run database migrations"
    echo ""
    echo -e "${CYAN}Workflow:${NC}"
    echo "  1. ./dev-local.sh start       # Start infrastructure"
    echo "  2. ./dev-local.sh web         # In terminal 1"
    echo "  3. ./dev-local.sh backend     # In terminal 2"
    echo ""
    echo -e "${YELLOW}Benefits:${NC}"
    echo "  - Faster startup (no Docker build for apps)"
    echo "  - Native hot reload"
    echo "  - Easier debugging"
    echo "  - Lower memory usage"
}

# ============================================
# Main
# ============================================

case "${1:-help}" in
    start)
        cmd_start
        ;;
    stop)
        cmd_stop
        ;;
    status)
        cmd_status
        ;;
    infra)
        cmd_infra "$2"
        ;;
    web)
        cmd_web
        ;;
    backend)
        cmd_backend
        ;;
    celery)
        cmd_celery
        ;;
    db)
        cmd_db "$2"
        ;;
    help|--help|-h)
        cmd_help
        ;;
    *)
        log_error "Unknown command: $1"
        echo "Run './dev-local.sh help' for usage information."
        exit 1
        ;;
esac
