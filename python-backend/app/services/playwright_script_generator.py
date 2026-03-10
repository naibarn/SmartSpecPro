"""Vision LLM-powered Playwright script generator."""

from __future__ import annotations

import base64
import json
import logging
import os
from typing import TYPE_CHECKING, Any

from pydantic import BaseModel

from app.services.automation_exceptions import ScriptGenerationError
from app.services.url_validator import validate_url_with_dns

if TYPE_CHECKING:
    from playwright.async_api import BrowserContext, Page

    from app.services.browser_pool import BrowserPool
    from app.services.llm_gateway_client import LLMGatewayClient
    from app.services.selector_cache import SelectorCache

logger = logging.getLogger(__name__)

_VISION_SYSTEM_PROMPT = """\
You are a web page element identifier for browser automation.

Given a screenshot of a web page with numbered overlays and a goal, identify the elements \
that need to be interacted with to accomplish the goal.

Return a JSON array of objects with these fields:
- element_index: int, the overlay number on the screenshot
- action_type: one of "click", "fill", "select", "extract_data", "hover", "scroll"
- value: string or null, the value to fill/select (null for click/hover)
- confidence: float 0.0-1.0
- reasoning: brief explanation of why this element and action

Return ONLY valid JSON array, no markdown fences or extra text."""

# Numbered overlay injection script (system-authored, NEVER parameterized with user input)
_OVERLAY_INJECTION_JS = """
(() => {
  const interactiveSelectors = 'a, button, input, select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [tabindex]';
  const elements = document.querySelectorAll(interactiveSelectors);
  const results = [];
  let idx = 1;
  elements.forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const label = document.createElement('div');
    label.textContent = `[${idx}]`;
    label.style.cssText = `position:absolute;top:${rect.top + window.scrollY - 14}px;left:${rect.left + window.scrollX - 2}px;background:#ff0;color:#000;font-size:10px;font-weight:bold;z-index:99999;padding:0 2px;pointer-events:none;`;
    document.body.appendChild(label);
    results.push({
      index: idx,
      tag: el.tagName.toLowerCase(),
      text: (el.textContent || '').trim().slice(0, 100),
      role: el.getAttribute('role') || el.tagName.toLowerCase(),
      ariaLabel: el.getAttribute('aria-label'),
      testId: el.getAttribute('data-testid'),
      rect: {x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height)},
    });
    idx++;
  });
  return results;
})()
"""

CONFIDENCE_THRESHOLD = 0.7
MIN_OVERALL_CONFIDENCE = 0.5


class IdentifiedElement(BaseModel):
    """Element identified by the Vision LLM."""
    element_index: int
    action_type: str  # click, fill, select, extract_data, hover, scroll
    value: str | None = None
    confidence: float
    reasoning: str


class PlaywrightAction(BaseModel):
    """A single Playwright action with multi-strategy selectors."""
    action_type: str
    selector_css: str
    selector_strategies: list[str]
    description: str
    confidence: float
    value: str | None = None
    target_origin: str | None = None


class PlaywrightScript(BaseModel):
    """Complete script of Playwright actions for a URL + goal."""
    url: str
    goal: str
    actions: list[PlaywrightAction]


