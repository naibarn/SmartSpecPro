"""
SmartSpec Pro - Stripe Configuration
Configuration and utilities for Stripe payment integration.
"""

import os
from dataclasses import dataclass
from typing import Dict, Optional

import stripe


@dataclass
class StripeConfig:
    """Stripe configuration."""
    
    # API Keys
    secret_key: str
    publishable_key: str
    webhook_secret: str
    
    # Price IDs for subscription plans
    price_ids: Dict[str, Dict[str, str]]
    
    # Currency
    currency: str = "usd"
    
    @classmethod
    def from_env(cls) -> "StripeConfig":
        """Create configuration from environment variables."""
        return cls(
            secret_key=os.getenv("STRIPE_SECRET_KEY", ""),
            publishable_key=os.getenv("STRIPE_PUBLISHABLE_KEY", ""),
            webhook_secret=os.getenv("STRIPE_WEBHOOK_SECRET", ""),
            price_ids={
                "pro": {
                    "monthly": os.getenv("STRIPE_PRICE_PRO_MONTHLY", ""),
                    "yearly": os.getenv("STRIPE_PRICE_PRO_YEARLY", ""),
                },
                "enterprise": {
                    "monthly": os.getenv("STRIPE_PRICE_ENTERPRISE_MONTHLY", ""),
                    "yearly": os.getenv("STRIPE_PRICE_ENTERPRISE_YEARLY", ""),
                },
            },
            currency=os.getenv("STRIPE_CURRENCY", "usd"),
        )
    
    @property
    def is_configured(self) -> bool:
        """Check if Stripe is properly configured."""
        return bool(self.secret_key and self.publishable_key)
    
    def get_price_id(self, plan: str, interval: str) -> Optional[str]:
        """Get price ID for a plan and billing interval."""
        return self.price_ids.get(plan, {}).get(interval)


def init_stripe(config: Optional[StripeConfig] = None):
    """Initialize Stripe with configuration."""
    if config is None:
        config = StripeConfig.from_env()
    
    if config.is_configured:
        stripe.api_key = config.secret_key
    
    return config


# Initialize on import
_stripe_config: Optional[StripeConfig] = None


def get_stripe_config() -> StripeConfig:
    """Get Stripe configuration singleton."""
    global _stripe_config
    if _stripe_config is None:
        _stripe_config = init_stripe()
    return _stripe_config
