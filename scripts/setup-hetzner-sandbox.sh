#!/usr/bin/env bash
# =============================================================================
# SmartSpecPro — Hetzner OpenSandbox Server Provisioning Script
# =============================================================================
#
# Idempotent setup script for a fresh Ubuntu 22.04 / Debian 12 server.
# Provisions Docker, UFW firewall, Nginx + Let's Encrypt TLS, and the
# OpenSandbox Docker Compose stack.
#
# Run as root on the Hetzner server after DNS has propagated:
#
#   bash setup-hetzner-sandbox.sh
#
# Environment variables (override defaults):
#   SANDBOX_DOMAIN       - Subdomain for OpenSandbox (default: sandbox.smartaihub.app)
#   ADMIN_EMAIL          - Email for Let's Encrypt registration (REQUIRED)
#   ADMIN_SSH_IPS        - Comma-separated IPs allowed for SSH (default: allow all — CHANGE IN PRODUCTION)
#   GCP_EGRESS_IPS       - Comma-separated GCP Cloud Run egress IPs/CIDRs allowed on port 443
#   OPENSANDBOX_API_KEY  - API key for OpenSandbox server (REQUIRED)
#   SKIP_CERTBOT         - Set to "true" to skip TLS cert issuance (e.g., for testing)
#   OPENSANDBOX_DIR      - Installation directory (default: /opt/opensandbox)
#
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SANDBOX_DOMAIN="${SANDBOX_DOMAIN:-sandbox.smartaihub.app}"
ADMIN_EMAIL="${ADMIN_EMAIL:-}"
ADMIN_SSH_IPS="${ADMIN_SSH_IPS:-}"
GCP_EGRESS_IPS="${GCP_EGRESS_IPS:-}"
OPENSANDBOX_API_KEY="${OPENSANDBOX_API_KEY:-}"
SKIP_CERTBOT="${SKIP_CERTBOT:-false}"
OPENSANDBOX_DIR="${OPENSANDBOX_DIR:-/opt/opensandbox}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HETZNER_ASSETS_DIR="${SCRIPT_DIR}/hetzner-sandbox"

# ---------------------------------------------------------------------------
# Colour output
# ---------------------------------------------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }
log_step()  { echo -e "${BLUE}[STEP]${NC}  $*"; }

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------

preflight() {
  log_step "Running pre-flight checks..."

  if [[ "$(id -u)" -ne 0 ]]; then
    log_error "This script must be run as root."
    exit 1
  fi

  if [[ -z "${ADMIN_EMAIL}" ]]; then
    log_error "ADMIN_EMAIL is required for Let's Encrypt registration."
    log_error "Export it before running: export ADMIN_EMAIL=you@example.com"
    exit 1
  fi

  if [[ -z "${OPENSANDBOX_API_KEY}" ]]; then
    log_error "OPENSANDBOX_API_KEY is required."
    log_error "Export it before running: export OPENSANDBOX_API_KEY=<secret>"
    exit 1
  fi

  # Detect OS
  if [[ -f /etc/os-release ]]; then
    # shellcheck source=/dev/null
    source /etc/os-release
    log_info "OS: ${PRETTY_NAME}"
    case "${ID}" in
      ubuntu|debian) ;;
      *) log_warn "Untested OS '${ID}'. Script targets Ubuntu 22.04 / Debian 12." ;;
    esac
  fi

  log_info "Pre-flight checks passed."
}

# ---------------------------------------------------------------------------
# Step 1 — System update and hardening
# ---------------------------------------------------------------------------

