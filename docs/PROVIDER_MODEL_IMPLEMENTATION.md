# Provider Model Configuration Implementation

## Overview

This implementation adds complete support for configuring LLM provider models through the Admin UI, storing them in the database, and using them automatically when making LLM API calls.

## What Was Implemented

### 1. Admin UI - Model Name Field

**File**: `desktop-app/src/pages/AdminSettings.tsx`

**Changes**:
- Added `default_model` field to all provider templates (lines 30-79)
- Added form input field for "Default Model" (lines 478-502)
- Display default model in provider list (lines 362-366)
- Model field is required with helpful placeholder examples

**Example**:
```typescript
{
  provider_name: "kilocode",
  display_name: "Kilo Code",
  base_url: "https://api.kilo.ai/api/openrouter",
  default_model: "minimax/minimax-m2.1:free",  // NEW
  description: "Access multiple LLM models through Kilo Code API"
}
```

### 2. Provider Config Service

**File**: `python-backend/app/services/provider_config_service.py` (NEW)

**Purpose**: Bridge between database provider configs and LLM client

**Key Features**:
- `get_enabled_providers()` - Load all enabled providers from database
- `get_decrypted_api_key()` - Decrypt API keys using encryption service
- `get_provider_config_dict()` - Convert DB config to dictionary with default_model
- `get_default_model()` - Get default model for a specific provider

**Usage**:
```python
from app.services.provider_config_service import get_provider_config_service

service = get_provider_config_service()
configs = await service.get_all_provider_configs(db)
# Returns: {"kilocode": {"api_key": "...", "default_model": "minimax/minimax-m2.1:free", ...}}
```

### 3. Unified LLM Client - Database Integration

**File**: `python-backend/app/llm_proxy/unified_client.py`

**Changes**:
- Added `provider_configs` and `default_models` attributes (lines 40-41)
- Updated `initialize()` to accept database session (line 46)
- Added `_initialize_from_database()` to load providers from DB (lines 66-100)
- Added `_initialize_provider_from_config()` to create provider clients (lines 102-171)
- Updated `_chat_direct()` to use default model from config (lines 378-385)

**Key Features**:
- Loads provider configs from database when initialized with DB session
- Decrypts API keys automatically
- Stores default models per provider
- Uses default model when calling provider APIs
- Supports both .env and database configuration (backward compatible)

**Supported Providers**:
- `kilocode` - Kilo Code API (OpenRouter-compatible)
- `openrouter` - OpenRouter
- `openai` - OpenAI
- `anthropic` - Anthropic
- `groq` - Groq
- `ollama` - Ollama (local)

### 4. OpenAI-Compatible Endpoint Update

**File**: `python-backend/app/api/openai_compat.py`

**Changes**:
- Added database session dependency (line 5, 8, 14)
- Pass database session to `client.initialize(db=db)` (line 115)
- Client now loads provider configs from database automatically

**Flow**:
```
Request → /v1/chat/completions → UnifiedLLMClient.initialize(db)
  → Load providers from database → Use configured default models
```

### 5. Model Validation

**File**: `python-backend/app/api/admin_provider_config.py`

**Changes**:
- Create endpoint: Validate `default_model` is set (lines 169-174)
- Create endpoint: Validate OpenRouter format for kilocode/openrouter (lines 176-184)
- Update endpoint: Same validation when updating config_json (lines 245-262)

**Validation Rules**:
1. `default_model` is required in `config_json`
2. For `kilocode` and `openrouter` providers, model must be in format:
   - `provider/model` (e.g., `minimax/minimax-m2.1`)
   - `provider/model:variant` (e.g., `minimax/minimax-m2.1:free`)

**Error Examples**:
```json
{
  "detail": "default_model is required in config_json"
}
```
```json
{
  "detail": "Model for kilocode must be in format 'provider/model' or 'provider/model:variant' (e.g., 'minimax/minimax-m2.1:free')"
}
```

## How It Works

### Complete Flow

1. **Admin Configuration**:
   ```
   Admin UI → Fill form → Set default_model → Save
   → Backend validates model format → Store encrypted in database
   ```

2. **LLM API Call**:
   ```
   Desktop App → Kilo CLI → Backend /v1/chat/completions
   → UnifiedLLMClient.initialize(db) → Load provider configs from DB
   → Decrypt API keys → Use default_model from config → Call provider API
   ```

3. **Model Selection Logic**:
   ```python
   # If model specified in request
   model = request.model or client.default_models[provider_name]

   # Example:
   # Provider: kilocode
   # Default model from DB: "minimax/minimax-m2.1:free"
   # API call uses: "minimax/minimax-m2.1:free"
   ```

