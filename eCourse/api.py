from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import io
import os
from typing import Optional
from course import ExamContentGenerator

app = FastAPI(title="eCourse API")

# Enable CORS for the React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, replace with specific origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "eCourse API is running"}

@app.post("/generate")
async def generate_course(
    file: UploadFile = File(...),
    provider: str = Form("auto"),
    model: str = Form("qwen3.8:latest"),
    api_key: Optional[str] = Form(None)
):
    try:
        # Read PDF content
        pdf_bytes = await file.read()
        pdf_buffer = io.BytesIO(pdf_bytes)

        # Initialize the generator
        # We can use environment variables as defaults for API keys
        final_api_key = api_key or os.environ.get("GEMINI_API_KEY")

        generator = ExamContentGenerator(
            provider=provider,
            model_name=model,
            api_key=final_api_key
        )

        # Process PDF
        # We use default preferences for the API for now
        prefs = {"mcq": True, "qa": True, "yt": True, "ig": True}
        result = generator.process_pdf(
            pdf_buffer,
            preferences=prefs
        )

        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])

        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
