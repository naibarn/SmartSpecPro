# Provider Configuration Migration

## Overview

This migration adds support for storing encrypted LLM provider API keys and configuration in the database, allowing admins to manage provider settings through the UI instead of editing `.env` files.

## Files Created

### Backend

1. **`app/models/provider_config.py`**
   - Database model for storing provider configurations
   - Stores encrypted API keys and settings

2. **`app/core/encryption.py`**
   - Encryption service using Fernet (symmetric encryption)
   - Encrypts/decrypts API keys securely

3. **`app/api/admin_provider_config.py`**
   - REST API endpoints for managing provider configs
   - Admin-only access (requires `is_admin=True`)
   - Endpoints:
     - `GET /api/v1/admin/provider-configs/` - List all configs
     - `GET /api/v1/admin/provider-configs/{provider_name}` - Get specific config
     - `POST /api/v1/admin/provider-configs/` - Create new config
     - `PUT /api/v1/admin/provider-configs/{provider_name}` - Update config
     - `DELETE /api/v1/admin/provider-configs/{provider_name}` - Delete config
     - `POST /api/v1/admin/provider-configs/{provider_name}/test` - Test config

4. **`app/main.py`** (modified)
   - Added import and router registration

5. **`app/models/__init__.py`** (modified)
   - Added `ProviderConfig` model export

### Frontend (Desktop App)

1. **`desktop-app/src/pages/AdminSettings.tsx`**
   - Admin UI for managing provider configurations
   - Features:
     - List all configured providers
     - Add new providers from templates
     - Edit existing provider configurations
     - Delete providers
     - Enable/disable providers

2. **`desktop-app/src/App.tsx`** (modified)
   - Added route for `/admin/settings`

3. **`desktop-app/src/components/Sidebar.tsx`** (modified)
   - Added "Admin" section with link to Provider Config

### Database

1. **`migrations/create_provider_configs_table.sql`**
   - SQL migration script
   - Creates `provider_configs` table
   - Adds indexes
   - Inserts default providers (disabled by default)
   - Creates trigger for `updated_at` field

## Running the Migration

### 1. Set Encryption Master Key

Add to your `.env` file:

```bash
# Required for encrypting API keys
ENCRYPTION_MASTER_KEY=your-secure-32-character-key-here-change-in-prod
```

**Important:** Use a strong, random key in production!

### 2. Run Database Migration

```bash
cd python-backend

# For PostgreSQL
psql -U smartspec -d smartspec -f migrations/create_provider_configs_table.sql

# Or if using Alembic (recommended)
alembic upgrade head
```

### 3. Restart Backend Server

```bash
cd python-backend
python -m uvicorn app.main:app --reload --port 8000
```

### 4. Access Admin UI

1. Start the desktop app
2. Navigate to `/admin/settings` or click "⚙️ Provider Config" in sidebar
3. You must be logged in as an admin user (`is_admin=True`)

## Usage

### Adding a Provider

1. Go to Admin Settings → Provider Config
2. Click on a provider template (e.g., "OpenAI", "Anthropic")
3. Fill in:
   - Display Name (e.g., "OpenAI GPT-4")
   - API Key (will be encrypted)
   - Base URL (optional, has defaults)
   - Description (optional)
4. Check "Enable this provider" to activate
5. Click "Save"

### Editing a Provider

1. Click "Edit" on any existing provider
2. Update fields (leave API Key empty to keep existing)
3. Click "Save"

### Security Notes

- ✅ API keys are **encrypted** at rest using Fernet
- ✅ API keys are **never** returned in API responses (only `has_api_key: boolean`)
- ✅ Endpoints are **admin-only** (require `is_admin=True`)
- ✅ Master encryption key should be stored securely (environment variable)
- ⚠️ Rotating the master key requires re-encrypting all API keys

## Supported Providers

Default templates include:

- **OpenAI** - GPT-4, GPT-3.5, etc.
- **Anthropic Claude** - Claude 3 Opus, Sonnet, Haiku
- **Google AI** - Gemini Pro
- **Groq** - Ultra-fast inference
- **Ollama** - Local models
- **OpenRouter** - 420+ models unified API
- **Z.AI** - GLM series

## Integration with Existing Code

After migration, you can:

1. **Keep using `.env` files** (backward compatible)
2. **Use database configs** (preferred for production)
3. **Mix both** (database takes precedence)

To integrate with existing LLM proxy:

```python
from app.models.provider_config import ProviderConfig
from app.core.encryption import encryption_service
from sqlalchemy import select

# Get provider config from database
result = await db.execute(
    select(ProviderConfig).where(
        ProviderConfig.provider_name == "openai",
        ProviderConfig.is_enabled == True
    )
)
config = result.scalar_one_or_none()

if config and config.api_key_encrypted:
    api_key = encryption_service.decrypt(config.api_key_encrypted)
    base_url = config.base_url
    # Use api_key and base_url...
```

## Troubleshooting

### "Admin access required"
- Ensure your user has `is_admin=True` in the database
- Check that you're logged in with correct token

### "Failed to decrypt"
- Verify `ENCRYPTION_MASTER_KEY` is set correctly
- If key changed, you need to re-encrypt all API keys

### Migration fails
- Ensure PostgreSQL is running
- Check user has CREATE TABLE permissions
- For SQLite, some SQL syntax may need adjustment

## Next Steps

Optional enhancements:

1. **Add provider testing** - Implement actual API calls in test endpoint
2. **Add key rotation** - Tool to re-encrypt all keys with new master key
3. **Add audit logging** - Track who modified which provider configs
4. **Add validation** - Validate API keys before saving
5. **Add backup/restore** - Export/import provider configs

## Questions?

Contact the SmartSpec team or check documentation at:
- Backend API docs: `http://localhost:8000/docs`
- Project GitHub: [SmartSpecPro](https://github.com/...)
