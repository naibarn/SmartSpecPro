# 🔐 Admin Setup Guide - SmartSpec Pro

## Overview

This guide shows you how to set up authentication and access the Admin Provider Configuration feature.

## 🚀 Quick Start

### 1. Setup Encryption Key

Add to your `python-backend/.env` file:

```bash
# Required for encrypting API keys
ENCRYPTION_MASTER_KEY=smartspec-secure-key-2026-change-me
```

⚠️ **IMPORTANT**: Use a strong, random 32+ character key in production!

### 2. Run Database Migrations

```bash
cd python-backend

# Run provider_configs table migration
psql -U smartspec -d smartspec -f migrations/create_provider_configs_table.sql
```

Or if you're using SQLite (for development):

```bash
# The table will be auto-created on first run
python -m uvicorn app.main:app --reload --port 8000
```

### 3. Create Admin User

Run the admin user creation script:

```bash
cd python-backend
python scripts/create_admin_user.py
```

This will create a default admin account:
- **Email:** `admin@smartspec.local`
- **Password:** `Admin123!@#`
- **Credits:** 100,000
- **Admin Status:** Yes

You can also create a custom admin:

```bash
python scripts/create_admin_user.py \
  --email your-admin@example.com \
  --password YourSecurePassword123! \
  --name "Your Name"
```

### 4. Start Backend Server

```bash
cd python-backend
python -m uvicorn app.main:app --reload --port 8000
```

### 5. Start Desktop App

```bash
cd desktop-app
pnpm install  # if not already done
pnpm tauri dev
```

### 6. Login

1. Open the desktop app
2. You'll be redirected to `/login`
3. Login with:
   - **Email:** `admin@smartspec.local`
   - **Password:** `Admin123!@#`
4. You'll be redirected to `/admin/settings`

## 📋 Features

### User Authentication

- ✅ **Login** - JWT-based authentication
- ✅ **Protected Routes** - Non-logged-in users redirected to login
- ✅ **Admin-Only Routes** - Regular users cannot access admin features
- ✅ **Session Management** - Token stored in localStorage
- ✅ **Logout** - Click logout button in sidebar

### Admin Provider Configuration

Admin users can:
- ✅ View all configured LLM providers
- ✅ Add new providers (OpenAI, Anthropic, Google, Groq, Ollama, OpenRouter, Z.AI)
- ✅ Edit API keys and settings
- ✅ Enable/disable providers
- ✅ Delete providers
- ✅ API keys are **encrypted** at rest

## 🔒 Security Features

1. **Encrypted API Keys**
   - Uses Fernet (symmetric encryption)
   - Keys encrypted before storing in database
   - Never returned in API responses (only `has_api_key: boolean`)

2. **Admin-Only Endpoints**
   - All provider config endpoints require `is_admin=True`
   - Regular users get 403 Forbidden

3. **JWT Authentication**
   - Access tokens expire in 30 minutes (configurable)
   - Tokens stored in localStorage
   - Authorization header: `Bearer <token>`

4. **Password Requirements**
   - Minimum 8 characters
   - Must contain: uppercase, lowercase, digit, special character
   - Common passwords rejected

## 📝 Usage Examples

### Login via UI

1. Go to `http://localhost:1420/login`
2. Enter credentials
3. Click "Sign In"

### Login via API

```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@smartspec.local",
    "password": "Admin123!@#"
  }'
```

Response:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 1800,
  "user": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "email": "admin@smartspec.local",
    "full_name": "System Administrator",
    "credits_balance": 100000,
    "is_admin": true,
    "email_verified": true
  }
}
```

### Add Provider via API

```bash
TOKEN="your-jwt-token-here"

curl -X POST http://localhost:8000/api/v1/admin/provider-configs/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "provider_name": "openai",
    "display_name": "OpenAI",
    "api_key": "sk-proj-...",
    "base_url": "https://api.openai.com/v1",
    "is_enabled": true,
    "description": "GPT-4 and GPT-3.5 models"
  }'
