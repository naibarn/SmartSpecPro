"""Node-backed browser policy enforcement for live Playwright execution."""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Awaitable, Callable
from urllib.parse import urlparse

import httpx

from app.core.database import AsyncSessionLocal
from app.models.approval import ApprovalStatus, ApprovalType
from app.services.approval_db_service import ApprovalDBService
from app.services.automation_exceptions import BrowserPolicyDeniedError
from app.services.browser_policy_contract import (
    BrowserPolicyEvaluationResponse,
    BrowserPolicyExecutionContext,
)

NODEJS_INTERNAL_URL = os.environ.get("NODEJS_INTERNAL_URL", "http://localhost:3000").rstrip("/")
INTERNAL_TOKEN = (
    os.environ.get("SMARTSPEC_PROXY_TOKEN")
    or os.environ.get("SMARTSPEC_WEB_GATEWAY_TOKEN")
    or ""
)


@dataclass
class BrowserPolicyExecutionState:
    current_origin: str | None = None
    non_read_action_count: int = 0
    extracted_record_count: int = 0
    external_send_count: int = 0
    origin_transition_count: int = 0


class BrowserPolicyNodeClient:
    def __init__(
        self,
        *,
        tenant_id: str,
        user_id: int,
        execution_id: str,
        policy_context: BrowserPolicyExecutionContext,
        base_url: str = NODEJS_INTERNAL_URL,
        internal_token: str = INTERNAL_TOKEN,
        poll_interval_seconds: float = 2.0,
    ) -> None:
        self._tenant_id = tenant_id
        self._user_id = user_id
        self._execution_id = execution_id
        self._policy_context = policy_context
        self._base_url = base_url.rstrip("/")
        self._internal_token = internal_token
        self._poll_interval_seconds = poll_interval_seconds
        self._approved_correlation_keys: set[str] = set()
        self._approval_request_ids: dict[str, str] = {}

    async def enforce_before_action(
        self,
        *,
        page: Any,
        action: Any,
        state: BrowserPolicyExecutionState,
        status_callback: Callable[[str, str | None], Awaitable[None]],
    ) -> None:
        payload = await self._build_payload(
            page=page,
            action=action,
            state=state,
            transition_target_origin=None,
        )
        result = await self._evaluate(payload)
        await self._resolve_decision(
            result=result,
            action=action,
            status_callback=status_callback,
        )

    async def enforce_transition(
        self,
        *,
        action: Any,
        previous_origin: str | None,
        next_origin: str | None,
        state: BrowserPolicyExecutionState,
        status_callback: Callable[[str, str | None], Awaitable[None]],
    ) -> None:
        if not previous_origin or not next_origin:
            return

        payload = {
            "tenantId": self._tenant_id,
            "userId": self._user_id,
            "executionId": self._execution_id,
            "actionType": "navigate",
            "actionDescription": f"Re-evaluate browser transition after {action.action_type}",
            "currentOrigin": previous_origin,
            "targetOrigin": next_origin,
            "requiredCapabilities": ["navigate"],
            "originTransitionCount": state.origin_transition_count,
            "normalizedAction": {
                "action_type": action.action_type,
                "selector_css": getattr(action, "selector_css", None),
                "value": getattr(action, "value", None),
                "transition_origin": next_origin,
            },
            "payloadPreview": {
                "action_type": action.action_type,
                "target_origin": next_origin,
            },
            "evidence": {
                "actionDigest": self._stable_hash(
                    {
                        "action_type": action.action_type,
                        "transition_origin": next_origin,
                    }
                ),
                "domFingerprint": self._stable_hash(
                    {
                        "transition_origin": next_origin,
                        "selector_css": getattr(action, "selector_css", None),
                    }
                ),
            },
            "policyContext": self._policy_context.model_dump(mode="json"),
        }
        result = await self._evaluate(payload)
        await self._resolve_decision(
            result=result,
            action=action,
            status_callback=status_callback,
        )

    async def _build_payload(
        self,
        *,
        page: Any,
        action: Any,
        state: BrowserPolicyExecutionState,
        transition_target_origin: str | None,
    ) -> dict[str, Any]:
        current_url = self._get_page_url(page)
        current_origin = self._get_origin(current_url) or state.current_origin
        target_origin = transition_target_origin or self._infer_target_origin(
            action=action,
            fallback_origin=current_origin,
        )
        action_type = getattr(action, "action_type", "click")
        normalized_action = {
          "action_type": action_type,
          "selector_css": getattr(action, "selector_css", None),
          "value": getattr(action, "value", None),
          "description": getattr(action, "description", None),
        }
        payload_preview = {
          "action_type": action_type,
          "selector_css": getattr(action, "selector_css", None),
          "value": getattr(action, "value", None),
        }

        return {
            "tenantId": self._tenant_id,
            "userId": self._user_id,
            "executionId": self._execution_id,
            "actionType": action_type,
            "actionDescription": getattr(action, "description", action_type),
            "currentOrigin": current_origin,
            "targetOrigin": target_origin,
            "requiredCapabilities": self._required_capabilities(action_type),
            "writesData": action_type in {"fill", "select", "upload"},
            "touchesClipboard": "clipboard" in action_type,
            "transfersExternally": action_type in {"upload", "download"} or "clipboard" in action_type,
            "nonReadActionCount": state.non_read_action_count + (0 if action_type in {"goto", "extract_data"} else 1),
            "extractedRecordCount": state.extracted_record_count,
            "externalSendCount": state.external_send_count + (1 if action_type == "upload" else 0),
            "originTransitionCount": state.origin_transition_count,
            "normalizedAction": normalized_action,
            "payloadPreview": payload_preview,
            "evidence": {
                "actionDigest": self._stable_hash(normalized_action),
                "payloadPreviewHash": self._stable_hash(payload_preview),
                "domFingerprint": self._stable_hash(
                    {
                        "page_url": current_url,
                        "selector_css": getattr(action, "selector_css", None),
                        "target_origin": target_origin,
                    }
                ),
            },
            "policyContext": self._policy_context.model_dump(mode="json"),
        }

    async def _evaluate(self, payload: dict[str, Any]) -> BrowserPolicyEvaluationResponse:
        headers = {}
        if self._internal_token:
            headers["x-internal-token"] = self._internal_token

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{self._base_url}/api/internal/browser-policy/evaluate",
                headers=headers,
                json=payload,
            )
        response.raise_for_status()
        return BrowserPolicyEvaluationResponse.model_validate(response.json())

    async def _resolve_decision(
        self,
        *,
        result: BrowserPolicyEvaluationResponse,
        action: Any,
        status_callback: Callable[[str, str | None], Awaitable[None]],
    ) -> None:
        if result.decision.decision == "allow":
            return

        if result.decision.decision == "require_approval" and result.approvalPayload and result.correlationKey:
            await self._wait_for_approval(
                result=result,
                action=action,
                status_callback=status_callback,
            )
            return

        reason = ", ".join(result.decision.reasonCodes) or "browser policy denied the action"
        raise BrowserPolicyDeniedError(
            f"Browser policy blocked '{getattr(action, 'description', result.decision.actionType)}': {reason}",
            details={
                "decision": result.decision.decision,
                "reason_codes": result.decision.reasonCodes,
            },
        )

    async def _wait_for_approval(
        self,
        *,
        result: BrowserPolicyEvaluationResponse,
        action: Any,
        status_callback: Callable[[str, str | None], Awaitable[None]],
    ) -> None:
        assert result.approvalPayload is not None
        assert result.correlationKey is not None

        correlation_key = result.correlationKey
        if correlation_key in self._approved_correlation_keys:
            return

        request_id = self._approval_request_ids.get(correlation_key)
        if request_id is None:
            request_id = await self._create_approval_request(result=result, action=action)
            self._approval_request_ids[correlation_key] = request_id

        deadline = datetime.utcnow() + timedelta(
            seconds=result.approvalPayload.approvalTtlSeconds
        )

        while True:
            request_status = await self._get_approval_status(request_id)
            if request_status == ApprovalStatus.APPROVED:
                self._approved_correlation_keys.add(correlation_key)
                return
            if request_status in {
                ApprovalStatus.REJECTED,
                ApprovalStatus.EXPIRED,
                ApprovalStatus.CANCELLED,
            }:
                raise BrowserPolicyDeniedError(
                    f"Browser approval denied for '{getattr(action, 'description', result.decision.actionType)}'",
                    details={
                        "decision": "require_approval",
                        "reason_codes": result.decision.reasonCodes,
                        "approval_request_id": request_id,
                        "approval_status": request_status.value,
                    },
                )

            await status_callback(
                "running",
                f"Awaiting browser approval for {getattr(action, 'description', result.decision.actionType)}",
            )

            if datetime.utcnow() >= deadline:
                raise BrowserPolicyDeniedError(
                    f"Browser approval expired for '{getattr(action, 'description', result.decision.actionType)}'",
                    details={
                        "decision": "require_approval",
                        "reason_codes": result.decision.reasonCodes,
                        "approval_request_id": request_id,
                        "approval_status": ApprovalStatus.EXPIRED.value,
                    },
                )

            await asyncio.sleep(self._poll_interval_seconds)

    async def _create_approval_request(
        self,
        *,
        result: BrowserPolicyEvaluationResponse,
        action: Any,
    ) -> str:
        assert result.approvalPayload is not None

        async with AsyncSessionLocal() as session:
            service = ApprovalDBService(session)
            request = await service.create_request(
                request_type=ApprovalType.CODE_EXECUTION,
                title=f"Browser action approval: {getattr(action, 'description', result.decision.actionType)}",
                description=(
                    "Approve browser automation action before live execution. "
                    f"Reasons: {', '.join(result.decision.reasonCodes)}"
                ),
                tenant_id=self._tenant_id,
                requester_id=self._user_id,
                execution_id=self._execution_id,
                payload=result.approvalPayload.model_dump(mode="json"),
                extra_data={
                    "browser_policy": True,
                    "target_origin": result.approvalPayload.targetOrigin,
                    "reason_codes": result.decision.reasonCodes,
                },
                action_digest=result.approvalPayload.actionDigest,
                dom_fingerprint=result.approvalPayload.domFingerprint,
                screenshot_hash=result.approvalPayload.screenshotHash,
                correlation_key=result.correlationKey,
                risk_level="high" if result.decision.actionClass in {"commit", "restricted"} else "medium",
                risk_factors=result.decision.reasonCodes,
                expires_at=datetime.utcnow()
                + timedelta(seconds=result.approvalPayload.approvalTtlSeconds),
            )
            return request.id

    async def _get_approval_status(self, request_id: str) -> ApprovalStatus:
        async with AsyncSessionLocal() as session:
            service = ApprovalDBService(session)
            request = await service.get_request(request_id, tenant_id=self._tenant_id)
            if request is None:
                raise BrowserPolicyDeniedError(
                    "Browser approval request disappeared before execution resumed",
                    details={"approval_request_id": request_id},
                )
            return request.status

    @staticmethod
    def _required_capabilities(action_type: str) -> list[str]:
        mapping = {
            "goto": ["navigate"],
            "click": ["click"],
            "fill": ["fill"],
            "select": ["select"],
            "hover": ["hover"],
            "extract_data": ["extract_data"],
            "upload": ["upload_file"],
            "download": ["download_file"],
            "file_picker": ["upload_file"],
            "permission_prompt": ["handle_prompt"],
            "certificate_warning": ["handle_prompt"],
        }
        return mapping.get(action_type, ["click"])

    @staticmethod
    def _get_page_url(page: Any) -> str | None:
        value = getattr(page, "url", None)
        if isinstance(value, str):
            return value
        return None

    @staticmethod
    def _get_origin(url: str | None) -> str | None:
        if not url:
            return None
        try:
            parsed = urlparse(url)
            if not parsed.scheme or not parsed.netloc:
                return None
            return f"{parsed.scheme}://{parsed.netloc}"
        except ValueError:
            return None

    def _infer_target_origin(self, *, action: Any, fallback_origin: str | None) -> str | None:
        action_type = getattr(action, "action_type", "click")
        if action_type == "goto":
            return self._get_origin(getattr(action, "value", None) or getattr(action, "selector_css", None))
        return fallback_origin

    @staticmethod
    def _stable_hash(value: dict[str, Any]) -> str:
        return hashlib.sha256(json.dumps(value, sort_keys=True, default=str).encode("utf-8")).hexdigest()
