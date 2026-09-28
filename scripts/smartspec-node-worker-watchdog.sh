#!/usr/bin/env bash

set -u

SERVICE_NAME="${SMARTSPEC_NODE_WORKER_SERVICE:-smartspec-node-worker.service}"
PROJECT_ROOT="${SMARTSPEC_PROJECT_ROOT:-/home/dev/projects/SmartSpecPro}"
ENV_FILE="${SMARTSPEC_NODE_WORKER_ENV_FILE:-${PROJECT_ROOT}/apps/web/.env}"
HEARTBEAT_FILE="${FEATURE_186_NODE_WORKER_HEARTBEAT_FILE:-/run/smartspec-node-worker/heartbeat}"
LEGACY_HEARTBEAT_FILE="${SMARTSPEC_NODE_WORKER_LEGACY_HEARTBEAT_FILE:-${PROJECT_ROOT}/logs/smartspec-node-worker.heartbeat}"
STATE_FILE="${SMARTSPEC_NODE_WORKER_WATCHDOG_STATE:-/run/smartspec-node-worker-watchdog.restarts}"
CHECK_INTERVAL="${SMARTSPEC_NODE_WORKER_WATCHDOG_INTERVAL_SECONDS:-10}"
HEARTBEAT_STALE_MS=30000
STARTUP_GRACE_MS=60000
DISPATCH_BACKLOG_STALE_MS=120000
RESTART_WINDOW_SECONDS=600
MAX_RESTARTS_IN_WINDOW=3
WEBHOOK_URL="${ALERT_WEBHOOK_URL:-}"

log() {
    printf '[node-worker-watchdog] %s %s\n' "$(date -Is)" "$*"
}

send_alert() {
    local level="$1"
    local message="$2"
    [ -n "$WEBHOOK_URL" ] || return 0
    local escaped
    escaped="$(printf '%s' "$message" | sed 's/\\/\\\\/g; s/"/\\"/g; s/$/\\n/' | tr -d '\n')"
    curl -sf --max-time 5 \
        -H 'Content-Type: application/json' \
        -X POST \
        -d "{\"username\":\"SmartSpec Node Worker Watchdog\",\"content\":\"[${level}] ${escaped}\"}" \
        "$WEBHOOK_URL" >/dev/null 2>&1 || true
}

load_env_if_needed() {
    if [ -z "${DATABASE_URL:-}" ] && [ -f "$ENV_FILE" ]; then
        set -a
        # shellcheck disable=SC1090
        . "$ENV_FILE"
        set +a
    fi
}

read_heartbeat() {
    local heartbeat_file="$HEARTBEAT_FILE"
    if [ ! -r "$heartbeat_file" ] && [ -r "$LEGACY_HEARTBEAT_FILE" ]; then
        heartbeat_file="$LEGACY_HEARTBEAT_FILE"
    fi
    if [ ! -r "$heartbeat_file" ]; then
        printf '%s|%s\n' '-1' 'missing'
        return 0
    fi
    local timestamp phase
    IFS=$'\t' read -r timestamp phase _ < "$heartbeat_file" || true
    if ! [[ "$timestamp" =~ ^[0-9]+$ ]]; then
        printf '%s|%s\n' '-1' 'invalid'
        return 0
    fi
    printf '%s|%s\n' "$timestamp" "${phase:-unknown}"
}

