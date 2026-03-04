# Presentation Edit Additional Rollout Runbook

## Scope
- Feature: `030-PresentationEditAdditional`
- Worker target: `celery-presentation` (`presentation_export` queue)
- Rollout intent: safe staged promotion with measurable stop conditions and explicit rollback ownership

## Worker Operations

### Restart / Status / Logs
```bash
docker compose -p smartspecpro -f docker-compose.media.yml restart celery-presentation
docker compose -p smartspecpro -f docker-compose.media.yml ps celery-presentation
docker logs --tail 200 smartspec-celery-presentation
```

### Health Checks
1. Verify worker consumes `presentation_export` queue.
2. Trigger one export and confirm `queued -> processing -> done`.
3. If stuck, validate `INTERNAL_RENDER_BASE_URL` and `JWT_SECRET`.

## Stage Policy
- Stage progression: `dogfood -> 1% -> 5% -> 25% -> 50% -> 100%`
- Hold rule for every promotion: minimum 24h and 500 exports (whichever is later).
- Mandatory rollback rehearsal at <=5% before promotion to 25%.

## Canary Cohort Composition Gate
- media-heavy decks >= 30% of sampled exports (video or SVG heavy).
- dense-layout decks >= 20% of sampled exports (>=20 visible elements per slide).
- low-complexity baseline decks included in every stage sample window.

## Stop Conditions (Immediate Promotion Freeze)
- success rate drop > 1.0% vs control
- `E_SLIDE_READY_TIMEOUT > 0.3% slides`
- `W_SVG_PLACEHOLDER > 0.5% slides`
- p95 export latency regression > 15%
- crash/OOM +0.1% absolute

## Alert Windows and Rollback SLA
- fast window: 5m
- stability window: 30m
- engineering on-call must acknowledge within 10 minutes of confirmed trigger.
- rollback execution starts within 15 minutes of confirmed trigger.

## Rollback Ownership
- Canvas Edit FE on-call (primary)
- Export pipeline on-call (secondary)
- PM can request rollback; engineering on-call executes rollback.

## Recovery Verification Checklist
1. Confirm stage promotion is frozen and previous stable stage traffic is restored.
2. Validate timeout/warning/error metrics return under thresholds.
3. Re-run representative canary sample (media-heavy, dense, low-complexity baseline).
4. Log incident summary and owner sign-off before resuming promotion.
