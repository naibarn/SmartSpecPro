"""Hosted ShellTool inline-skill packaging example for openai-agents-python."""

import asyncio
import base64
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZIP_DEFLATED, ZipFile
from agents import Agent, Runner, ShellTool, ShellToolInlineSkill

SKILL_NAME = "gpt-image-prompt-engineer-v4"
SKILL_DIR = Path(__file__).resolve().parents[1]


def build_inline_skill() -> ShellToolInlineSkill:
    with TemporaryDirectory(prefix="gpt-image-skill-") as temp_dir:
        zip_path = Path(temp_dir) / f"{SKILL_NAME}.zip"
        with ZipFile(zip_path, "w", compression=ZIP_DEFLATED) as archive:
            for path in sorted(SKILL_DIR.rglob("*")):
                if path.is_file() and "__pycache__" not in path.parts and ".pytest_cache" not in path.parts:
                    archive.write(path, f"{SKILL_NAME}/{path.relative_to(SKILL_DIR)}")
        data = base64.b64encode(zip_path.read_bytes()).decode("ascii")
    return {
        "type": "inline",
        "name": SKILL_NAME,
        "description": "Build structured GPT Image prompt bundles with decision trace and render requests.",
        "source": {"type": "base64", "media_type": "application/zip", "data": data},
    }


async def main() -> None:
    agent = Agent(
        name="Container Prompt Engineer",
        model="gpt-5.4",
        instructions="Use the mounted skill to build prompt bundles.",
        tools=[ShellTool(environment={"type": "container_auto", "network_policy": {"type": "disabled"}, "skills": [build_inline_skill()]})],
    )
    result = await Runner.run(agent, "Create a Thai cinematic fashion prompt bundle.")
    print(result.final_output)


if __name__ == "__main__":
    asyncio.run(main())
