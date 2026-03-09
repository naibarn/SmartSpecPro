"""Celery tasks for the Automation Copilot feature.

Two tasks following the same pattern as agency_creator_task.py:
  - automation_analyze_task  (Phase 1: parse prompt → intent)
  - automation_execute_task  (Phase 2: generate scripts + execute)

Status is stored in Redis under key:
  automation:{task_id} → JSON status dict, TTL 3600s
"""

import asyncio
import json
import os
from typing import Any
from urllib.parse import urlparse

import redis as sync_redis
import structlog

from app.core.celery_app import celery_app

logger = structlog.get_logger(__name__)

REDIS_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
RESULT_TTL = 3600  # 1 hour

_redis_pool = sync_redis.ConnectionPool.from_url(REDIS_URL, decode_responses=True)


def _get_redis() -> sync_redis.Redis:
    return sync_redis.Redis(connection_pool=_redis_pool)


def _run_async(coro) -> Any:
    """Run async coroutine on the persistent worker event loop.

    Playwright binds to the event loop where the browser was launched.
    We MUST reuse the same loop — creating a new loop causes cross-loop
    hangs on all Playwright operations.
    """
    from app.services.browser_pool import get_worker_loop

    loop = get_worker_loop()
    return loop.run_until_complete(coro)


def _set_status(task_id: str, status: dict) -> None:
    try:
        r = _get_redis()
        r.set(f"automation:{task_id}", json.dumps(status, default=str), ex=RESULT_TTL)
    except Exception as exc:
        logger.error("automation_redis_set_failed", task_id=task_id, error=str(exc)[:200])


def get_status(task_id: str) -> dict | None:
    """Read automation task status from Redis."""
    try:
        r = _get_redis()
        raw = r.get(f"automation:{task_id}")
        if raw is None:
            return None
        return json.loads(raw)
    except Exception as exc:
        logger.error("automation_redis_get_failed", task_id=task_id, error=str(exc)[:200])
        return None


@celery_app.task(
    bind=True,
    max_retries=0,
    soft_time_limit=120,
    time_limit=150,
    queue="media",
)
def automation_analyze_task(
    self,
    task_id: str,
    user_jwt: str,
    user_id: int,
    tenant_id: str,
    prompt: str,
) -> dict:
    """Phase 1: Parse prompt into intent, return preview or clarification questions."""

    async def _analyze():
        from app.services.automation_copilot import AutomationCopilot
        from app.services.browser_pool import get_browser_pool
        from app.services.llm_gateway_client import LLMGatewayClient
        from app.services.selector_cache import SelectorCache
        from app.services.playwright_script_generator import PlaywrightScriptGenerator
        from app.services.self_healing_executor import SelfHealingExecutor

        import redis.asyncio as aioredis

        redis_client = aioredis.from_url(REDIS_URL)
        gateway = LLMGatewayClient()
        try:
            pool = get_browser_pool()
            cache = SelectorCache(redis_client=redis_client)
            generator = PlaywrightScriptGenerator(browser_pool=pool, selector_cache=cache)
            executor = SelfHealingExecutor(
                browser_pool=pool,
                selector_cache=cache,
                redis_client=redis_client,
            )
            copilot = AutomationCopilot(
                script_generator=generator,
                executor=executor,
                gateway_client=gateway,
            )

            _set_status(task_id, {
                "status": "analyzing",
                "tenant_id": tenant_id,
                "user_id": user_id,
            })

            result = await copilot.analyze(prompt=prompt, tenant_id=tenant_id, user_id=user_id)

            status_data = {
                "status": result.status,
                "tenant_id": tenant_id,
                "user_id": user_id,
                "intent": result.intent.model_dump() if result.intent else None,
                "plan_summary": result.plan_summary,
                "questions": result.questions,
            }
            _set_status(task_id, status_data)
            return status_data
        finally:
            await gateway.aclose()
            await redis_client.close()

    try:
        return _run_async(_analyze())
    except Exception as exc:
        logger.error("automation_analyze_failed", task_id=task_id, error=str(exc)[:500])
        _set_status(task_id, {
            "status": "failed",
            "error": str(exc)[:500],
            "tenant_id": tenant_id,
        })
        return {"status": "failed", "error": str(exc)[:500]}


