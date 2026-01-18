#!/bin/bash

# SmartSpecPro Development Script
# Usage: ./dev.sh <command>

set -e

# ============================================
# Configuration
# ============================================

COMPOSE_FILE="docker-compose.dev.yml"
PROJECT_NAME="smartspec"

# ============================================
# Colors
# ============================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ============================================
# Helper Functions
# ============================================

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

print_banner() {
    echo -e "${CYAN}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║                    SmartSpecPro Dev                           ║"
    echo "║              Local Development Environment                    ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_services() {
    echo ""
    echo -e "${GREEN}Services:${NC}"
    echo "  ┌─────────────────────────────────────────────────────────────┐"
    echo "  │ SmartSpec Web      │ http://localhost:3000                  │"
    echo "  │ Python Backend     │ http://localhost:8000                  │"
    echo "  │ Control Plane      │ http://localhost:7070                  │"
    echo "  │ Docker Status      │ http://localhost:3001                  │"
    echo "  │ PostgreSQL         │ localhost:5432                         │"
    echo "  │ Redis              │ localhost:6379                         │"
    echo "  └─────────────────────────────────────────────────────────────┘"
    echo ""
    echo -e "${YELLOW}API Documentation:${NC}"
    echo "  • Swagger UI: http://localhost:8000/docs"
    echo "  • ReDoc:      http://localhost:8000/redoc"
    echo ""
}

check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running. Please start Docker."
        exit 1
    fi
}

check_compose() {
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not installed. Please install Docker Compose."
        exit 1
    fi
}

compose_cmd() {
    if docker compose version &> /dev/null 2>&1; then
        docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" "$@"
    else
        docker-compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" "$@"
    fi
}

wait_for_service() {
    local service=$1
    local url=$2
    local max_attempts=${3:-30}
    local attempt=1
    
    log_step "Waiting for $service to be ready..."
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s "$url" > /dev/null 2>&1; then
            log_info "$service is ready!"
            return 0
        fi
        echo -n "."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    echo ""
    log_warn "$service may not be fully ready yet"
    return 1
}

# ============================================
# Commands
# ============================================

cmd_start() {
    print_banner
    check_docker
    check_compose
    
    log_step "Starting SmartSpecPro development environment..."
    
    # Check if .env exists
    if [ ! -f ".env" ]; then
        log_warn ".env file not found. Creating from template..."
        if [ -f ".env.example" ]; then
            cp .env.example .env
            log_info "Created .env from .env.example"
        else
            log_warn "No .env.example found. Services may not work correctly."
        fi
    fi
    
    # Start services
    compose_cmd up -d
    
    echo ""
    log_step "Waiting for services to be ready..."
    sleep 5
    
    # Wait for key services
    wait_for_service "PostgreSQL" "localhost:5432" 10 || true
    wait_for_service "Python Backend" "http://localhost:8000/health" 30 || true
    wait_for_service "SmartSpec Web" "http://localhost:3000" 30 || true
    
    print_services
    
    log_info "Development environment is ready!"
    echo ""
    echo "Quick commands:"
    echo "  ./dev.sh logs           - View all logs"
    echo "  ./dev.sh logs backend   - View backend logs"
    echo "  ./dev.sh status         - Check service status"
    echo "  ./dev.sh stop           - Stop all services"
}

cmd_stop() {
    check_docker
    check_compose
    
    log_step "Stopping SmartSpecPro development environment..."
    compose_cmd down
    log_info "All services stopped."
}

cmd_restart() {
    check_docker
    check_compose
    
    local service=$1
    
    if [ -z "$service" ]; then
        log_step "Restarting all services..."
        compose_cmd restart
    else
        log_step "Restarting $service..."
        compose_cmd restart "$service"
    fi
    
    log_info "Restart complete."
}

cmd_logs() {
    check_docker
    check_compose
    
    local service=$1
    
    if [ -z "$service" ]; then
        compose_cmd logs -f --tail=100
    else
        # Map friendly names to container names
        case "$service" in
            backend|api)
                service="python-backend"
                ;;
            web|frontend)
                service="smartspec-web"
                ;;
            control|cp)
                service="control-plane"
                ;;
            docker|ds)
                service="docker-status"
                ;;
            db|database)
                service="postgres"
                ;;
        esac
        compose_cmd logs -f --tail=100 "$service"
    fi
}