step_system_hardening() {
  log_step "Step 1: System update and hardening..."

  export DEBIAN_FRONTEND=noninteractive
  apt-get update -q
  apt-get upgrade -y -q

  apt-get install -y -q \
    curl \
    ca-certificates \
    gnupg \
    lsb-release \
    ufw \
    fail2ban \
    unattended-upgrades \
    apt-listchanges \
    jq \
    htop \
    logrotate \
    net-tools \
    cron

  # Configure unattended upgrades for security patches only
  if [[ ! -f /etc/apt/apt.conf.d/50unattended-upgrades.smartspec.bak ]]; then
    [[ -f /etc/apt/apt.conf.d/50unattended-upgrades ]] && \
      cp /etc/apt/apt.conf.d/50unattended-upgrades \
         /etc/apt/apt.conf.d/50unattended-upgrades.smartspec.bak
  fi

  cat > /etc/apt/apt.conf.d/20auto-upgrades << 'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF

  # Harden SSH — disable password authentication (idempotent)
  local sshd_conf=/etc/ssh/sshd_config
  if grep -qE "^#?PasswordAuthentication" "${sshd_conf}"; then
    sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' "${sshd_conf}"
  else
    echo "PasswordAuthentication no" >> "${sshd_conf}"
  fi

  if grep -qE "^#?PermitRootLogin" "${sshd_conf}"; then
    sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' "${sshd_conf}"
  else
    echo "PermitRootLogin prohibit-password" >> "${sshd_conf}"
  fi

  systemctl reload sshd

  # Enable and configure fail2ban (idempotent)
  systemctl enable fail2ban
  if [[ ! -f /etc/fail2ban/jail.local ]]; then
    cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
EOF
  fi
  systemctl restart fail2ban

  log_info "Step 1 complete."
}

# ---------------------------------------------------------------------------
# Step 2 — Docker installation
# ---------------------------------------------------------------------------

step_install_docker() {
  log_step "Step 2: Installing Docker..."

  # Idempotent: skip if docker is already installed and running
  if command -v docker &>/dev/null && docker info &>/dev/null; then
    log_info "Docker already installed and running — skipping."
    return 0
  fi

  # Add Docker's official GPG key
  install -m 0755 -d /etc/apt/keyrings
  if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
    curl -fsSL "https://download.docker.com/linux/$(. /etc/os-release && echo "${ID}")/gpg" \
      | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
  fi

  # Add Docker apt repository
  if [[ ! -f /etc/apt/sources.list.d/docker.list ]]; then
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
      https://download.docker.com/linux/$(. /etc/os-release && echo "${ID}") \
      $(. /etc/os-release && echo "${VERSION_CODENAME}") stable" \
      > /etc/apt/sources.list.d/docker.list
  fi

  apt-get update -q
  apt-get install -y -q \
    docker-ce \
    docker-ce-cli \
    containerd.io \
    docker-buildx-plugin \
    docker-compose-plugin

  systemctl enable docker
  systemctl start docker

  # Configure Docker daemon with log rotation
  if [[ ! -f /etc/docker/daemon.json ]]; then
    cat > /etc/docker/daemon.json << 'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "5"
  }
}
EOF
    systemctl reload docker || systemctl restart docker
  fi

  docker info > /dev/null
  log_info "Docker installed: $(docker --version)"
  log_info "Step 2 complete."
}

# ---------------------------------------------------------------------------
# Step 3 — Firewall (UFW)
# ---------------------------------------------------------------------------

step_configure_firewall() {
  log_step "Step 3: Configuring UFW firewall..."

  # Reset rules (idempotent)
  ufw --force reset

  ufw default deny incoming
  ufw default allow outgoing

  # Always allow port 80 for Let's Encrypt ACME HTTP-01
  ufw allow 80/tcp comment 'Let-Encrypt-ACME'

  # SSH access
  if [[ -n "${ADMIN_SSH_IPS}" ]]; then
    IFS=',' read -ra SSH_IPS <<< "${ADMIN_SSH_IPS}"
    for ip in "${SSH_IPS[@]}"; do
      ip="${ip// /}"  # strip whitespace
      ufw allow from "${ip}" to any port 22 proto tcp comment "admin-ssh"
      log_info "  SSH allowed from: ${ip}"
    done
  else
    log_warn "ADMIN_SSH_IPS not set — allowing SSH from ALL IPs (CHANGE IN PRODUCTION)."
    ufw allow 22/tcp comment 'ssh-any'
  fi

  # HTTPS access for GCP Cloud Run egress IPs
  if [[ -n "${GCP_EGRESS_IPS}" ]]; then
    IFS=',' read -ra GCP_IPS <<< "${GCP_EGRESS_IPS}"
    for cidr in "${GCP_IPS[@]}"; do
      cidr="${cidr// /}"
      ufw allow from "${cidr}" to any port 443 proto tcp comment "gcp-sandbox"
      log_info "  HTTPS allowed from: ${cidr}"
    done
  else
    log_warn "GCP_EGRESS_IPS not set — allowing HTTPS from ALL IPs (CHANGE IN PRODUCTION)."
    ufw allow 443/tcp comment 'https-any'
  fi

  ufw --force enable
  ufw status verbose

  log_info "Step 3 complete."
}