@celery_app.task(
    bind=True,
    max_retries=0,
    soft_time_limit=300,
    time_limit=360,
    queue="media",
)
def automation_execute_task(
    self,
    task_id: str,
    execution_id: str,
    user_jwt: str,
    user_id: int,
    tenant_id: str,
    intent_json: str,
    vision_model: str,
    allowed_domains: list[str],
    reservation_id: str | None = None,
) -> dict:
    """Phase 2: Generate scripts + execute with self-healing."""

    async def _execute():
        from app.services.automation_copilot import AutomationCopilot, AutomationIntent
        from app.services.browser_pool import get_browser_pool
        from app.services.llm_gateway_client import LLMGatewayClient
        from app.services.selector_cache import SelectorCache
        from app.services.playwright_script_generator import PlaywrightScriptGenerator
        from app.services.self_healing_executor import SelfHealingExecutor

        import redis.asyncio as aioredis

        redis_client = aioredis.from_url(REDIS_URL)
        gateway = LLMGatewayClient()
        try:
            pool = get_browser_pool()
            cache = SelectorCache(redis_client=redis_client)
            generator = PlaywrightScriptGenerator(
                browser_pool=pool,
                selector_cache=cache,
                gateway_client=gateway,
            )
            executor = SelfHealingExecutor(
                browser_pool=pool,
                selector_cache=cache,
                vision_model=vision_model,
                redis_client=redis_client,
                gateway_client=gateway,
            )
            copilot = AutomationCopilot(
                script_generator=generator,
                executor=executor,
                gateway_client=gateway,
            )

            intent = AutomationIntent.model_validate_json(intent_json)
            logger.info(
                "automation_execute_intent_parsed",
                task_id=task_id,
                intent_type=intent.intent_type,
                browser_tasks_count=len(intent.browser_tasks) if intent.browser_tasks else 0,
                allowed_domains_input=allowed_domains,
            )

            # Always extract domains from intent URLs and merge with configured domains
            effective_domains = set(allowed_domains)
            if intent.browser_tasks:
                for task in intent.browser_tasks:
                    task_url = task.get("url", "") if isinstance(task, dict) else ""
                    if task_url:
                        parsed_url = urlparse(task_url)
                        if parsed_url.hostname:
                            effective_domains.add(parsed_url.hostname)
                            # Also allow subdomains (e.g. *.google.com)
                            parts = parsed_url.hostname.split(".")
                            if len(parts) >= 2:
                                effective_domains.add(f"*.{'.'.join(parts[-2:])}")
            effective_domains = list(effective_domains)
            logger.info(
                "automation_effective_domains",
                task_id=task_id,
                input_domains=allowed_domains,
                effective_domains=effective_domains,
                browser_tasks_count=len(intent.browser_tasks) if intent.browser_tasks else 0,
            )

            async def status_callback(status: str, detail: str | None = None):
                data = {
                    "status": status,
                    "tenant_id": tenant_id,
                    "user_id": user_id,
                    "execution_id": execution_id,
                }
                if detail:
                    data["current_step"] = detail
                _set_status(task_id, data)
                logger.info("automation_status_update", task_id=task_id, status=status, detail=detail)

            # Build scripts
            task_count = len(intent.browser_tasks) if intent.browser_tasks else 0
            await status_callback("generating", f"Building scripts for {task_count} task(s)...")
            build_result = await copilot.build(
                intent=intent,
                execution_id=execution_id,
                tenant_id=tenant_id,
                user_id=user_id,
                vision_model=vision_model,
                allowed_domains=effective_domains,
            )

            # Execute scripts
            await status_callback("running", "Executing automation scripts...")
            exec_result = await copilot.execute_scripts(
                execution_id=execution_id,
                tenant_id=tenant_id,
                user_id=user_id,
                allowed_domains=effective_domains,
                status_callback=status_callback,
            )

            result_data = {
                "status": "success",
                "tenant_id": tenant_id,
                "user_id": user_id,
                "execution_id": execution_id,
                "actual_credits_used": exec_result.credits_used if exec_result else 0,
                "healed": exec_result.healed if exec_result else False,
                "heal_attempts": exec_result.heal_attempts if exec_result else 0,
                "extracted_data": exec_result.extracted_data if exec_result else None,
            }
            _set_status(task_id, result_data)
            return result_data
        finally:
            await gateway.aclose()
            await redis_client.close()

    try:
        return _run_async(_execute())
    except Exception as exc:
        logger.error("automation_execute_failed", task_id=task_id, error=str(exc)[:500])
        _set_status(task_id, {
            "status": "failed",
            "error": str(exc)[:500],
            "tenant_id": tenant_id,
            "execution_id": execution_id,
        })
        return {"status": "failed", "error": str(exc)[:500]}


@celery_app.task(queue="media")
def browser_pool_health_check() -> dict:
    """Beat task: release orphaned browser contexts older than 360s."""

    async def _check():
        from app.services.browser_pool import get_browser_pool

        try:
            pool = get_browser_pool()
            released = await pool.force_release_orphans(max_age_seconds=360)
            if released > 0:
                logger.warning("browser_pool_orphans_released", count=released)
            return {"released": released}
        except Exception as exc:
            logger.error("browser_pool_health_check_failed", error=str(exc)[:200])
            return {"error": str(exc)[:200]}

    return _run_async(_check())


@celery_app.task(queue="media")
def automation_credit_reconciliation() -> dict:
    """Beat task: refund unreturned credit reservations after 10 minutes."""
    r = _get_redis()
    reconciled = 0

    # Scan for completed executions that haven't been refunded
    # This is a safety net — the normal refund path is via tRPC getStatus
    cursor = 0
    while True:
        cursor, keys = r.scan(cursor, match="automation:*", count=100)
        for key in keys:
            if ":cancel" in key:
                continue
            try:
                raw = r.get(key)
                if raw is None:
                    continue
                data = json.loads(raw)
                if data.get("status") in ("success", "failed") and not data.get("refunded"):
                    if data.get("actual_credits_used") is not None:
                        data["refunded"] = True
                        r.set(key, json.dumps(data, default=str), ex=RESULT_TTL)
                        reconciled += 1
            except Exception:
                continue
        if cursor == 0:
            break

    if reconciled > 0:
        logger.info("automation_credits_reconciled", count=reconciled)
    return {"reconciled": reconciled}