read_queue_health() {
    if [ -z "${DATABASE_URL:-}" ]; then
        printf '%s|%s|%s\n' '-1' '-1' '-1'
        return 0
    fi
    local result
    result="$(psql "$DATABASE_URL" -At -F '|' -c '
WITH queued AS (
  SELECT count(*)::int AS queued_count,
         COALESCE(EXTRACT(EPOCH FROM (now() - min(w."createdAt"))) * 1000, 0)::bigint AS oldest_age_ms
  FROM worker_jobs w
  WHERE w."runtimeType" = '\''node_job_worker'\''
    AND w."jobType" IN (
      '\''webhook.dispatch'\'', '\''webhook.api_delivery'\'', '\''embedding.generate'\'',
      '\''capacity.assessment'\'', '\''channel.delivery'\'', '\''automation.execute'\'',
      '\''database.backup'\'', '\''database.backup.maintenance'\'', '\''worker.heartbeat_retention'\'',
      '\''library.trash_purge'\'', '\''storyboard.skill.run'\'', '\''skill.execute'\'',
      '\''scheduled.skill.execute'\'', '\''notification.escalation'\'', '\''notification.digest'\'',
      '\''notification.retention'\'', '\''notification.webhook_delivery'\'', '\''memory.archive_cleanup'\'',
      '\''memory.chunk_cleanup'\'', '\''memory.embedding_reconciliation'\'', '\''memory.eviction'\'',
      '\''vertical_drama.character_prompt'\'', '\''vertical_drama.draft_composition'\'',
      '\''vertical_drama.draft_quality_qc'\'', '\''vertical_drama.episode_stage'\'',
      '\''vertical_drama.interactive'\'', '\''vertical_drama.shot_prompt'\'',
      '\''vertical_drama.shot_video_prompt'\'', '\''vertical_drama.story'\'',
      '\''video.intelligence'\'', '\''video.composition_scan'\'', '\''content_protection.verify'\'',
      '\''computer_use.browser'\''
    )
    AND w.status = '\''queued'\''
    AND w."operatorReviewRequired" = false
    AND EXISTS (
      SELECT 1
      FROM worker_job_outbox o
      INNER JOIN worker_job_dispatches d
        ON d."workerJobId" = o."workerJobId"
       AND d."dedupeKey" = o."dedupeKey"
       AND d.adapter = '\''postgres-pull'\''
       AND d."consumedAt" IS NULL
      WHERE o."workerJobId" = w.id
        AND o."publishedAt" IS NOT NULL
        AND o."cancelledAt" IS NULL
        AND o."quarantinedAt" IS NULL
    )
    ), active AS (
  SELECT
    count(*)::int AS active_count,
    count(*) FILTER (WHERE "leaseExpiresAt" > now())::int AS active_lease_valid_count
  FROM worker_jobs
  WHERE "runtimeType" = '\''node_job_worker'\''
    AND "jobType" IN (
      '\''webhook.dispatch'\'', '\''webhook.api_delivery'\'', '\''embedding.generate'\'',
      '\''capacity.assessment'\'', '\''channel.delivery'\'', '\''automation.execute'\'',
      '\''database.backup'\'', '\''database.backup.maintenance'\'', '\''worker.heartbeat_retention'\'',
      '\''library.trash_purge'\'', '\''storyboard.skill.run'\'', '\''skill.execute'\'',
      '\''scheduled.skill.execute'\'', '\''notification.escalation'\'', '\''notification.digest'\'',
      '\''notification.retention'\'', '\''notification.webhook_delivery'\'', '\''memory.archive_cleanup'\'',
      '\''memory.chunk_cleanup'\'', '\''memory.embedding_reconciliation'\'', '\''memory.eviction'\'',
      '\''vertical_drama.character_prompt'\'', '\''vertical_drama.draft_composition'\'',
      '\''vertical_drama.draft_quality_qc'\'', '\''vertical_drama.episode_stage'\'',
      '\''vertical_drama.interactive'\'', '\''vertical_drama.shot_prompt'\'',
      '\''vertical_drama.shot_video_prompt'\'', '\''vertical_drama.story'\'',
      '\''video.intelligence'\'', '\''video.composition_scan'\'', '\''content_protection.verify'\'',
      '\''computer_use.browser'\''
    )
    AND status IN ('\''leased'\'', '\''claimed'\'', '\''preparing'\'', '\''running'\'', '\''uploading'\'')
)
SELECT queued.queued_count, queued.oldest_age_ms, active.active_count, active.active_lease_valid_count
FROM queued, active;
' 2>/dev/null)" || {
        printf '%s|%s|%s\n' '-1' '-1' '-1'
        return 0
    }
    printf '%s\n' "$result"
}

prune_restart_history() {
    local now cutoff
    now="$(date +%s)"
    cutoff=$((now - RESTART_WINDOW_SECONDS))
    mkdir -p "$(dirname "$STATE_FILE")"
    touch "$STATE_FILE"
    awk -v cutoff="$cutoff" '$1 >= cutoff { print $1 }' "$STATE_FILE" > "${STATE_FILE}.tmp"
    mv "${STATE_FILE}.tmp" "$STATE_FILE"
    printf '%s\n' "$now"
}

