"""
OpenAPI Configuration
Enhanced OpenAPI/Swagger documentation setup
"""

from typing import Dict, Any
from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi


def custom_openapi(app: FastAPI) -> Dict[str, Any]:
    """
    Custom OpenAPI schema generator
    
    Enhances the default OpenAPI schema with additional metadata,
    security schemes, and better documentation
    """
    if app.openapi_schema:
        return app.openapi_schema
    
    openapi_schema = get_openapi(
        title="SmartSpec Pro API",
        version="1.0.0",
        description="""
# SmartSpec Pro - Production-Grade SaaS Generation Platform

## Overview

SmartSpec Pro is an advanced AI-powered platform for generating production-ready SaaS applications.

**Key Features:**
- 🤖 **Multi-LLM Support**: OpenAI, Anthropic, Google, Groq, OpenRouter, Z.AI
- 💳 **Credit System**: Pay-as-you-go with 15% markup
- 💰 **Stripe Integration**: Secure payment processing
- 📊 **User Dashboard**: Real-time usage tracking
- 🔐 **JWT Authentication**: Secure API access
- 📈 **Usage Analytics**: Detailed statistics and insights

## Authentication

All API endpoints (except `/health` and `/auth`) require JWT authentication.

**How to authenticate:**

1. **Register/Login:**
   ```bash
   POST /api/auth/register
   POST /api/auth/login
   ```

2. **Get access token:**
   ```json
   {
     "access_token": "eyJhbGc...",
     "token_type": "bearer"
   }
   ```

3. **Use token in requests:**
   ```bash
   curl -H "Authorization: Bearer eyJhbGc..." https://api.smartspec.pro/api/...
   ```

## Credit System

**How it works:**
- 1 USD = 1,000 credits
- Top-up with 15% markup: $100 → 86,956 credits
- LLM usage: Cost × 1,000 = Credits deducted
- Example: $0.10 API call = 100 credits

**Top-up:**
```bash
POST /api/payments/checkout
{
  "amount_usd": 100.00,
  "success_url": "https://app.smartspec.pro/success",
  "cancel_url": "https://app.smartspec.pro/cancel"
}
```

## Rate Limits

- **Authentication:** 10 requests/minute
- **Dashboard:** 60 requests/minute
- **Payments:** 30 requests/minute
- **LLM Proxy:** 100 requests/minute

## Support

- **Documentation:** https://docs.smartspec.pro
- **Support:** https://help.manus.im
- **GitHub:** https://github.com/naibarn/SmartSpec
        """,
        routes=app.routes,
        tags=[
            {
                "name": "Health",
                "description": "Health check endpoints for monitoring"
            },
            {
                "name": "Authentication",
                "description": "User authentication and authorization endpoints"
            },
            {
                "name": "Credits",
                "description": "Credit management and balance endpoints"
            },
            {
                "name": "Payments",
                "description": "Payment processing and Stripe integration"
            },
            {
                "name": "Dashboard",
                "description": "User dashboard statistics and analytics"
            },
            {
                "name": "LLM Proxy",
                "description": "LLM proxy for multi-provider AI requests"
            },
            {
                "name": "Orchestrator",
                "description": "Task orchestration and workflow management"
            },
            {
                "name": "Workflows",
                "description": "Workflow templates and execution"
            },
            {
                "name": "Autopilot",
                "description": "Autopilot system for automated SaaS generation"
            }
        ]
    )
    
    # Add security schemes
    openapi_schema["components"]["securitySchemes"] = {
        "BearerAuth": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": "JWT token obtained from /api/auth/login or /api/auth/register"
        }
    }
    
    # Add global security requirement
    openapi_schema["security"] = [{"BearerAuth": []}]
    
    # Add servers
    openapi_schema["servers"] = [
        {
            "url": "https://api.smartspec.pro",
            "description": "Production server"
        },
        {
            "url": "https://staging-api.smartspec.pro",
            "description": "Staging server"
        },
        {
            "url": "http://localhost:8000",
            "description": "Local development server"
        }
    ]
    
    # Add contact info
    openapi_schema["info"]["contact"] = {
        "name": "SmartSpec Pro Support",
        "url": "https://help.manus.im",
        "email": "support@smartspec.pro"
    }
    
    # Add license
    openapi_schema["info"]["license"] = {
        "name": "Proprietary",
        "url": "https://smartspec.pro/license"
    }
    
    # Add external docs
    openapi_schema["externalDocs"] = {
        "description": "Complete Documentation",
        "url": "https://docs.smartspec.pro"
    }
    
    app.openapi_schema = openapi_schema
    return app.openapi_schema


def setup_openapi(app: FastAPI) -> None:
    """
    Setup OpenAPI documentation for the FastAPI app
    
    Args:
        app: FastAPI application instance
    """
    app.openapi = lambda: custom_openapi(app)
