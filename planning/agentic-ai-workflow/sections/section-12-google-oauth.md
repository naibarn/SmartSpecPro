# Section 12: Google Calendar OAuth Integration

**Phase**: 4 - AI Secretary
**Estimated Time**: 3-4 days
**Priority**: High
**Dependencies**: None

---

## Overview

Implement Google OAuth flow for Calendar API access with encrypted token storage.

---

## Goals

- ✅ Google OAuth consent screen configured
- ✅ OAuth flow (Node.js initiates, stores tokens)
- ✅ Token encryption with crypto.ts (AES-256-GCM)
- ✅ Python reads tokens via smartspecweb_crypto.py
- ✅ Token refresh before expiry

---

## Implementation

**OAuth Flow**:
```typescript
// server/routes/oauthRoutes.ts
router.get("/auth/google/calendar", (req, res) => {
  const authUrl = googleOAuthClient.generateAuthUrl({
    scope: ["https://www.googleapis.com/auth/calendar"],
    access_type: "offline"
  });
  res.redirect(authUrl);
});

router.get("/auth/google/callback", async (req, res) => {
  const { code } = req.query;
  const { tokens } = await googleOAuthClient.getToken(code);

  // Encrypt tokens
  const encrypted = encrypt(JSON.stringify(tokens));

  // Store in database
  await db.insert(userSettings).values({
    userId: req.user.id,
    googleAccessTokenEncrypted: encrypted.access_token,
    googleRefreshTokenEncrypted: encrypted.refresh_token,
    googleTokenExpiresAt: new Date(tokens.expiry_date)
  });

  res.redirect("/settings?success=calendar_connected");
});
```

**Token Refresh**:
```python
# Python backend
async def get_google_tokens(user_id: int) -> dict:
    settings = await get_user_settings(user_id)

    # Check if expired
    if settings.google_token_expires_at < datetime.now():
        # Refresh token
        tokens = await refresh_google_token(settings.google_refresh_token_encrypted)

        # Update in database
        await update_tokens(user_id, tokens)

    return decrypt_tokens(settings.google_access_token_encrypted)
```

---

## Completion Checklist

- [ ] OAuth flow works
- [ ] Token encryption works
- [ ] Token refresh works
- [ ] Tests pass

**Estimated Completion**: 3-4 days
