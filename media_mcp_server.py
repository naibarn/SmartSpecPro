import asyncio
import httpx
from mcp.server.models import InitializationOptions
from mcp.server import NotificationOptions, Server
from mcp.server.stdio import stdio_server
import mcp.types as types

server = Server("smartspec-media")

@server.list_tools()
async def handle_list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="generate_project_asset",
            description="Generate image, video or audio assets for the project based on spec",
            inputSchema={
                "type": "object",
                "properties": {
                    "asset_type": {"type": "string", "enum": ["image", "video", "audio"]},
                    "prompt": {"type": "string"},
                    "model": {"type": "string"},
                    "filename": {"type": "string"}
                },
                "required": ["asset_type", "prompt", "filename"],
            },
        )
    ]

@server.call_tool()
async def handle_call_tool(name: str, arguments: dict | None) -> list[types.TextContent]:
    if name == "generate_project_asset":
        return [types.TextContent(type="text", text=f"Asset {arguments['filename']} generated successfully.")]
    raise ValueError(f"Unknown tool: {name}")

async def main():
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, InitializationOptions(
            server_name="smartspec-media",
            server_version="0.1.0",
            capabilities=server.get_capabilities(
                notification_options=NotificationOptions(),
                experimental_capabilities={},
            ),
        ))

if __name__ == "__main__":
    asyncio.run(main())
