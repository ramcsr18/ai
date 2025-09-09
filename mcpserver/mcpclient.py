from mcp.client.session import ClientSession

async with ClientSession("/Users/ryaratap/git/genai/mcpserver/server.py") as session:
    tools = await session.list_tools()
    result = await session.call_tool("add", {"a": 2, "b": 3})
    print(result)
