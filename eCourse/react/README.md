# eCourse (React + Vite + Ollama)

Upload a PDF, get per-topic summaries, MCQs, short Q&A and YouTube/Instagram reel scripts. Runs a local Ollama model.

    npm install
    ollama pull qwen3.8:latest   # or any model; change it in the UI
    npm run dev

Open the printed URL (http://localhost:5173). Requests go through a Vite proxy (/ollama -> localhost:11434), so no OLLAMA_ORIGINS setting is needed.
Large PDFs: the text is split into N evenly spaced pieces (the "Topics" field) and one topic is generated per piece.
If Ollama reports "Compute error", lower Context to 2048 or tick "CPU only".