# ---------------------------------------------------------------------------
# Step 4 — Docker network for sandbox isolation
# ---------------------------------------------------------------------------

step_create_sandbox_network() {
  log_step "Step 4: Creating sandbox-exec Docker network..."

  if ! docker network ls --format '{{.Name}}' | grep -q '^sandbox-exec$'; then
    docker network create \
      --driver bridge \
      --internal \
      --label "com.smartspec.purpose=sandbox-isolation" \
      sandbox-exec
    log_info "Created Docker network: sandbox-exec (internal, no internet access)"
  else
    log_info "Docker network sandbox-exec already exists — skipping."
  fi

  log_info "Step 4 complete."
}

# ---------------------------------------------------------------------------
# Step 5 — Deploy OpenSandbox via Docker Compose
# ---------------------------------------------------------------------------

step_deploy_opensandbox() {
  log_step "Step 5: Deploying OpenSandbox Docker Compose stack..."

  mkdir -p "${OPENSANDBOX_DIR}"

  # Write .env file (idempotent — overwrites on re-run to apply updates)
  cat > "${OPENSANDBOX_DIR}/.env" << EOF
# OpenSandbox production configuration
# Generated by setup-hetzner-sandbox.sh — $(date -Iseconds)
OPENSANDBOX_API_KEY=${OPENSANDBOX_API_KEY}
EOF
  chmod 600 "${OPENSANDBOX_DIR}/.env"

  # Copy Docker Compose file
  if [[ -f "${HETZNER_ASSETS_DIR}/docker-compose.hetzner-sandbox.yml" ]]; then
    cp "${HETZNER_ASSETS_DIR}/docker-compose.hetzner-sandbox.yml" \
       "${OPENSANDBOX_DIR}/docker-compose.hetzner-sandbox.yml"
  else
    log_warn "docker-compose.hetzner-sandbox.yml not found at ${HETZNER_ASSETS_DIR}/"
    log_warn "Generating a minimal compose file in ${OPENSANDBOX_DIR}/"
    cat > "${OPENSANDBOX_DIR}/docker-compose.hetzner-sandbox.yml" << 'EOF'
# Minimal fallback — copy scripts/hetzner-sandbox/docker-compose.hetzner-sandbox.yml
# for the full production configuration.
services:
  opensandbox-server:
    image: registry.cn-hangzhou.aliyuncs.com/opensandbox/server:latest
    container_name: smartspec-opensandbox
    expose:
      - "8080"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    env_file:
      - .env
    environment:
      - OPENSANDBOX_RUNTIME=docker
      - OPENSANDBOX_DOCKER_NETWORK=sandbox-exec
      - OPENSANDBOX_DEFAULT_TIMEOUT=600
      - OPENSANDBOX_MAX_SANDBOXES=20
    deploy:
      resources:
        limits:
          cpus: '3.0'
          memory: 6G
    restart: unless-stopped
    networks:
      - opensandbox-network
networks:
  opensandbox-network:
    name: opensandbox-network
    driver: bridge
EOF
  fi

  docker compose \
    -f "${OPENSANDBOX_DIR}/docker-compose.hetzner-sandbox.yml" \
    --env-file "${OPENSANDBOX_DIR}/.env" \
    up -d --remove-orphans

  log_info "Step 5 complete."
}

# ---------------------------------------------------------------------------
# Step 6 — Nginx + TLS (Let's Encrypt)
# ---------------------------------------------------------------------------

