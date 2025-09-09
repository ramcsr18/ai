from openai import OpenAI

client = OpenAI(
  base_url="https://openrouter.ai/api/v1",
  api_key="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",
)

completion = client.chat.completions.create(
  extra_headers={},
  model="openai/gpt-4o",
  messages=[
    {
      "role": "user",
      "content": "What is the meaning of life?"
    }
  ]
)

print(completion.choices[0].message.content)