class PlaywrightScriptGenerator:
    """Generates Playwright scripts via Vision LLM screenshot analysis."""

    def __init__(
        self,
        browser_pool: BrowserPool,
        selector_cache: SelectorCache,
        gateway_client: LLMGatewayClient | None = None,
    ) -> None:
        self._browser_pool = browser_pool
        self._cache = selector_cache
        self._gateway = gateway_client

    async def generate(
        self,
        url: str,
        goal: str,
        tenant_id: str,
        allowed_domains: list[str],
        vision_model: str,
    ) -> PlaywrightScript:
        """Generate a PlaywrightScript for the given URL and goal."""
        logger.info("generate: start url=%s goal=%s", url[:80], goal[:60])

        # 1. SSRF check before anything
        await validate_url_with_dns(url, allowed_domains)
        logger.info("generate: SSRF check passed")

        # 2. Check cache
        cached = await self._cache.get(tenant_id, url, goal)
        if cached is not None:
            logger.info("generate: cache hit, returning cached script")
            actions = [
                PlaywrightAction(**a) if isinstance(a, dict) else a
                for a in cached.actions
            ]
            return PlaywrightScript(url=url, goal=goal, actions=actions)

        # 3. Open browser and generate
        logger.info("generate: acquiring browser session")
        async with self._browser_pool.session(tenant_id) as context:
            page = await context.new_page()
            logger.info("generate: page created, installing SSRF handler")

            # Install SSRF defense-in-depth route handler
            await self._install_ssrf_route_handler(page, allowed_domains)

            try:
                logger.info("generate: navigating to %s", url[:80])
                await page.goto(url, wait_until="domcontentloaded", timeout=30000)
                # Wait a short time for dynamic content to render
                await page.wait_for_timeout(2000)
                logger.info("generate: navigation done")

                # 4. Inject overlays and capture screenshot
                element_refs = await page.evaluate(_OVERLAY_INJECTION_JS)
                screenshot_bytes = await page.screenshot(type="png")
                screenshot_b64 = base64.b64encode(screenshot_bytes).decode()
                logger.info(
                    "generate: screenshot taken, %d elements found, %d bytes",
                    len(element_refs), len(screenshot_bytes),
                )

                # 5. Call Vision LLM
                logger.info("generate: calling Vision LLM model=%s", vision_model)
                identified = await self._vision_llm_call(
                    screenshot_b64=screenshot_b64,
                    goal=goal,
                    vision_model=vision_model,
                    element_refs=element_refs,
                    tenant_id=tenant_id,
                )
                logger.info("generate: Vision LLM returned %d elements", len(identified))

                # 6. Filter low confidence elements
                high_confidence = [
                    e for e in identified if e.confidence >= CONFIDENCE_THRESHOLD
                ]
                if not high_confidence:
                    raise ScriptGenerationError(
                        "No elements identified with sufficient confidence",
                        details={"threshold": CONFIDENCE_THRESHOLD},
                    )

                # Check overall confidence
                avg_confidence = sum(e.confidence for e in high_confidence) / len(high_confidence)
                if avg_confidence < MIN_OVERALL_CONFIDENCE:
                    raise ScriptGenerationError(
                        f"Overall confidence too low: {avg_confidence:.2f}",
                        details={"avg_confidence": avg_confidence},
                    )

                # 7. Build actions with selector strategies
                actions = []
                for elem in high_confidence:
                    ref = next(
                        (r for r in element_refs if r["index"] == elem.element_index),
                        None,
                    )
                    if ref is None:
                        continue
                    strategies = self._build_selector_strategy(ref)
                    css_selector = strategies[0] if strategies else f"#{ref.get('testId', 'unknown')}"
                    actions.append(
                        PlaywrightAction(
                            action_type=elem.action_type,
                            selector_css=css_selector,
                            selector_strategies=strategies,
                            description=elem.reasoning,
                            confidence=elem.confidence,
                            value=elem.value,
                        )
                    )

                if not actions:
                    raise ScriptGenerationError("No valid actions generated")

                # 8. Validate selectors exist in live DOM
                valid = await self._validate_selectors(page, actions)
                if not valid:
                    logger.warning("Some selectors failed validation, proceeding with available ones")

                # 9. Store in cache
                await self._cache.put(
                    tenant_id, url, goal,
                    [a.model_dump() for a in actions],
                )

                return PlaywrightScript(url=url, goal=goal, actions=actions)

            finally:
                await page.close()

    async def _install_ssrf_route_handler(
        self, page: Any, allowed_domains: list[str]
    ) -> None:
        """Install page.route handler for SSRF defense-in-depth (TOCTOU mitigation).

        Only blocks document navigations to disallowed domains.
        Sub-resources (CSS, JS, images, fonts) are allowed through so pages render correctly.
        """
        async def route_handler(route):
            from urllib.parse import urlparse

            # Allow sub-resources (only block document navigations)
            resource_type = route.request.resource_type
            if resource_type not in ("document", "iframe"):
                await route.continue_()
                return

            request_url = route.request.url
            parsed = urlparse(request_url)
            hostname = parsed.hostname or ""

            # Allow data: and blob: URLs
            if parsed.scheme in ("data", "blob"):
                await route.continue_()
                return

            # Check against allowed domains
            hostname_lower = hostname.lower()
            allowed = False
            for domain in allowed_domains:
                domain_lower = domain.lower()
                if domain_lower.startswith("*."):
                    if hostname_lower.endswith(domain_lower[1:]):
                        allowed = True
                        break
                elif hostname_lower == domain_lower:
                    allowed = True
                    break

            if allowed:
                await route.continue_()
            else:
                logger.warning(
                    "SSRF blocked navigation to %s (not in allowed domains)",
                    hostname_lower,
                )
                await route.abort("blockedbyclient")

        await page.route("**/*", route_handler)

    async def _vision_llm_call(
        self,
        screenshot_b64: str,
        goal: str,
        vision_model: str,
        element_refs: list[dict],
        tenant_id: str | None = None,
        user_id: int | None = None,
    ) -> list[IdentifiedElement]:
        """Send screenshot + goal to Vision LLM, parse response.

        Override this method in tests. In production, this calls
        the LLM gateway with a vision-capable model.
        """
        if self._gateway is None:
            raise NotImplementedError("No gateway client configured")

        if os.environ.get("AUTOMATION_LLM_ENABLED") == "false":
            raise NotImplementedError("LLM calls disabled via AUTOMATION_LLM_ENABLED=false")

        user_text = f"Goal: {goal}\n\nElement references: {json.dumps(element_refs)}"
        messages = [
            {"role": "system", "content": _VISION_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": user_text},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/png;base64,{screenshot_b64}"},
                    },
                ],
            },
        ]
        result = await self._gateway.chat_completion(
            messages=messages,
            model=vision_model,
            user_id=user_id,
            tenant_id=tenant_id,
            timeout=120,
        )

        content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
        try:
            parsed = json.loads(content)
        except json.JSONDecodeError as exc:
            raise ScriptGenerationError(
                f"Vision LLM returned invalid JSON: {exc}",
                details={"content_preview": content[:200]},
            ) from exc

        if not isinstance(parsed, list):
            parsed = [parsed]

        return [IdentifiedElement(**item) for item in parsed]

    def _build_selector_strategy(self, element_info: dict) -> list[str]:
        """Convert element info to multi-strategy selector list.

        Priority: ARIA role > label > text > data-testid > CSS tag
        """
        strategies: list[str] = []

        role = element_info.get("role")
        aria_label = element_info.get("ariaLabel")
        text = element_info.get("text", "")
        test_id = element_info.get("testId")
        tag = element_info.get("tag", "div")

        # 1. ARIA role + label (highest priority)
        if role and aria_label:
            strategies.append(f'role={role}[name="{aria_label}"]')
        elif role and text:
            strategies.append(f'role={role}[name="{text[:50]}"]')

        # 2. aria-label selector
        if aria_label:
            strategies.append(f'[aria-label="{aria_label}"]')

        # 3. Text-based selector
        if text and len(text) < 60:
            strategies.append(f'text="{text}"')

        # 4. data-testid
        if test_id:
            strategies.append(f'[data-testid="{test_id}"]')

        # 5. CSS tag fallback
        strategies.append(tag)

        return strategies

    async def _validate_selectors(
        self, page: Any, actions: list[PlaywrightAction]
    ) -> bool:
        """Verify each selector resolves to >= 1 element in live DOM."""
        for action in actions:
            try:
                locator = page.locator(action.selector_css)
                count = await locator.count()
                if count == 0:
                    return False
            except Exception:
                return False
        return True
