import lmstudio as lms

import lmstudio as lms
SERVER_API_HOST = "localhost:1234"

if await lms.AsyncClient.is_valid_api_host(SERVER_API_HOST):
    print(f"An LM Studio API server instance is available at {SERVER_API_HOST}")
else:
    print("No LM Studio API server instance found at {SERVER_API_HOST}")

with lms.Client() as client:
    model = client.llm.model("llama-3.2-1b-instruct")
    result = model.respond("What is the meaning of life?")

    print(result)