## Testing Guide

### 1. Create Admin User ✅ COMPLETED

```bash
cd python-backend
.venv/bin/python create_admin_user.py
# Email: admin@smartspec.pro
# Password: admin123
# User ID: 70ed4d9a-3e08-4bd3-803b-b9b0d9529672
```

**Status**: ✅ Admin user created successfully

### 2. Configure Provider with Model

1. Open Desktop App: `http://localhost:1420`
2. Login as admin
3. Go to `/admin/settings`
4. Click "Kilo Code" to add new provider
5. Fill form:
   - **Display Name**: "Kilo Code Production"
   - **API Key**: Your Kilo Code API key
   - **Base URL**: `https://api.kilo.ai/api/openrouter` (default)
   - **Default Model**: `minimax/minimax-m2.1:free` (REQUIRED)
   - **Description**: Optional
   - **Enable**: Checked
6. Click "Save"

### 3. Test LLM API Call

```bash
# Get auth token
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@smartspec.pro",
    "password": "admin123"
  }' | jq -r '.access_token')

# Test chat completion
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "kilocode/minimax-m2.1:free",
    "messages": [
      {"role": "user", "content": "Hello, how are you?"}
    ]
  }'
```

**Expected Response**:
```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1736434567,
  "model": "kilocode/minimax-m2.1:free",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! I'm doing well, thank you for asking..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 0,
    "completion_tokens": 0,
    "total_tokens": 150
  }
}
```

### 4. Verify Model Usage in Logs

```bash
# Start backend with logging
cd python-backend
LOG_LEVEL=INFO python -m uvicorn app.main:app --reload --port 8000
```

**Look for log entries**:
```
providers_loaded_from_database count=1 providers=['kilocode'] models={'kilocode': 'minimax/minimax-m2.1:free'}
kilocode_initialized_from_db base_url='https://api.kilo.ai/api/openrouter'
using_default_model provider='kilocode' model='minimax/minimax-m2.1:free'
```

## Files Modified/Created

### Created:
1. `python-backend/app/services/provider_config_service.py` - Provider config service

### Modified:
1. `desktop-app/src/pages/AdminSettings.tsx` - Added model name field
2. `python-backend/app/llm_proxy/unified_client.py` - Database integration
3. `python-backend/app/api/openai_compat.py` - Pass DB session
4. `python-backend/app/api/admin_provider_config.py` - Model validation

## Benefits

1. **Dynamic Configuration**: Change models without restarting backend
2. **Per-Provider Models**: Each provider can use different models
3. **Validation**: Ensures correct model format before saving
4. **Security**: API keys encrypted at rest
5. **Admin Control**: Centralized management through Admin UI
6. **Logging**: Track which models are used
7. **Backward Compatible**: Still supports .env configuration

## Next Steps

To complete the integration:

1. ✅ **COMPLETED - Admin user created** (User ID: 70ed4d9a-3e08-4bd3-803b-b9b0d9529672)

2. **Restart Backend**:
   ```bash
   cd python-backend
   .venv/bin/python -m uvicorn app.main:app --reload --port 8000
   ```

3. **Configure Providers**:
   - Add your provider API keys through Admin UI
   - Set appropriate default models for each provider

3. **Test Complete Flow**:
   ```
   Desktop App → Admin Settings → Configure Provider
   → Use Kilo CLI → Verify model is used correctly
   ```

4. **Update Documentation**:
   - User guide for configuring providers
   - Developer guide for adding new providers

## Troubleshooting

### Error: "default_model is required in config_json"
**Solution**: Fill in the "Default Model" field in the form

### Error: "Model for kilocode must be in format 'provider/model'..."
**Solution**: Use correct format like `minimax/minimax-m2.1:free`

### Error: "Provider kilocode not available"
**Solution**:
1. Ensure provider is enabled in Admin UI
2. Ensure API key is set
3. Restart backend to reload configs

### Model not being used
**Solution**:
1. Check logs for `using_default_model` message
2. Verify `default_model` is set in database
3. Ensure `UnifiedLLMClient.initialize(db)` is called with DB session

## Summary

This implementation completes the provider model configuration feature by:
- Adding UI for model configuration
- Creating service to load configs from database
- Integrating database configs with LLM client
- Validating model formats
- Using configured models automatically in API calls

The system now supports a complete flow from admin configuration to actual LLM API usage with proper model selection.
