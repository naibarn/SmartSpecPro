"""
Telegram Bot Webhook Endpoint

Handles /start {code} verification and Telegram account linking.
"""

import logging
import re
import secrets
import httpx
import json
from typing import Optional
from fastapi import APIRouter, Request, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import text
from redis.asyncio import Redis

from app.core.database import get_db
from app.core.redis_client import get_redis
from app.core.smartspecweb_crypto import decrypt_smartspecweb as decrypt

logger = logging.getLogger(__name__)

router = APIRouter()

# ============================================================================
# Pydantic Models
# ============================================================================


class TelegramUser(BaseModel):
    id: int
    username: Optional[str] = None
    first_name: str


class TelegramChat(BaseModel):
    id: int
    type: str  # "private", "group", "supergroup", "channel"


class TelegramMessage(BaseModel):
    message_id: int
    from_: TelegramUser = Field(alias="from")
    chat: TelegramChat
    text: Optional[str] = None
    date: int


class TelegramUpdate(BaseModel):
    update_id: int
    message: Optional[TelegramMessage] = None


# ============================================================================
# Helper Functions
# ============================================================================


async def validate_webhook_secret(request: Request, db: Session) -> None:
    """
    Validates X-Telegram-Bot-Api-Secret-Token header against stored webhook_secret.
    Raises HTTPException(401) if invalid/missing.
    """
    header_secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token")
    if not header_secret:
        raise HTTPException(status_code=401, detail="Missing webhook secret")

    # Fetch webhook_secret from system_settings
    result = db.execute(
        text(
            """
            SELECT value FROM system_settings
            WHERE category = 'telegram' AND key = 'webhook_secret'
            LIMIT 1
        """
        )
    )
    row = result.fetchone()
    if not row or not row[0]:
        raise HTTPException(status_code=401, detail="Webhook secret not configured")

    # Decrypt the stored secret
    stored_secret = decrypt(row[0])

    # Constant-time comparison
    if not secrets.compare_digest(header_secret, stored_secret):
        raise HTTPException(status_code=401, detail="Invalid webhook secret")


async def check_rate_limit(redis: Redis, chat_id: int) -> None:
    """
    Checks if chat_id has exceeded 5 attempts in the last hour.
    Raises HTTPException(429) if limit exceeded.
    """
    key = f"telegram:attempts:{chat_id}"
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, 3600)  # 1 hour TTL
    if count > 5:
        raise HTTPException(status_code=429, detail="Too many verification attempts")


async def verify_code(redis: Redis, code: str) -> Optional[dict]:
    """
    Looks up verification code in Redis.
    Returns user_id and attempt count if found, None if expired/invalid.
    Increments per-code attempt counter (max 3 attempts before deletion).
    """
    # Validate code format
    if not re.match(r"^[a-f0-9]{32}$", code):
        return None

    key = f"telegram:verify:{code}"
    data_str = await redis.get(key)
    if not data_str:
        return None

    # Parse stored data
    try:
        data = json.loads(data_str)
    except json.JSONDecodeError:
        return None

    # Increment attempts
    attempts = data.get("attempts", 0) + 1
    if attempts >= 3:
        # Max attempts reached, delete code
        await redis.delete(key)
        return None

    # Update attempts counter
    data["attempts"] = attempts
    await redis.set(key, json.dumps(data), ex=300)  # Maintain 5-minute TTL

    return data


async def link_telegram_account(
    db: Session, user_id: int, chat_id: int, username: Optional[str]
) -> None:
    """
    Updates users table with Telegram credentials in a single UPDATE statement.
    Sets: telegramChatId, telegramUsername, telegramVerified=true, telegramVerifiedAt=now()
    """
    db.execute(
        text(
            """
            UPDATE users
            SET "telegramChatId" = :chat_id,
                "telegramUsername" = :username,
                "telegramVerified" = true,
                "telegramVerifiedAt" = NOW()
            WHERE id = :user_id
        """
        ),
        {"chat_id": str(chat_id), "username": username, "user_id": user_id},
    )
    db.commit()


async def get_bot_token(db: Session) -> str:
    """
    Fetches and decrypts bot_token from system_settings.
    """
    result = db.execute(
        text(
            """
            SELECT value FROM system_settings
            WHERE category = 'telegram' AND key = 'bot_token'
            LIMIT 1
        """
        )
    )
    row = result.fetchone()
    if not row or not row[0]:
        raise ValueError("Bot token not configured")

    return decrypt(row[0])


async def send_telegram_message(
    bot_token: str, chat_id: int, text: str, parse_mode: str = "HTML"
) -> dict:
    """
    Sends a message via Telegram Bot API using httpx.AsyncClient.
    Returns API response JSON.
    """
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {"chat_id": chat_id, "text": text, "parse_mode": parse_mode}

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(url, json=payload)
        response.raise_for_status()
        return response.json()


# ============================================================================
# Main Webhook Endpoint
# ============================================================================


@router.post("/telegram")
async def telegram_webhook(
    update: TelegramUpdate,
    request: Request,
    db: Session = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    """
    Telegram Bot webhook endpoint.
    Handles /start {code} verification and account linking.
    """
    # 1. Validate webhook secret header
    await validate_webhook_secret(request, db)

    # 2. Extract message (return 200 OK if no message)
    if not update.message:
        return {"ok": True}

    message = update.message

    # 3. Validate private chat only
    if message.chat.type != "private":
        return {"ok": True}  # Ignore group/channel messages silently

    # 4. Extract chat_id and text
    chat_id = message.chat.id
    text = message.text or ""

    # 5. Handle /start {code}
    if not text.startswith("/start "):
        return {"ok": True}  # Ignore other messages

    code = text[7:].strip()  # Extract code after "/start "

    # 6. Check brute-force limits
    try:
        await check_rate_limit(redis, chat_id)
    except HTTPException:
        # Rate limited - still return 200 OK to Telegram (silent failure)
        return {"ok": True}

    # 7. Verify code
    verification_data = await verify_code(redis, code)
    if not verification_data:
        # Invalid/expired code - return success to Telegram (silent failure)
        return {"ok": True}

    user_id = verification_data["userId"]
    username = message.from_.username

    # 8. Update database (single statement)
    try:
        await link_telegram_account(db, user_id, chat_id, username)
    except Exception as e:
        # Log error but return 200 OK to Telegram
        logger.error("telegram_webhook_database_error", extra={"error_type": type(e).__name__})
        return {"ok": True}

    # 9. Send confirmation message
    try:
        bot_token = await get_bot_token(db)
        await send_telegram_message(
            bot_token=bot_token,
            chat_id=chat_id,
            text="✅ Your Telegram account has been linked to SmartSpecPro!",
        )
    except Exception as e:
        # Log error but don't fail (user is already linked)
        print(f"[Telegram Webhook] Failed to send confirmation: {e}")

    # 10. Delete verification code from Redis
    await redis.delete(f"telegram:verify:{code}")

    return {"ok": True}
