diff --git a/docker-compose.opensandbox.yml b/docker-compose.opensandbox.yml
new file mode 100644
index 0000000..f4805e6
--- /dev/null
+++ b/docker-compose.opensandbox.yml
@@ -0,0 +1,60 @@
+# SmartSpecPro - OpenSandbox Execution Plane
+# Runs the OpenSandbox server for secure, isolated code/media execution.
+# Separate from main infra and media stacks to avoid conflicts.
+#
+# REQUIRES: Docker running, Docker socket accessible
+#
+# Usage:
+#   docker compose -f docker-compose.opensandbox.yml up -d
+#   docker compose -f docker-compose.opensandbox.yml down
+#
+# Security note:
+#   The opensandbox-server container has Docker socket access and is a
+#   privileged infrastructure component. Never expose port 8080 externally.
+
+services:
+  # ============================================
+  # OPENSANDBOX SERVER
+  # Manages sandbox container lifecycle: create, execute, destroy.
+  # Communicates with Docker via socket to spawn isolated containers.
+  # ============================================
+  opensandbox-server:
+    image: registry.cn-hangzhou.aliyuncs.com/opensandbox/server:latest
+    container_name: smartspec-opensandbox
+    ports:
+      - "127.0.0.1:8080:8080"
+    volumes:
+      - /var/run/docker.sock:/var/run/docker.sock:ro
+    environment:
+      - OPENSANDBOX_API_KEY=${OPENSANDBOX_API_KEY:-dev-sandbox-key-change-me}
+      - OPENSANDBOX_RUNTIME=docker
+      - OPENSANDBOX_DOCKER_NETWORK=opensandbox-exec
+      - OPENSANDBOX_DEFAULT_TIMEOUT=600
+      - OPENSANDBOX_MAX_SANDBOXES=20
+    deploy:
+      resources:
+        limits:
+          cpus: '2.0'
+          memory: 2G
+        reservations:
+          cpus: '0.5'
+          memory: 512M
+    healthcheck:
+      test: ["CMD-SHELL", "curl -sf http://localhost:8080/health || exit 1"]
+      interval: 15s
+      timeout: 5s
+      start_period: 30s
+      retries: 3
+    restart: unless-stopped
+    networks:
+      - opensandbox-network
+      - opensandbox-exec
+
+networks:
+  opensandbox-network:
+    name: opensandbox-network
+    driver: bridge
+  opensandbox-exec:
+    name: opensandbox-exec
+    driver: bridge
+    internal: true
diff --git a/run-services.sh b/run-services.sh
index 24c76d5..d6e4008 100755
--- a/run-services.sh
+++ b/run-services.sh
@@ -11,6 +11,7 @@ set -e
 
 PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
 MEDIA_COMPOSE="docker-compose.media.yml"
+SANDBOX_COMPOSE="docker-compose.opensandbox.yml"
 
 # Load NVM if available
 export NVM_DIR="$HOME/.nvm"