step_setup_nginx_tls() {
  log_step "Step 6: Installing Nginx and obtaining TLS certificate..."

  apt-get install -y -q nginx certbot python3-certbot-nginx

  # Write Nginx config (idempotent)
  local nginx_conf_src="${HETZNER_ASSETS_DIR}/nginx-sandbox.conf"
  local nginx_conf_dest="/etc/nginx/sites-available/sandbox"
  local nginx_enabled="/etc/nginx/sites-enabled/sandbox"

  if [[ -f "${nginx_conf_src}" ]]; then
    # Substitute the API key placeholder
    sed "s|EXPECTED_API_KEY_PLACEHOLDER|${OPENSANDBOX_API_KEY}|g; \
         s|sandbox\.smartaihub\.app|${SANDBOX_DOMAIN}|g" \
      "${nginx_conf_src}" > "${nginx_conf_dest}"
  else
    log_warn "nginx-sandbox.conf not found at ${nginx_conf_src} — writing fallback config."
    cat > "${nginx_conf_dest}" << EOF
# Fallback config — generated by setup-hetzner-sandbox.sh
# Replace with scripts/hetzner-sandbox/nginx-sandbox.conf for full configuration.
server {
    listen 80;
    server_name ${SANDBOX_DOMAIN};
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl;
    server_name ${SANDBOX_DOMAIN};
    # Certbot will populate SSL directives below.
    location /health {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host \$host;
    }
    location /api/ {
        if (\$http_x_api_key != "${OPENSANDBOX_API_KEY}") {
            return 401 '{"error":"unauthorized"}';
        }
        proxy_pass http://127.0.0.1:8080;
        proxy_read_timeout 600s;
        proxy_connect_timeout 120s;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    location / { return 404; }
}
EOF
  fi

  # Remove default site if still present
  rm -f /etc/nginx/sites-enabled/default

  # Enable sandbox site
  if [[ ! -L "${nginx_enabled}" ]]; then
    ln -s "${nginx_conf_dest}" "${nginx_enabled}"
  fi

  nginx -t
  systemctl enable nginx
  systemctl reload nginx || systemctl start nginx

  # Obtain / renew TLS certificate
  if [[ "${SKIP_CERTBOT}" == "true" ]]; then
    log_warn "SKIP_CERTBOT=true — skipping Let's Encrypt certificate issuance."
  else
    if certbot certificates 2>/dev/null | grep -q "${SANDBOX_DOMAIN}"; then
      log_info "Certificate for ${SANDBOX_DOMAIN} already exists — renewing if needed."
      certbot renew --quiet --nginx
    else
      certbot --nginx \
        -d "${SANDBOX_DOMAIN}" \
        --non-interactive \
        --agree-tos \
        -m "${ADMIN_EMAIL}" \
        --redirect
    fi

    # Ensure systemd timer for auto-renewal is enabled
    if systemctl list-unit-files certbot.timer &>/dev/null; then
      systemctl enable certbot.timer
      systemctl start certbot.timer
    fi
  fi

  log_info "Step 6 complete."
}

# ---------------------------------------------------------------------------
# Step 7 — systemd service for OpenSandbox
# ---------------------------------------------------------------------------

step_install_systemd_service() {
  log_step "Step 7: Installing opensandbox systemd service..."

  local service_src="${HETZNER_ASSETS_DIR}/opensandbox.service"
  local service_dest="/etc/systemd/system/opensandbox.service"

  if [[ -f "${service_src}" ]]; then
    cp "${service_src}" "${service_dest}"
  else
    log_warn "opensandbox.service not found at ${service_src} — generating minimal unit."
    cat > "${service_dest}" << EOF
[Unit]
Description=SmartSpecPro OpenSandbox Server
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${OPENSANDBOX_DIR}
EnvironmentFile=-${OPENSANDBOX_DIR}/.env
ExecStart=/usr/bin/docker compose -f ${OPENSANDBOX_DIR}/docker-compose.hetzner-sandbox.yml up -d
ExecStop=/usr/bin/docker compose -f ${OPENSANDBOX_DIR}/docker-compose.hetzner-sandbox.yml down
Restart=on-failure
RestartSec=10s

[Install]
WantedBy=multi-user.target
EOF
  fi

  systemctl daemon-reload
  systemctl enable opensandbox.service

  # Only start if not already running
  if ! systemctl is-active opensandbox.service &>/dev/null; then
    systemctl start opensandbox.service
  fi

  log_info "Step 7 complete."
}

# ---------------------------------------------------------------------------
# Step 8 — Log rotation
# ---------------------------------------------------------------------------

step_configure_log_rotation() {
  log_step "Step 8: Configuring log rotation..."

  mkdir -p /var/log/opensandbox

  cat > /etc/logrotate.d/opensandbox << 'EOF'
/var/log/opensandbox/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 root adm
    sharedscripts
    postrotate
        /usr/bin/docker compose \
          -f /opt/opensandbox/docker-compose.hetzner-sandbox.yml \
          kill -s USR1 opensandbox-server 2>/dev/null || true
    endscript
}
EOF

  # Monitoring cron jobs (idempotent via named cron file)
  cat > /etc/cron.d/opensandbox-monitoring << 'EOF'
# OpenSandbox monitoring — generated by setup-hetzner-sandbox.sh

# Disk usage alert at 80%
*/5 * * * * root df -h / | awk 'NR==2 {gsub(/%/,"",$5); if ($5 > 80) print strftime("%Y-%m-%dT%H:%M:%S") " DISK_WARNING: " $5 "%% used"}' >> /var/log/opensandbox/disk-alerts.log 2>&1

# Container count (capacity planning)
* * * * * root echo "$(date -Iseconds) containers=$(docker ps --filter 'network=sandbox-exec' -q 2>/dev/null | wc -l)" >> /var/log/opensandbox/container-count.log 2>&1
EOF

  chmod 644 /etc/cron.d/opensandbox-monitoring

  log_info "Step 8 complete."
}