restart_worker() {
    local reason="$1"
    local now count
    now="$(prune_restart_history)"
    count="$(wc -l < "$STATE_FILE" | tr -d ' ')"
    if [ "$count" -ge "$MAX_RESTARTS_IN_WINDOW" ]; then
        log "CRITICAL restart circuit open count=${count} reason=${reason}"
        send_alert "CRITICAL" "node worker restart circuit open (count=${count}, reason=${reason})"
        return 1
    fi
    printf '%s\n' "$now" >> "$STATE_FILE"
    log "restarting ${SERVICE_NAME} reason=${reason} restart_count=$((count + 1))"
    if systemctl restart "$SERVICE_NAME"; then
        send_alert "CRITICAL" "node worker restarted automatically (reason=${reason})"
        return 0
    fi
    log "CRITICAL unable to restart ${SERVICE_NAME}"
    send_alert "CRITICAL" "node worker restart failed (reason=${reason})"
    return 1
}

check_once() {
    load_env_if_needed

    local service_active service_active_since_us service_age_ms
    local heartbeat_line heartbeat_ms heartbeat_phase now_ms heartbeat_age now_monotonic_ms
    local queue_line queued_count oldest_age active_count active_lease_valid_count reason=''
    service_active="$(systemctl is-active "$SERVICE_NAME" 2>/dev/null || true)"
    service_active_since_us="$(systemctl show "$SERVICE_NAME" -p ActiveEnterTimestampMonotonic --value 2>/dev/null || true)"
    now_monotonic_ms=$(( $(awk '{ print int($1 * 1000) }' /proc/uptime) ))
    if [[ "$service_active_since_us" =~ ^[0-9]+$ ]]; then
        service_age_ms=$((now_monotonic_ms - service_active_since_us / 1000))
    else
        service_age_ms=-1
    fi
    heartbeat_line="$(read_heartbeat)"
    IFS='|' read -r heartbeat_ms heartbeat_phase <<< "$heartbeat_line"
    now_ms=$(( $(date +%s) * 1000 ))
    if [ "$heartbeat_ms" -ge 0 ]; then
        heartbeat_age=$((now_ms - heartbeat_ms))
    else
        heartbeat_age=-1
    fi

    queue_line="$(read_queue_health)"
    IFS='|' read -r queued_count oldest_age active_count active_lease_valid_count <<< "$queue_line"
    if [ "$queued_count" -lt 0 ]; then
        log "database probe unavailable; service=${service_active} heartbeat_phase=${heartbeat_phase}"
        send_alert "CRITICAL" "node worker watchdog cannot read PostgreSQL queue"
        return 0
    fi

    if [ "$service_active" != "active" ]; then
        reason="service_inactive"
    elif { [ "$heartbeat_age" -lt 0 ] || [ "$heartbeat_age" -gt "$HEARTBEAT_STALE_MS" ]; } \
        && [ "${active_lease_valid_count:-0}" -eq 0 ] \
        && { [ "$service_age_ms" -lt 0 ] || [ "$service_age_ms" -ge "$STARTUP_GRACE_MS" ]; }; then
        reason="heartbeat_stale:${heartbeat_age}ms"
    elif [ "${active_count:-0}" -gt 0 ] \
        && [ "${active_lease_valid_count:-0}" -eq 0 ] \
        && { [ "$service_age_ms" -lt 0 ] || [ "$service_age_ms" -ge "$STARTUP_GRACE_MS" ]; }; then
        reason="active_lease_expired:${active_count}"
    elif [ "$queued_count" -gt 0 ] && [ "$oldest_age" -gt "$DISPATCH_BACKLOG_STALE_MS" ] && [ "$active_count" -eq 0 ]; then
        reason="dispatch_backlog:${queued_count}/${oldest_age}ms/active=${active_count}"
    fi

    if [ -n "$reason" ]; then
        restart_worker "$reason" || true
    else
        log "healthy service=${service_active} phase=${heartbeat_phase} service_age_ms=${service_age_ms} heartbeat_age_ms=${heartbeat_age} queued=${queued_count} oldest_queue_age_ms=${oldest_age} active=${active_count} active_lease_valid=${active_lease_valid_count}"
    fi
}

case "${1:-daemon}" in
    once)
        check_once
        ;;
    daemon)
        log "started interval=${CHECK_INTERVAL}s service=${SERVICE_NAME}"
        while true; do
            check_once
            sleep "$CHECK_INTERVAL"
        done
        ;;
    *)
        printf 'Usage: %s {once|daemon}\n' "$0"
        exit 2
        ;;
esac
