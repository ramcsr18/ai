from tavily import TavilyClient

tavily_client = TavilyClient(api_key="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")
response = tavily_client.search("Who is Leo Messi?")

print(response)