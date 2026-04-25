"""Use the generated render_request with Agents SDK ImageGenerationTool.

This is an example only. It does not run during package tests.
"""

import asyncio
import base64
from pathlib import Path
from agents import Agent, ImageGenerationTool, Runner
from gpt_image_prompt_engineer import run_skill


async def main() -> None:
    bundle = run_skill({
        "topic": "cinematic premium perfume product ad on a black reflective surface",
        "target_language": "en",
        "image_style": "cinematic",
        "render_api": "responses_tool",
        "quality": "high"
    })
    tool_config = bundle["render_request"]["responses_tool"]["tools"][0]

    agent = Agent(
        name="Image Renderer",
        instructions="Always use the image generation tool for image rendering requests.",
        tools=[ImageGenerationTool(tool_config=tool_config)],
    )
    result = await Runner.run(agent, bundle["prompts"]["detailed"])
    for item in result.new_items:
        raw = getattr(item, "raw_item", None)
        if getattr(raw, "type", None) == "image_generation_call" and getattr(raw, "result", None):
            Path("rendered.png").write_bytes(base64.b64decode(raw.result))
            print("Saved rendered.png")
            return
    print(result.final_output)


if __name__ == "__main__":
    asyncio.run(main())
