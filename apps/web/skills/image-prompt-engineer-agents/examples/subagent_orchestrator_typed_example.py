"""Review-module orchestration example for OpenAI Agents SDK.

This example keeps the skill itself model-free. The application chooses its own
agent/runtime configuration outside the skill when it wants live agents-as-tools.
"""

from __future__ import annotations

import json
from typing import Any

from agents import Agent, Runner, function_tool
from pydantic import BaseModel, Field

from gpt_image_prompt_engineer import run_skill


class PromptSkillInput(BaseModel):
    topic: str = Field(description="Image topic or creative brief.")
    target_language: str = Field(default="auto")
    image_style: str = Field(default="auto")
    orchestration_mode: str = Field(default="auto")
    enable_subagents: bool = Field(default=True)
    subagent_budget: str = Field(default="balanced")


@function_tool
def build_prompt_bundle(payload: PromptSkillInput) -> dict[str, Any]:
    """Build a model-free GPT Image prompt bundle with optional review-module reports."""
    return run_skill(payload.model_dump())


visual_director = Agent(
    name="Visual Director",
    instructions=(
        "Review prompt bundles for composition, subject hierarchy, and background coherence. "
        "Return concise JSON-style recommendations only."
    ),
)

cinematographer = Agent(
    name="Cinematographer",
    instructions=(
        "Review prompt bundles for camera, lens, depth of field, lighting, and film language. "
        "Return concise JSON-style recommendations only."
    ),
)

prompt_orchestrator = Agent(
    name="Prompt Orchestrator",
    instructions=(
        "Use build_prompt_bundle first. For complex prompts, inspect the returned subagent_reports "
        "and ask specialist agents as tools only when extra critique is required. Keep renderer/model "
        "selection outside the skill."
    ),
    tools=[
        build_prompt_bundle,
        visual_director.as_tool(
            tool_name="visual_director_review",
            tool_description="Review composition and visual hierarchy.",
        ),
        cinematographer.as_tool(
            tool_name="cinematographer_review",
            tool_description="Review cinematic camera and lighting choices.",
        ),
    ],
)


async def main() -> None:
    result = await Runner.run(
        prompt_orchestrator,
        "Create a Thai prompt bundle for a cinematic fashion storyboard with 4 panels.",
    )
    print(result.final_output)
