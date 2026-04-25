"""Structured Agent.as_tool integration example.

This shows how to expose a specialist prompt agent as a structured tool.
"""

import asyncio
from pydantic import BaseModel, Field
from agents import Agent, Runner


class PromptBrief(BaseModel):
    topic: str = Field(description="Image topic or creative brief.")
    target_language: str = Field(default="auto", description="Prompt language code.")
    image_style: str = Field(default="auto", description="Style preset or auto.")
    cinematic_mode: str = Field(default="auto", description="on/off/auto cinematic treatment.")


prompt_specialist = Agent(
    name="prompt-specialist",
    instructions=(
        "Convert structured input into a concise JSON-compatible image prompt brief. "
        "Prefer explicit camera, lighting, style, and safety constraints."
    ),
)

orchestrator = Agent(
    name="orchestrator",
    instructions="Dispatch structured image prompt tasks to the specialist tool.",
    tools=[
        prompt_specialist.as_tool(
            tool_name="draft_image_prompt_brief",
            tool_description="Draft an image prompt brief from structured arguments.",
            parameters=PromptBrief,
            include_input_schema=True,
        )
    ],
)


async def main() -> None:
    result = await Runner.run(
        orchestrator,
        "Draft a Thai cinematic product ad prompt for a premium yuzu iced tea.",
    )
    print(result.final_output)


if __name__ == "__main__":
    asyncio.run(main())