cmd_status() {
    check_docker
    check_compose
    
    echo ""
    echo -e "${CYAN}Service Status:${NC}"
    echo ""
    compose_cmd ps
    echo ""
    
    # Health check
    echo -e "${CYAN}Health Checks:${NC}"
    echo ""
    
    # Check each service
    services=(
        "PostgreSQL|localhost:5432"
        "Redis|localhost:6379"
        "Python Backend|http://localhost:8000/health"
        "Control Plane|http://localhost:7070/health"
        "SmartSpec Web|http://localhost:3000"
        "Docker Status|http://localhost:3001"
    )
    
    for svc in "${services[@]}"; do
        name="${svc%%|*}"
        url="${svc##*|}"
        
        if [[ "$url" == localhost:* ]]; then
            # TCP check
            port="${url##*:}"
            if nc -z localhost "$port" 2>/dev/null; then
                echo -e "  ${GREEN}✓${NC} $name"
            else
                echo -e "  ${RED}✗${NC} $name"
            fi
        else
            # HTTP check
            if curl -s "$url" > /dev/null 2>&1; then
                echo -e "  ${GREEN}✓${NC} $name"
            else
                echo -e "  ${RED}✗${NC} $name"
            fi
        fi
    done
    echo ""
}

cmd_clean() {
    check_docker
    check_compose
    
    log_warn "This will remove all containers, volumes, and cached data."
    echo -n "Are you sure? (y/N): "
    read -r answer
    
    if [ "$answer" = "y" ] || [ "$answer" = "Y" ]; then
        log_step "Stopping and removing containers..."
        compose_cmd down -v --remove-orphans
        
        log_step "Removing cached volumes..."
        docker volume rm smartspec_postgres_data smartspec_redis_data smartspec_python_cache smartspec_web_node_modules smartspec_docker_status_node_modules 2>/dev/null || true
        
        log_info "Cleanup complete."
    else
        log_info "Cleanup cancelled."
    fi
}

cmd_build() {
    check_docker
    check_compose
    
    local service=$1
    
    if [ -z "$service" ]; then
        log_step "Building all services..."
        compose_cmd build
    else
        log_step "Building $service..."
        compose_cmd build "$service"
    fi
    
    log_info "Build complete."
}

cmd_test() {
    check_docker
    check_compose
    
    local target=$1
    
    print_banner
    
    case "$target" in
        backend|api)
            log_step "Running Python backend tests..."
            compose_cmd exec python-backend pytest -v --cov=app --cov-report=term-missing
            ;;
        web|frontend)
            log_step "Running SmartSpec Web tests..."
            compose_cmd exec smartspec-web pnpm test
            ;;
        docker-status|ds)
            log_step "Running Docker Status tests..."
            compose_cmd exec docker-status pnpm test
            ;;
        all|"")
            log_step "Running all tests..."
            echo ""
            
            log_step "1/3 Python Backend tests..."
            compose_cmd exec python-backend pytest -v || log_warn "Backend tests failed"
            echo ""
            
            log_step "2/3 SmartSpec Web tests..."
            compose_cmd exec smartspec-web pnpm test || log_warn "Web tests failed"
            echo ""
            
            log_step "3/3 Docker Status tests..."
            compose_cmd exec docker-status pnpm test || log_warn "Docker Status tests failed"
            echo ""
            
            log_info "All tests completed!"
            ;;
        *)
            log_error "Unknown test target: $target"
            echo "Available targets: backend, web, docker-status, all"
            exit 1
            ;;
    esac
}

cmd_shell() {
    check_docker
    check_compose
    
    local service=$1
    
    if [ -z "$service" ]; then
        service="python-backend"
    fi
    
    # Map friendly names
    case "$service" in
        backend|api)
            service="python-backend"
            ;;
        web|frontend)
            service="smartspec-web"
            ;;
        control|cp)
            service="control-plane"
            ;;
        docker|ds)
            service="docker-status"
            ;;
    esac
    
    log_info "Opening shell in $service..."
    compose_cmd exec "$service" /bin/sh
}

cmd_desktop() {
    log_step "Starting desktop app in development mode..."
    
    # Check if Tauri CLI is installed
    if ! command -v cargo &> /dev/null; then
        log_error "Rust/Cargo is not installed. Please install Rust first."
        exit 1
    fi
    
    cd desktop-app
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        log_step "Installing dependencies..."
        pnpm install
    fi
    
    log_info "Starting Tauri development server..."
    pnpm tauri dev
}