# ---------------------------------------------------------------------------
# Step 9 — Health check verification
# ---------------------------------------------------------------------------

step_verify_health() {
  log_step "Step 9: Verifying services are healthy..."

  local max_wait=60
  local elapsed=0

  log_info "Waiting for OpenSandbox server on localhost:8080 (up to ${max_wait}s)..."
  while [[ ${elapsed} -lt ${max_wait} ]]; do
    if curl -sf "http://localhost:8080/health" > /dev/null 2>&1; then
      log_info "OpenSandbox server is healthy at localhost:8080."
      break
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done

  if [[ ${elapsed} -ge ${max_wait} ]]; then
    log_warn "OpenSandbox server did not respond within ${max_wait}s — check 'docker ps' and logs."
  fi

  if curl -sf "http://localhost/health" > /dev/null 2>&1; then
    log_info "Nginx proxy is healthy at localhost:80."
  else
    log_warn "Nginx proxy health check failed — check 'systemctl status nginx'."
  fi

  echo ""
  echo "================================================================"
  echo "  Setup Summary"
  echo "================================================================"
  echo "  Domain:       ${SANDBOX_DOMAIN}"
  echo "  Directory:    ${OPENSANDBOX_DIR}"
  echo "  Docker:       $(docker --version)"
  echo "  Nginx:        $(nginx -v 2>&1)"
  echo "  UFW:          $(ufw status | head -1)"
  echo ""
  echo "  Services:"
  systemctl is-active opensandbox.service && echo "    opensandbox:   active" || echo "    opensandbox:   INACTIVE"
  systemctl is-active nginx              && echo "    nginx:         active" || echo "    nginx:         INACTIVE"
  systemctl is-active fail2ban           && echo "    fail2ban:      active" || echo "    fail2ban:      INACTIVE"
  echo ""
  echo "  Next steps:"
  echo "    1. Verify TLS: openssl s_client -connect ${SANDBOX_DOMAIN}:443 -servername ${SANDBOX_DOMAIN} </dev/null"
  echo "    2. Run connectivity tests: bash ${HETZNER_ASSETS_DIR}/verify-connectivity.sh"
  echo "================================================================"

  log_info "Step 9 complete."
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

main() {
  echo ""
  echo "================================================================"
  echo "  SmartSpecPro — Hetzner OpenSandbox Provisioning"
  echo "  $(date)"
  echo "================================================================"
  echo ""

  preflight
  step_system_hardening
  step_install_docker
  step_configure_firewall
  step_create_sandbox_network
  step_deploy_opensandbox
  step_setup_nginx_tls
  step_install_systemd_service
  step_configure_log_rotation
  step_verify_health

  echo ""
  log_info "Provisioning complete. Run verify-connectivity.sh to confirm end-to-end connectivity."
}

main "$@"
