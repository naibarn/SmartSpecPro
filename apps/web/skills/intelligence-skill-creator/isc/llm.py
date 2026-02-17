from __future__ import annotations
import os
import requests
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

@dataclass
class LLMConfig:
    base_url: str
    api_key: str
    model: str
    temperature: float = 0.0
    timeout_s: int = 180

def load_llm_config_from_env() -> Optional[LLMConfig]:
    base_url = os.getenv("ISC_LLM_BASE_URL", "").strip()
    api_key = os.getenv("ISC_LLM_API_KEY", "").strip()
    model = os.getenv("ISC_LLM_MODEL", "").strip()
    if not (base_url and api_key and model):
        return None
    return LLMConfig(base_url=base_url.rstrip("/"), api_key=api_key, model=model)

def merge_llm_config(env_cfg: Optional[LLMConfig], override: Optional[dict]) -> Optional[LLMConfig]:
    if not env_cfg and not override:
        return None
    o = override or {}
    base_url = (o.get("base_url") or (env_cfg.base_url if env_cfg else "")).strip()
    api_key  = (o.get("api_key")  or (env_cfg.api_key if env_cfg else "")).strip()
    model    = (o.get("model")    or (env_cfg.model if env_cfg else "")).strip()
    if not (base_url and api_key and model):
        return None
    temperature = float(o.get("temperature", env_cfg.temperature if env_cfg else 0.0))
    timeout_s = int(o.get("timeout_s", env_cfg.timeout_s if env_cfg else 180))
    return LLMConfig(base_url=base_url.rstrip("/"), api_key=api_key, model=model, temperature=temperature, timeout_s=timeout_s)

class OpenAICompatibleClient:
    def __init__(self, cfg: LLMConfig):
        self.cfg = cfg

    def chat(self, messages: List[Dict[str, str]], response_format: Optional[Dict[str, Any]] = None) -> str:
        url = self.cfg.base_url.rstrip("/") + "/chat/completions"
        headers = {"Authorization": f"Bearer {self.cfg.api_key}", "Content-Type":"application/json"}
        payload: Dict[str, Any] = {"model": self.cfg.model, "messages": messages, "temperature": self.cfg.temperature}
        if response_format:
            payload["response_format"] = response_format
        r = requests.post(url, headers=headers, json=payload, timeout=self.cfg.timeout_s)
        r.raise_for_status()
        data = r.json()
        return data["choices"][0]["message"]["content"]
