"""Native typed function-tool integration for openai-agents-python.

Install with: pip install openai-agents pydantic
"""

from typing import Literal
from pydantic import BaseModel, Field
from agents import Agent, Runner, function_tool
from gpt_image_prompt_engineer import run_skill


class PromptRequest(BaseModel):
    topic: str = Field(..., min_length=3, description="Image topic or creative brief.")
    target_language: str = Field("auto", description="Prompt language, such as th, en, ja, or auto.")
    image_style: str = Field("auto", description="Style preset, such as cinematic, product_ad, fashion_lookbook, or auto.")
    mode: Literal["generate", "edit"] = "generate"
    aspect_ratio: str = "auto"
    cinematic_mode: str = "auto"
    lighting_preset: str = "auto"
    camera_angle: str = "auto"
    subject_age: int | None = None


@function_tool
async def build_gpt_image_prompt(request: PromptRequest) -> dict:
    """Build a structured GPT Image prompt bundle with decision trace, safety review, and render request."""
    return run_skill(request.model_dump(exclude_none=True))


agent = Agent(
    name="GPT Image Prompt Engineer",
    instructions="Use build_gpt_image_prompt whenever the user needs a structured image prompt bundle.",
    tools=[build_gpt_image_prompt],
)


async def main() -> None:
    result = await Runner.run(
        agent,
        "Create a Thai cinematic prompt bundle for a luxury Korean fashion portrait of an 18-year-old woman.",
    )
    print(result.final_output)
