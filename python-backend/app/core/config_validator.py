"""
SmartSpec Pro - Configuration Validator
Phase 0 - Critical Gap Fix #3
"""

import os
from typing import List, Dict
import structlog

logger = structlog.get_logger()


class ConfigurationError(Exception):
    """Configuration validation error"""
    pass


class ConfigValidator:
    """Validate configuration on startup"""
    
    @staticmethod
    def validate_all() -> Dict[str, any]:
        """
        Validate all configuration
        
        Returns:
            dict: Validation results
        
        Raises:
            ConfigurationError: If critical configuration is missing
        """
        results = {
            "valid": True,
            "errors": [],
            "warnings": [],
            "llm_providers": {},
        }
        
        # Validate LLM providers
        llm_results = ConfigValidator._validate_llm_providers()
        results["llm_providers"] = llm_results
        
        if not llm_results["has_any_provider"]:
            results["warnings"].append(
                "No LLM providers configured. At least one provider is recommended."
            )
        
        # Validate database
        db_valid, db_msg = ConfigValidator._validate_database()
        if not db_valid:
            results["warnings"].append(f"Database: {db_msg}")
        
        # Validate directories
        dir_valid, dir_msg = ConfigValidator._validate_directories()
        if not dir_valid:
            results["warnings"].append(f"Directories: {dir_msg}")
        
        # Validate security
        sec_valid, sec_msg = ConfigValidator._validate_security()
        if not sec_valid:
            results["errors"].append(f"Security: {sec_msg}")
            results["valid"] = False
        
        return results
    
    @staticmethod
    def _validate_llm_providers() -> Dict[str, any]:
        """Validate LLM provider configuration"""
        providers = {
            "openai": {
                "configured": bool(os.getenv("OPENAI_API_KEY")),
                "key_length": len(os.getenv("OPENAI_API_KEY", ""))
            },
            "anthropic": {
                "configured": bool(os.getenv("ANTHROPIC_API_KEY")),
                "key_length": len(os.getenv("ANTHROPIC_API_KEY", ""))
            },
            "google": {
                "configured": bool(os.getenv("GOOGLE_API_KEY")),
                "key_length": len(os.getenv("GOOGLE_API_KEY", ""))
            },
            "groq": {
                "configured": bool(os.getenv("GROQ_API_KEY")),
                "key_length": len(os.getenv("GROQ_API_KEY", ""))
            },
            "ollama": {
                "configured": True,  # Always available (local)
                "url": os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
            }
        }
        
        configured_count = sum(1 for p in providers.values() if p["configured"])
        
        return {
            "providers": providers,
            "configured_count": configured_count,
            "has_any_provider": configured_count > 0
        }
    
    @staticmethod
    def _validate_database() -> tuple[bool, str]:
        """Validate database configuration"""
        db_url = os.getenv("DATABASE_URL")
        
        if not db_url:
            return False, "DATABASE_URL not set"
        
        if "postgresql" not in db_url:
            return False, "DATABASE_URL must be PostgreSQL"
        
        return True, "OK"
    
    @staticmethod
    def _validate_directories() -> tuple[bool, str]:
        """Validate required directories"""
        dirs = [
            os.getenv("CHECKPOINT_DIR", "./data/checkpoints"),
            os.getenv("STATE_DIR", "./data/state"),
        ]
        
        for dir_path in dirs:
            if not os.path.exists(dir_path):
                try:
                    os.makedirs(dir_path, exist_ok=True)
                    logger.info(f"Created directory: {dir_path}")
                except Exception as e:
                    return False, f"Cannot create directory {dir_path}: {e}"
        
        return True, "OK"
    
    @staticmethod
    def _validate_security() -> tuple[bool, str]:
        """Validate security configuration"""
        secret_key = os.getenv("SECRET_KEY", "")
        
        if not secret_key or secret_key == "change-this-in-production":
            return False, "SECRET_KEY must be set to a secure value in production"
        
        if len(secret_key) < 32:
            return False, "SECRET_KEY must be at least 32 characters"
        
        return True, "OK"
    
    @staticmethod
    def validate_and_report():
        """Validate configuration and log results"""
        logger.info("Validating configuration...")
        
        try:
            results = ConfigValidator.validate_all()
            
            # Log LLM providers
            llm_info = results["llm_providers"]
            logger.info(
                "LLM Providers configured",
                count=llm_info["configured_count"],
                providers={
                    name: "✓" if info["configured"] else "✗"
                    for name, info in llm_info["providers"].items()
                }
            )
            
            # Log warnings
            for warning in results["warnings"]:
                logger.warning("Configuration warning", message=warning)
            
            # Log errors
            for error in results["errors"]:
                logger.error("Configuration error", message=error)
            
            if not results["valid"]:
                raise ConfigurationError(
                    f"Configuration validation failed: {', '.join(results['errors'])}"
                )
            
            logger.info("Configuration validation complete", status="OK")
            return results
        
        except Exception as e:
            logger.error("Configuration validation failed", error=str(e))
            raise
