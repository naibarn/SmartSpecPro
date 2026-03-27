"""Playwright-backed visual regression for the internal slide render route."""

from __future__ import annotations

import hashlib
import os
import select
import subprocess
import time
from pathlib import Path

import pytest
from playwright.async_api import async_playwright


REPO_ROOT = Path(__file__).resolve().parents[2]
APP_ROOT = REPO_ROOT / "apps" / "web"
ROUTE_SERVER = APP_ROOT / "server" / "routes" / "slideRender.playwright-server.ts"
DECK_ID = 7
SLIDE_INDEX = 2
EXPECTED_SCREENSHOT_SHA256 = "c6daeef6dd3c3aa06e4463bd61d146ab1a77e5e03d22d56c569a227abb7be436"


def _start_slide_render_server() -> tuple[subprocess.Popen[str], str, int]:
    env = os.environ.copy()
    env["JWT_SECRET"] = env.get("JWT_SECRET", "test-jwt-secret-32-chars-minimum-1234567890")

    proc = subprocess.Popen(
        [
            "bash",
            "-lc",
            f"source ~/.nvm/nvm.sh && cd {APP_ROOT} && node --import tsx {ROUTE_SERVER}",
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=env,
    )

    token: str | None = None
    port: int | None = None
    deadline = time.monotonic() + 30

    try:
        while time.monotonic() < deadline:
            if proc.poll() is not None:
                stdout, stderr = proc.communicate(timeout=5)
                raise RuntimeError(
                    "slide render server exited early\n"
                    f"stdout:\n{stdout}\n"
                    f"stderr:\n{stderr}"
                )

            ready, _, _ = select.select([proc.stdout], [], [], 0.5)
            if not ready:
                continue

            line = proc.stdout.readline().strip()
            if line.startswith("SLIDE_RENDER_PORT="):
                port = int(line.split("=", 1)[1])
            elif line.startswith("SLIDE_RENDER_TOKEN="):
                token = line.split("=", 1)[1]

            if token is not None and port is not None:
                return proc, token, port

        raise TimeoutError("timed out waiting for slide render test server to start")
    except Exception:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
        raise


@pytest.mark.integration
@pytest.mark.asyncio
async def test_representative_slide_render_is_stable() -> None:
    proc, token, port = _start_slide_render_server()
    url = f"http://127.0.0.1:{port}/internal/slide-render/{DECK_ID}/{SLIDE_INDEX}"

    try:
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=True)
            context = await browser.new_context(
                viewport={"width": 960, "height": 1200},
                device_scale_factor=1,
                extra_http_headers={"X-Internal-Token": token},
            )
            page = await context.new_page()
            await page.goto(url, wait_until="domcontentloaded")
            await page.wait_for_function("window.__slideReady === true", timeout=15000)
            screenshot = await page.screenshot(full_page=True)
            await context.close()
            await browser.close()
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()

    digest = hashlib.sha256(screenshot).hexdigest()
    assert digest == EXPECTED_SCREENSHOT_SHA256
