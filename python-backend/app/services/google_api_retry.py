"""
Google API retry utilities with exponential backoff and jitter.

Provides a decorator for retrying Google API calls on 429/503 responses,
and custom error classes for Google-specific error handling.
"""

import asyncio
import functools
import random
import time
from typing import Callable, Any

import structlog

from app.core.error_handling import ExternalAPIError, NonRetryableError

logger = structlog.get_logger()


class GoogleAPIError(ExternalAPIError):
    """Google API call failed with a specific HTTP status code."""

    def __init__(self, message: str, status_code: int, reason: str | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.reason = reason


# Re-export InvalidGrantError from its canonical location.
# All callers already import from google_token_service, so we
# re-export here for use within the retry decorator's exception handling.
from app.services.google_token_service import InvalidGrantError  # noqa: F401


# HTTP status codes that should be retried
RETRYABLE_STATUS_CODES = {429, 503}

# HTTP status codes that should NOT be retried
NON_RETRYABLE_STATUS_CODES = {400, 401, 403, 404}


def google_api_retry(
    max_retries: int = 5,
    initial_delay: float = 1.0,
    max_delay: float = 32.0,
    exponential_base: float = 2.0,
):
    """
    Decorator for retrying Google API calls with exponential backoff and jitter.

    Retries on 429 and 503 responses. Adds random jitter (up to 50% of delay)
    to prevent thundering herd. Non-retryable errors (400, 404) raise immediately.

    Args:
        max_retries: Maximum number of retry attempts (default 5).
        initial_delay: Initial delay in seconds (default 1.0).
        max_delay: Maximum delay cap in seconds (default 32.0).
        exponential_base: Base for exponential backoff (default 2.0).
    """

    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
            delay = initial_delay

            for attempt in range(max_retries + 1):
                try:
                    return await func(*args, **kwargs)

                except InvalidGrantError:
                    raise  # Never retry

                except NonRetryableError:
                    raise  # Never retry

                except GoogleAPIError as e:
                    if e.status_code not in RETRYABLE_STATUS_CODES:
                        raise

                    if attempt == max_retries:
                        logger.error(
                            "google_api_retry_exhausted",
                            function=func.__name__,
                            attempts=attempt + 1,
                            status_code=e.status_code,
                            error=str(e),
                        )
                        raise

                    jitter = random.uniform(0, delay * 0.5)
                    wait = min(delay + jitter, max_delay)

                    logger.warning(
                        "google_api_retry_attempt",
                        function=func.__name__,
                        attempt=attempt + 1,
                        max_retries=max_retries,
                        delay=round(wait, 2),
                        status_code=e.status_code,
                    )

                    await asyncio.sleep(wait)
                    delay = min(delay * exponential_base, max_delay)

                except Exception as e:
                    # Check if it's a Google API HTTP error with retryable status
                    status = _extract_http_status(e)
                    if status and status in RETRYABLE_STATUS_CODES:
                        if attempt == max_retries:
                            logger.error(
                                "google_api_retry_exhausted",
                                function=func.__name__,
                                attempts=attempt + 1,
                                status_code=status,
                                error=str(e),
                            )
                            raise

                        jitter = random.uniform(0, delay * 0.5)
                        wait = min(delay + jitter, max_delay)

                        logger.warning(
                            "google_api_retry_attempt",
                            function=func.__name__,
                            attempt=attempt + 1,
                            max_retries=max_retries,
                            delay=round(wait, 2),
                            status_code=status,
                        )

                        await asyncio.sleep(wait)
                        delay = min(delay * exponential_base, max_delay)
                    else:
                        raise

        @functools.wraps(func)
        def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
            delay = initial_delay

            for attempt in range(max_retries + 1):
                try:
                    return func(*args, **kwargs)

                except InvalidGrantError:
                    raise

                except NonRetryableError:
                    raise

                except GoogleAPIError as e:
                    if e.status_code not in RETRYABLE_STATUS_CODES:
                        raise

                    if attempt == max_retries:
                        logger.error(
                            "google_api_retry_exhausted",
                            function=func.__name__,
                            attempts=attempt + 1,
                            status_code=e.status_code,
                            error=str(e),
                        )
                        raise

                    jitter = random.uniform(0, delay * 0.5)
                    wait = min(delay + jitter, max_delay)

                    logger.warning(
                        "google_api_retry_attempt",
                        function=func.__name__,
                        attempt=attempt + 1,
                        max_retries=max_retries,
                        delay=round(wait, 2),
                        status_code=e.status_code,
                    )

                    time.sleep(wait)
                    delay = min(delay * exponential_base, max_delay)

                except Exception as e:
                    status = _extract_http_status(e)
                    if status and status in RETRYABLE_STATUS_CODES:
                        if attempt == max_retries:
                            raise

                        jitter = random.uniform(0, delay * 0.5)
                        wait = min(delay + jitter, max_delay)

                        logger.warning(
                            "google_api_retry_attempt",
                            function=func.__name__,
                            attempt=attempt + 1,
                            max_retries=max_retries,
                            delay=round(wait, 2),
                            status_code=status,
                        )

                        time.sleep(wait)
                        delay = min(delay * exponential_base, max_delay)
                    else:
                        raise

        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper

    return decorator


def _extract_http_status(exc: Exception) -> int | None:
    """Extract HTTP status code from various Google API exception types."""
    # googleapiclient.errors.HttpError
    if hasattr(exc, "status_code"):
        return int(exc.status_code)
    if hasattr(exc, "resp") and hasattr(exc.resp, "status"):
        return int(exc.resp.status)
    if hasattr(exc, "resp") and isinstance(exc.resp, dict):
        s = exc.resp.get("status")
        if s:
            return int(s)
    return None
