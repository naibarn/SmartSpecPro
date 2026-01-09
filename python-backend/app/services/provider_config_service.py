"""
Provider Configuration Service

Loads provider configurations from the database and provides them
to the LLM client with decrypted API keys.
"""

from typing import List, Dict, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import structlog

from app.models.provider_config import ProviderConfig
from app.core.encryption import encryption_service

logger = structlog.get_logger()


class ProviderConfigService:
    """Service for managing provider configurations"""

    async def get_enabled_providers(self, db: AsyncSession) -> List[ProviderConfig]:
        """
        Get all enabled provider configurations from database.

        Args:
            db: Database session

        Returns:
            List of enabled provider configs
        """
        result = await db.execute(
            select(ProviderConfig).where(ProviderConfig.is_enabled == True)
        )
        configs = result.scalars().all()

        logger.info(
            "loaded_provider_configs",
            count=len(configs),
            providers=[c.provider_name for c in configs]
        )

        return list(configs)

    async def get_provider_by_name(
        self,
        db: AsyncSession,
        provider_name: str
    ) -> Optional[ProviderConfig]:
        """
        Get a specific provider configuration by name.

        Args:
            db: Database session
            provider_name: Provider identifier

        Returns:
            Provider config or None
        """
        result = await db.execute(
            select(ProviderConfig).where(
                ProviderConfig.provider_name == provider_name,
                ProviderConfig.is_enabled == True
            )
        )
        return result.scalar_one_or_none()

    def get_decrypted_api_key(self, config: ProviderConfig) -> Optional[str]:
        """
        Get decrypted API key from provider config.

        Args:
            config: Provider configuration

        Returns:
            Decrypted API key or None
        """
        if not config.api_key_encrypted:
            return None

        try:
            return encryption_service.decrypt(config.api_key_encrypted)
        except Exception as e:
            logger.error(
                "failed_to_decrypt_api_key",
                provider=config.provider_name,
                error=str(e)
            )
            return None

    def get_provider_config_dict(self, config: ProviderConfig) -> Dict:
        """
        Convert provider config to a dictionary for LLM client.

        Args:
            config: Provider configuration

        Returns:
            Dictionary with provider settings
        """
        api_key = self.get_decrypted_api_key(config)

        config_dict = {
            "provider_name": config.provider_name,
            "display_name": config.display_name,
            "api_key": api_key,
            "base_url": config.base_url,
            "is_enabled": config.is_enabled,
            "description": config.description,
        }

        # Add config_json fields (including default_model)
        if config.config_json:
            config_dict.update({
                "default_model": config.config_json.get("default_model"),
                "config": config.config_json
            })

        return config_dict

    async def get_all_provider_configs(self, db: AsyncSession) -> Dict[str, Dict]:
        """
        Get all enabled provider configs as a dictionary.

        Args:
            db: Database session

        Returns:
            Dictionary mapping provider_name to config dict
        """
        providers = await self.get_enabled_providers(db)

        return {
            provider.provider_name: self.get_provider_config_dict(provider)
            for provider in providers
            if self.get_decrypted_api_key(provider)  # Only include if has valid API key
        }

    async def get_default_model(
        self,
        db: AsyncSession,
        provider_name: str
    ) -> Optional[str]:
        """
        Get the default model for a provider.

        Args:
            db: Database session
            provider_name: Provider identifier

        Returns:
            Default model name or None
        """
        config = await self.get_provider_by_name(db, provider_name)

        if not config or not config.config_json:
            return None

        return config.config_json.get("default_model")


# Global singleton instance
_provider_config_service: Optional[ProviderConfigService] = None


def get_provider_config_service() -> ProviderConfigService:
    """Get singleton instance of ProviderConfigService"""
    global _provider_config_service
    if _provider_config_service is None:
        _provider_config_service = ProviderConfigService()
    return _provider_config_service
