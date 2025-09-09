# server.py
from mcp.server.fastmcp import FastMCP, Context

# Create the server
mcp = FastMCP(name="Demo MCP Server")

# --- Tools --------------------------------------------------

@mcp.tool(title="Add two numbers")
def add(a: int, b: int) -> int:
    """Return a + b."""
    return a + b

@mcp.tool(title="Echo with progress")
async def echo_with_progress(message: str, steps: int = 3, ctx: Context | None = None) -> str:
    """
    Echoes a message while reporting progress to the client.
    """
    if ctx:
        for i in range(steps):
            await ctx.report_progress(progress=(i + 1) / steps, total=1.0, message=f"Step {i+1}/{steps}")
    return f"Echo: {message}"

# --- Resources (read-only data) ----------------------------

@mcp.resource("greeting://{name}", title="Personalized Greeting")
def greeting(name: str) -> str:
    """Dynamic resource that returns a simple greeting."""
    return f"Hello, {name}! 👋"

# --- Prompts (reusable prompt templates) -------------------

@mcp.prompt(title="Greet User", description="Generate a greeting with a chosen style.")
def greet_user(name: str, style: str = "friendly") -> str:
    styles = {
        "friendly": "Write a warm, friendly greeting",
        "formal": "Write a formal, professional greeting",
        "casual": "Write a casual, relaxed greeting",
    }
    instruction = styles.get(style, styles["friendly"])
    return f"{instruction} for someone named {name}."

# --- Entry point ------------------------------------------

if __name__ == "__main__":
    # Default transport is stdio; you can also pass transport="streamable-http"
    mcp.run()

