"""SandboxAgent + lazy local skill loading example.

Run from a parent directory that contains this skill directory.
"""

import asyncio
from pathlib import Path
from agents import Runner
from agents.run import RunConfig
from agents.sandbox import Manifest, SandboxAgent, SandboxRunConfig
from agents.sandbox.capabilities import Capabilities, LocalDirLazySkillSource, Skills
from agents.sandbox.entries import LocalDir
from agents.sandbox.sandboxes.unix_local import UnixLocalSandboxClient

SKILLS_ROOT = Path(__file__).resolve().parents[1]


def build_agent(model: str = "gpt-5.4") -> SandboxAgent:
    return SandboxAgent(
        name="Sandbox Prompt Engineer",
        model=model,
        instructions="Use the gpt-image-prompt-engineer-v4 skill when creating structured image prompts.",
        default_manifest=Manifest(entries={}),
        capabilities=Capabilities.default() + [
            Skills(lazy_from=LocalDirLazySkillSource(source=LocalDir(src=SKILLS_ROOT.parent)))
        ],
    )


async def main() -> None:
    result = await Runner.run(
        build_agent(),
        "Use the gpt-image-prompt-engineer-v4 skill to create a Thai prompt for a cinematic fashion portrait.",
        run_config=RunConfig(sandbox=SandboxRunConfig(client=UnixLocalSandboxClient())),
    )
    print(result.final_output)


if __name__ == "__main__":
    asyncio.run(main())