```

### Update Provider

```bash
curl -X PUT http://localhost:8000/api/v1/admin/provider-configs/openai \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "api_key": "sk-proj-new-key...",
    "is_enabled": true
  }'
```

## 🛠️ Advanced Configuration

### Change Encryption Key

If you need to rotate the encryption key:

1. **IMPORTANT**: You must re-encrypt all existing API keys
2. Create a migration script to:
   - Decrypt all keys with old key
   - Encrypt all keys with new key
3. Update `ENCRYPTION_MASTER_KEY` in `.env`
4. Run migration

### Create Multiple Admin Users

```bash
# Create another admin
python scripts/create_admin_user.py \
  --email admin2@example.com \
  --password SecurePass456! \
  --name "Admin 2"
```

### Make Existing User Admin

```sql
-- Via SQL
UPDATE users SET is_admin = true WHERE email = 'user@example.com';
```

Or via Python:

```python
# In backend shell
from app.models.user import User
from app.core.database import SessionLocal

db = SessionLocal()
user = db.query(User).filter(User.email == "user@example.com").first()
if user:
    user.is_admin = True
    db.commit()
    print(f"✅ {user.email} is now admin")
db.close()
```

## 🐛 Troubleshooting

### "Admin access required"

**Problem:** Getting 403 Forbidden when accessing admin endpoints

**Solution:**
1. Check your user has `is_admin=True` in database
2. Verify JWT token is valid and not expired
3. Check Authorization header format: `Bearer <token>`

### "Failed to decrypt"

**Problem:** Cannot decrypt API keys

**Solution:**
1. Verify `ENCRYPTION_MASTER_KEY` matches what was used to encrypt
2. If key changed, you need to re-encrypt all API keys
3. Check key is at least 32 characters

### Cannot login

**Problem:** Login fails with incorrect credentials

**Solution:**
1. Verify user exists: `SELECT * FROM users WHERE email = 'admin@smartspec.local';`
2. Check password meets requirements (8+ chars, uppercase, lowercase, digit, special)
3. Re-create admin user: `python scripts/create_admin_user.py`

### Migration fails

**Problem:** SQL migration fails

**Solution:**
1. Check database is running
2. Verify connection string in `.env`
3. For PostgreSQL: User needs CREATE TABLE permissions
4. For SQLite: Tables auto-create on first run

## 📚 API Documentation

Full API documentation available at:
- **Swagger UI:** http://localhost:8000/docs
- **ReDoc:** http://localhost:8000/redoc

API Endpoints:
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login and get JWT
- `GET /api/auth/me` - Get current user info
- `GET /api/v1/admin/provider-configs/` - List providers (admin)
- `POST /api/v1/admin/provider-configs/` - Create provider (admin)
- `PUT /api/v1/admin/provider-configs/{name}` - Update provider (admin)
- `DELETE /api/v1/admin/provider-configs/{name}` - Delete provider (admin)

## 🎯 Next Steps

After setup:

1. **Change default password**
   - Login as admin
   - Change password immediately

2. **Configure LLM Providers**
   - Go to `/admin/settings`
   - Add API keys for providers you want to use

3. **Test Provider Connections**
   - Test each provider to verify API keys work
   - Enable providers you want to use

4. **Create Regular Users**
   - Use register endpoint or UI
   - Regular users can use the app but not admin features

## 🔗 Related Documentation

- [Provider Configuration README](python-backend/migrations/README_PROVIDER_CONFIG.md)
- [Backend API Documentation](http://localhost:8000/docs)
- [Desktop App README](desktop-app/README.md)

## 💡 Tips

1. **Development:** Use the default admin credentials
2. **Production:** Always use strong passwords and encryption keys
3. **Backup:** Export provider configs before major changes
4. **Security:** Rotate API keys regularly
5. **Monitoring:** Check audit logs for admin actions

## ❓ Questions?

Need help? Check:
- API docs: http://localhost:8000/docs
- GitHub Issues: https://github.com/...
- Contact: SmartSpec Team

---

**Version:** 1.0.0
**Last Updated:** 2026-01-08
**Author:** SmartSpec Team
