#!/usr/bin/env bash
# =============================================================================
# SmartSpec Pro - Docker Development Environment Manager
# =============================================================================
# Purpose: Manage the Docker development environment
# Usage:   ./docker-dev.sh [command]
# =============================================================================

set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DOCKER_DIR="${PROJECT_ROOT}/docker"
COMPOSE_FILE="${DOCKER_DIR}/docker-compose.dev.yml"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Functions
log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }
log_header() { echo -e "\n${BLUE}=== $1 ===${NC}\n"; }

# Check Docker is installed
check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed!"
        exit 1
    fi
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not installed!"
        exit 1
    fi
}

# Get docker compose command
get_compose_cmd() {
    if docker compose version &> /dev/null 2>&1; then
        echo "docker compose"
    else
        echo "docker-compose"
    fi
}

COMPOSE_CMD=$(get_compose_cmd)

# Commands
cmd_up() {
    log_header "Starting Development Environment"
    cd "${DOCKER_DIR}"
    
    # Export UID/GID for proper permissions
    export USER_UID=$(id -u)
    export USER_GID=$(id -g)
    
    # Build if needed
    if [ "$1" == "--build" ]; then
        log_info "Building images..."
        ${COMPOSE_CMD} -f docker-compose.dev.yml build
    fi
    
    log_info "Starting services..."
    ${COMPOSE_CMD} -f docker-compose.dev.yml up -d
    
    log_info "Waiting for services to be healthy..."
    sleep 5
    
    cmd_status
    
    log_info ""
    log_info "Development environment is ready!"
    log_info "  - Enter container: ./docker/scripts/docker-dev.sh shell"
    log_info "  - Run command:     ./docker/scripts/dockersh \"npm test\""
}

cmd_down() {
    log_header "Stopping Development Environment"
    cd "${DOCKER_DIR}"
    ${COMPOSE_CMD} -f docker-compose.dev.yml down "$@"
    log_info "Environment stopped."
}

cmd_restart() {
    log_header "Restarting Development Environment"
    cmd_down
    cmd_up
}

cmd_status() {
    log_header "Environment Status"
    cd "${DOCKER_DIR}"
    ${COMPOSE_CMD} -f docker-compose.dev.yml ps
}

cmd_logs() {
    log_header "Container Logs"
    cd "${DOCKER_DIR}"
    ${COMPOSE_CMD} -f docker-compose.dev.yml logs -f "$@"
}

cmd_shell() {
    log_info "Entering development container..."
    docker exec -it smartspec-dev bash
}

cmd_shell_root() {
    log_info "Entering development container as root..."
    docker exec -it --user root smartspec-dev bash
}

cmd_clean() {
    log_header "Cleaning Development Environment"
    cd "${DOCKER_DIR}"
    
    log_warn "This will remove all containers, volumes, and images!"
    read -p "Are you sure? (y/N) " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        ${COMPOSE_CMD} -f docker-compose.dev.yml down -v --rmi local
        log_info "Environment cleaned."
    else
        log_info "Cancelled."
    fi
}

cmd_setup() {
    log_header "Setting Up Development Environment"
    
    # Check Docker
    check_docker
    
    # Create necessary directories
    log_info "Creating directories..."
    mkdir -p "${DOCKER_DIR}/init-scripts/postgres"
    
    # Create .env file if not exists
    if [ ! -f "${PROJECT_ROOT}/.env" ]; then
        log_info "Creating .env file from template..."
        if [ -f "${PROJECT_ROOT}/python-backend/.env.example" ]; then
            cp "${PROJECT_ROOT}/python-backend/.env.example" "${PROJECT_ROOT}/.env"
        else
            cat > "${PROJECT_ROOT}/.env" << 'EOF'
# SmartSpec Pro Environment Variables

# API Keys (required for LLM features)
OPENAI_API_KEY=
ANTHROPIC_API_KEY=

# Database (auto-configured for Docker)
DATABASE_URL=postgresql://smartspec:smartspec@postgres:5432/smartspec

# Redis (auto-configured for Docker)
REDIS_URL=redis://redis:6379/0

# ChromaDB
CHROMADB_URL=http://chromadb:8000

# Ollama (optional, for local LLM)
OLLAMA_URL=http://ollama:11434
EOF
        fi
        log_warn "Please edit .env file to add your API keys!"
    fi
    
    # Make scripts executable
    log_info "Making scripts executable..."
    chmod +x "${DOCKER_DIR}/scripts/"*.sh 2>/dev/null || true
    chmod +x "${DOCKER_DIR}/scripts/dockersh" 2>/dev/null || true
    
    # Build and start
    cmd_up --build
    
    log_header "Setup Complete!"
    log_info "Next steps:"
    log_info "  1. Edit .env file to add your API keys"
    log_info "  2. Enter container: ./docker/scripts/docker-dev.sh shell"
    log_info "  3. Install dependencies: cd python-backend && pip install -r requirements.txt"
}

cmd_install_deps() {
    log_header "Installing Dependencies in Container"
    
    log_info "Installing Python dependencies..."
    docker exec smartspec-dev bash -lc "cd /workspace/python-backend && pip install -r requirements.txt"
    
    log_info "Installing Node.js dependencies (if any)..."
    docker exec smartspec-dev bash -lc "cd /workspace/desktop-app && npm install 2>/dev/null || true"
    
    log_info "Dependencies installed!"
}

cmd_test() {
    log_header "Running Tests in Container"
    docker exec smartspec-dev bash -lc "cd /workspace/python-backend && python -m pytest tests/ -v $*"
}

cmd_help() {
    cat << EOF
SmartSpec Pro - Docker Development Environment Manager

Usage: ./docker-dev.sh <command> [options]

Commands:
    setup           Initial setup (build, create .env, start services)
    up [--build]    Start development environment
    down            Stop development environment
    restart         Restart development environment
    status          Show container status
    logs [service]  Show container logs
    shell           Enter development container (as devuser)
    shell-root      Enter development container (as root)
    install-deps    Install project dependencies in container
    test [args]     Run tests in container
    clean           Remove all containers, volumes, and images
    help            Show this help message

Examples:
    ./docker-dev.sh setup           # First time setup
    ./docker-dev.sh up              # Start environment
    ./docker-dev.sh shell           # Enter container
    ./docker-dev.sh test -k "test_memory"  # Run specific tests
    ./docker-dev.sh logs postgres   # View postgres logs

EOF
}

# Main
check_docker

case "${1:-help}" in
    setup)
        cmd_setup
        ;;
    up)
        cmd_up "$2"
        ;;
    down)
        shift
        cmd_down "$@"
        ;;
    restart)
        cmd_restart
        ;;
    status)
        cmd_status
        ;;
    logs)
        shift
        cmd_logs "$@"
        ;;
    shell)
        cmd_shell
        ;;
    shell-root)
        cmd_shell_root
        ;;
    install-deps)
        cmd_install_deps
        ;;
    test)
        shift
        cmd_test "$@"
        ;;
    clean)
        cmd_clean
        ;;
    help|--help|-h)
        cmd_help
        ;;
    *)
        log_error "Unknown command: $1"
        cmd_help
        exit 1
        ;;
esac