cmd_sandbox() {
    check_docker
    
    local action=$1
    
    case "$action" in
        build)
            log_step "Building sandbox images..."
            cd desktop-app/sandbox-images
            ./build.sh all
            ;;
        list)
            log_info "Available sandbox images:"
            docker images | grep smartspec/sandbox || echo "No sandbox images found"
            ;;
        *)
            echo "Sandbox commands:"
            echo "  ./dev.sh sandbox build   - Build all sandbox images"
            echo "  ./dev.sh sandbox list    - List sandbox images"
            ;;
    esac
}

cmd_db() {
    check_docker
    check_compose
    
    local action=$1
    
    case "$action" in
        migrate)
            log_step "Running database migrations..."
            compose_cmd exec python-backend alembic upgrade head
            log_info "Migrations complete."
            ;;
        reset)
            log_warn "This will reset the database. All data will be lost."
            echo -n "Are you sure? (y/N): "
            read -r answer
            
            if [ "$answer" = "y" ] || [ "$answer" = "Y" ]; then
                log_step "Resetting database..."
                compose_cmd exec python-backend alembic downgrade base
                compose_cmd exec python-backend alembic upgrade head
                log_info "Database reset complete."
            fi
            ;;
        shell)
            log_info "Opening PostgreSQL shell..."
            compose_cmd exec postgres psql -U smartspec -d smartspec
            ;;
        *)
            echo "Database commands:"
            echo "  ./dev.sh db migrate   - Run migrations"
            echo "  ./dev.sh db reset     - Reset database"
            echo "  ./dev.sh db shell     - Open PostgreSQL shell"
            ;;
    esac
}

cmd_tools() {
    check_docker
    check_compose
    
    log_step "Starting admin tools (pgAdmin, Redis Commander)..."
    compose_cmd --profile tools up -d pgadmin redis-commander
    
    echo ""
    log_info "Admin tools started:"
    echo "  • pgAdmin:          http://localhost:5050 (admin@smartspec.local / admin)"
    echo "  • Redis Commander:  http://localhost:8081"
}

cmd_help() {
    print_banner
    
    echo "Usage: ./dev.sh <command> [options]"
    echo ""
    echo -e "${CYAN}Core Commands:${NC}"
    echo "  start              Start all services"
    echo "  stop               Stop all services"
    echo "  restart [service]  Restart all or specific service"
    echo "  status             Show service status and health"
    echo ""
    echo -e "${CYAN}Development:${NC}"
    echo "  logs [service]     View logs (backend, web, control, docker, db)"
    echo "  shell [service]    Open shell in container"
    echo "  build [service]    Build all or specific service"
    echo "  desktop            Start desktop app in dev mode"
    echo ""
    echo -e "${CYAN}Testing:${NC}"
    echo "  test [target]      Run tests (backend, web, docker-status, all)"
    echo ""
    echo -e "${CYAN}Database:${NC}"
    echo "  db migrate         Run database migrations"
    echo "  db reset           Reset database"
    echo "  db shell           Open PostgreSQL shell"
    echo ""
    echo -e "${CYAN}Sandbox:${NC}"
    echo "  sandbox build      Build sandbox Docker images"
    echo "  sandbox list       List sandbox images"
    echo ""
    echo -e "${CYAN}Tools:${NC}"
    echo "  tools              Start admin tools (pgAdmin, Redis Commander)"
    echo "  clean              Remove all containers and volumes"
    echo ""
    echo -e "${CYAN}Examples:${NC}"
    echo "  ./dev.sh start                 # Start everything"
    echo "  ./dev.sh logs backend          # View backend logs"
    echo "  ./dev.sh test all              # Run all tests"
    echo "  ./dev.sh shell backend         # Open backend shell"
    echo "  ./dev.sh restart web           # Restart web service"
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
    restart)
        cmd_restart "$2"
        ;;
    logs)
        cmd_logs "$2"
        ;;
    status)
        cmd_status
        ;;
    clean)
        cmd_clean
        ;;
    build)
        cmd_build "$2"
        ;;
    test)
        cmd_test "$2"
        ;;
    shell)
        cmd_shell "$2"
        ;;
    desktop)
        cmd_desktop
        ;;
    sandbox)
        cmd_sandbox "$2"
        ;;
    db)
        cmd_db "$2"
        ;;
    tools)
        cmd_tools
        ;;
    help|--help|-h)
        cmd_help
        ;;
    *)
        log_error "Unknown command: $1"
        echo "Run './dev.sh help' for usage information."
        exit 1
        ;;
esac