@@ -228,7 +229,7 @@ stop_screen_service() {
 # Docker media workers management
 # ============================================================
 start_media_workers() {
-    log_step "Starting Docker media workers (celery-media, celery-video, celery-beat, flower)..."
+    log_step "Starting Docker media workers (celery-media, celery-video, celery-import, celery-beat, flower)..."
 
     if ! docker network ls --format '{{.Name}}' | grep -q '^smartspec-network$'; then
         log_warn "Network smartspec-network not found — creating it"
@@ -254,6 +255,58 @@ stop_media_workers() {
     log_info "Docker media workers stopped"
 }
 
+# ============================================================
+# OpenSandbox management (optional)
+# ============================================================
+wait_for_sandbox() {
+    local max_attempts=30
+    local attempt=1
+
+    log_step "Waiting for OpenSandbox to be ready..."
+    while [ $attempt -le $max_attempts ]; do
+        if curl -sf http://localhost:8080/health > /dev/null 2>&1; then
+            log_info "OpenSandbox is ready (${attempt}s)"
+            return 0
+        fi
+        echo -n "."
+        sleep 2
+        ((attempt++))
+    done
+
+    log_warn "OpenSandbox failed to start after $((max_attempts * 2))s (optional service)"
+    return 1
+}
+
+start_sandbox() {
+    if docker ps --format '{{.Names}}' | grep -q '^smartspec-opensandbox$'; then
+        log_warn "OpenSandbox is already running"
+        return 0
+    fi
+
+    log_step "Starting OpenSandbox execution plane..."
+    cd "$PROJECT_ROOT"
+    docker compose -f "$SANDBOX_COMPOSE" up -d > /dev/null 2>&1
+
+    if wait_for_sandbox; then
+        log_info "OpenSandbox started successfully"
+        return 0
+    else
+        log_warn "OpenSandbox failed to start (system will use legacy mode)"
+        return 1
+    fi
+}
+
+stop_sandbox() {
+    if docker ps --format '{{.Names}}' | grep -q '^smartspec-opensandbox$'; then
+        log_step "Stopping OpenSandbox..."
+        cd "$PROJECT_ROOT"
+        docker compose -f "$SANDBOX_COMPOSE" down > /dev/null 2>&1 || true
+        log_info "OpenSandbox stopped"
+    else
+        log_warn "OpenSandbox is not running"
+    fi
+}
+
 # ============================================================
 # Nginx management
 # ============================================================
@@ -400,7 +453,7 @@ cmd_start() {
     # Brief validation check
     sleep 3
     local failed_workers=0
-    for worker in smartspec-celery-media smartspec-celery-beat; do
+    for worker in smartspec-celery-media smartspec-celery-import smartspec-celery-beat; do
         if ! docker ps --format '{{.Names}}' | grep -q "^${worker}$"; then
             log_warn "${worker} is not running"
             ((failed_workers++))
@@ -413,6 +466,14 @@ cmd_start() {
         log_info "All media workers validated"
     fi
 
+    # Step 7: OpenSandbox (optional — failure does not block startup)
+    echo ""
+    if [ -f "$PROJECT_ROOT/$SANDBOX_COMPOSE" ]; then
+        start_sandbox || log_warn "OpenSandbox unavailable — system will use legacy execution mode"
+    else
+        log_warn "OpenSandbox compose file not found — skipping"
+    fi
+
     echo ""
     log_info "All services started successfully!"
 
@@ -428,6 +489,7 @@ cmd_start() {
     echo "  │ Public Domain      │ https://smartaihub.app                 │"
     echo "  │ Docker Status URL  │ https://docker.smartaihub.app          │"
     echo "  │ Public API         │ https://api.smartaihub.app             │"
+    echo "  │ OpenSandbox API   │ http://localhost:8080 (when enabled)   │"
     echo "  └─────────────────────────────────────────────────────────────┘"
     echo ""
     echo -e "${CYAN}Useful commands:${NC}"
@@ -463,6 +525,9 @@ cmd_stop() {
     # Stop Docker media workers
     stop_media_workers
 
+    # Stop OpenSandbox
+    stop_sandbox
+
     # Stop Nginx
     stop_nginx
 
@@ -517,6 +582,21 @@ cmd_status() {
         echo -e "  ${RED}x${NC} Nginx            Not running (https://smartaihub.app unavailable!)"
     fi
 
+    echo ""
+    # 1b. Sandbox Layer (optional)
+    echo -e "${BLUE}--- Sandbox Services (optional) ---${NC}"
+
+    if docker ps --format '{{.Names}}' | grep -q '^smartspec-opensandbox$'; then
+        local sandbox_health=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}unknown{{end}}' smartspec-opensandbox 2>/dev/null || echo "unknown")
+        if [ "$sandbox_health" = "healthy" ]; then
+            echo -e "  ${GREEN}✓${NC} OpenSandbox      Running (healthy) [port 8080]"
+        else
+            echo -e "  ${YELLOW}!${NC} OpenSandbox      Running ($sandbox_health) [port 8080]"
+        fi
+    else
+        echo -e "  ${YELLOW}-${NC} OpenSandbox      Not running (optional)"
+    fi
+
     echo ""
     # 2. Application Layer (systemd managed)
     echo -e "${BLUE}--- Application Services (systemd) ---${NC}"
@@ -557,7 +637,7 @@ cmd_status() {
     # 3. Background Workers
     echo -e "${BLUE}--- Celery Workers (Background Tasks) ---${NC}"
 
-    for worker in smartspec-celery-media smartspec-celery-video smartspec-celery-beat smartspec-flower; do
+    for worker in smartspec-celery-media smartspec-celery-video smartspec-celery-import smartspec-celery-beat smartspec-flower; do
         local worker_name=$(echo $worker | sed 's/smartspec-celery-//' | sed 's/smartspec-//')
         if docker ps --format '{{.Names}}' | grep -q "^${worker}$"; then
             local worker_health=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}ok{{end}}' "$worker" 2>/dev/null || echo "")
@@ -571,7 +651,7 @@ cmd_status() {
     # 4. Summary
     echo -e "${BLUE}--- Service Summary ---${NC}"
 
-    local total_services=10
+    local total_services=11
     local running_count=0
 
     docker ps --format '{{.Names}}' | grep -q '^smartspec-postgres$' && ((running_count++)) || true
@@ -581,6 +661,7 @@ cmd_status() {
     [ "$(systemctl is-active smartspec-web.service 2>/dev/null)" = "active" ] && ((running_count++)) || true
     screen -list 2>/dev/null | grep -q "\.smartspec-docker-status" && ((running_count++)) || true
     docker ps --format '{{.Names}}' | grep -q '^smartspec-celery-media$' && ((running_count++)) || true
+    docker ps --format '{{.Names}}' | grep -q '^smartspec-celery-import$' && ((running_count++)) || true
     docker ps --format '{{.Names}}' | grep -q '^smartspec-celery-beat$' && ((running_count++)) || true
     docker ps --format '{{.Names}}' | grep -q '^smartspec-flower$' && ((running_count++)) || true
 
@@ -634,13 +715,18 @@ cmd_attach() {
             log_info "Media workers run in Docker. Use these commands instead:"
             echo "  docker logs -f smartspec-celery-media   # Media worker logs"
             echo "  docker logs -f smartspec-celery-video   # Video worker logs"
+            echo "  docker logs -f smartspec-celery-import  # Import worker logs"
             echo "  docker logs -f smartspec-celery-beat    # Beat scheduler logs"
             echo "  docker logs -f smartspec-flower         # Flower dashboard logs"
             echo "  http://localhost:5555                    # Flower web dashboard"
             ;;
+        sandbox)
+            log_info "Showing live OpenSandbox logs (Ctrl+C to exit)..."
+            docker logs -f smartspec-opensandbox 2>&1 || echo "  Container not running"
+            ;;
         *)
             log_error "Unknown service: $service"
-            echo "Usage: ./run-services.sh attach [web|backend|docker|media]"
+            echo "Usage: ./run-services.sh attach [web|backend|docker|media|sandbox]"
             exit 1
             ;;
     esac
@@ -682,15 +768,22 @@ cmd_logs() {
             echo -e "${CYAN}=== celery-video (last 30 lines) ===${NC}"
             docker logs --tail 30 smartspec-celery-video 2>&1 || echo "  Container not running"
             echo ""
+            echo -e "${CYAN}=== celery-import (last 30 lines) ===${NC}"
+            docker logs --tail 30 smartspec-celery-import 2>&1 || echo "  Container not running"
+            echo ""
             echo -e "${CYAN}=== celery-beat (last 10 lines) ===${NC}"
             docker logs --tail 10 smartspec-celery-beat 2>&1 || echo "  Container not running"
             echo ""
             log_info "For live logs: docker logs -f smartspec-celery-media"
             log_info "Flower dashboard: http://localhost:5555"
             ;;
+        sandbox)
+            log_info "Showing recent logs for OpenSandbox..."
+            docker logs --tail 50 smartspec-opensandbox 2>&1 || echo "  Container not running"
+            ;;
         *)
             log_error "Unknown service: $service"
-            echo "Usage: ./run-services.sh logs [web|backend|docker|media]"
+            echo "Usage: ./run-services.sh logs [web|backend|docker|media|sandbox]"
             exit 1
             ;;
     esac
@@ -727,9 +820,15 @@ cmd_restart() {
                 docker compose -p smartspecpro -f "$MEDIA_COMPOSE" restart
                 log_info "Docker media workers restarted"
                 ;;
+            sandbox)
+                log_step "Restarting OpenSandbox..."
+                stop_sandbox
+                sleep 1
+                start_sandbox
+                ;;
             *)
                 log_error "Unknown service: $service"
-                echo "Usage: ./run-services.sh restart [web|backend|docker|media]"
+                echo "Usage: ./run-services.sh restart [web|backend|docker|media|sandbox]"
                 exit 1
                 ;;
         esac
@@ -754,7 +853,8 @@ cmd_help() {
     echo "  web       SmartSpec Web (systemd, auto-restart on crash)"
     echo "  backend   Python Backend (systemd, auto-restart on crash)"
     echo "  docker    Docker Status UI (screen session)"
-    echo "  media     Media Workers (Docker: celery-media, celery-video, celery-beat, flower)"
+    echo "  media     Media Workers (Docker: celery-media, celery-video, celery-import, celery-beat, flower)"
+    echo "  sandbox   OpenSandbox execution plane (Docker, optional)"
     echo ""
     echo -e "${CYAN}Service Management:${NC}"
     echo "  Web and Backend are managed by systemd with Restart=always."
