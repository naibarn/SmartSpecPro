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
    reasoning_effort: str = ""
    thinking_enabled: bool = False
    thinking_param_style: str = ""

def load_llm_config_from_env() -> Optional[LLMConfig]:
    base_url = os.getenv("ISC_LLM_BASE_URL", "").strip()
    api_key = os.getenv("ISC_LLM_API_KEY", "").strip()
    model = os.getenv("ISC_LLM_MODEL", "").strip()
    if not (base_url and api_key and model):
        return None
    thinking_param_style = os.getenv("ISC_LLM_THINKING_PARAM_STYLE", "").strip()
    return LLMConfig(
        base_url=base_url.rstrip("/"),
        api_key=api_key,
        model=model,
        thinking_param_style=thinking_param_style,
    )

def _normalize_thinking_param_style(value: str) -> str:
    normalized = str(value or "").strip()
    if not normalized:
        return "reasoning"
    lowered = normalized.lower().replace("-", "_")
    aliases = {
        "reasoning": "reasoning",
        "responses": "reasoning",
        "openai": "reasoning",
        "thinkingflag": "thinkingFlag",
        "thinking_flag": "thinkingFlag",
        "messages": "thinkingFlag",
        "anthropic": "thinkingFlag",
        "claude": "thinkingFlag",
        "reasoning_effort": "reasoning_effort",
        "gemini": "reasoning_effort",
        "google": "reasoning_effort",
        "none": "none",
        "disabled": "none",
    }
    return aliases.get(lowered, "reasoning")

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
    reasoning_effort = str(o.get("reasoning_effort", env_cfg.reasoning_effort if env_cfg else "") or "").strip()
    thinking_enabled = bool(o.get("thinking_enabled", env_cfg.thinking_enabled if env_cfg else False))
    thinking_param_style = str(
        o.get("thinking_param_style", env_cfg.thinking_param_style if env_cfg else "") or ""
    ).strip()
    return LLMConfig(
        base_url=base_url.rstrip("/"),
        api_key=api_key,
        model=model,
        temperature=temperature,
        timeout_s=timeout_s,
        reasoning_effort=reasoning_effort,
        thinking_enabled=thinking_enabled,
        thinking_param_style=thinking_param_style,
    )

class OpenAICompatibleClient:
    def __init__(self, cfg: LLMConfig):
        self.cfg = cfg

    def chat(self, messages: List[Dict[str, str]], response_format: Optional[Dict[str, Any]] = None) -> str:
        url = self.cfg.base_url.rstrip("/") + "/chat/completions"
        headers = {"Authorization": f"Bearer {self.cfg.api_key}", "Content-Type":"application/json"}
        payload: Dict[str, Any] = {"model": self.cfg.model, "messages": messages, "temperature": self.cfg.temperature}
        if self.cfg.thinking_enabled:
            effort = self.cfg.reasoning_effort or "high"
            style = _normalize_thinking_param_style(self.cfg.thinking_param_style)
            if style == "reasoning":
                payload["reasoning"] = {"effort": effort}
            elif style == "thinkingFlag":
                payload["thinkingFlag"] = True
            elif style == "reasoning_effort":
                payload["reasoning_effort"] = effort
                payload["include_thoughts"] = True
        if response_format:
            payload["response_format"] = response_format
        r = requests.post(url, headers=headers, json=payload, timeout=self.cfg.timeout_s)
        r.raise_for_status()
        data = r.json()
        return data["choices"][0]["message"]["content"]
