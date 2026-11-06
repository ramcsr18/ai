# 🎓 eCourse: PDF-to-Course & Social Learning Studio

An AI-powered application that parses any PDF document (textbooks, lecture notes, syllabi) and automatically generates comprehensive online course materials, exam-preparation modules, and short-form video scripts for social media.

---

## 🌟 Key Features

1. **📄 PDF Parsing & Document Intelligence**
   - Extracts and structures text across multi-page academic PDFs.
   - Cleans formatting, resolves hyphenated breaks, and extracts topic boundaries.
   - Detects document stats: pages, words, reading time, and chapter/topic hierarchy.

2. **🎯 Interactive MCQ Quiz (Exam Practice)**
   - Rigorous Multiple Choice Questions testing Recall, Conceptual understanding, and Application.
   - 4 distinct choices with plausible distractors.
   - Interactive Quiz Mode: Students can answer questions on the web page, get instant feedback, score percentages, and detailed pedagogical explanations.

3. **💡 High-Yield Short Q&A & Flashcards**
   - High-impact 2-mark to 5-mark examination questions.
   - Concise model answers designed for full marks.
   - Essential examiner scoring keywords and memory tips.
   - Dual-view mode: Expandable List or Interactive Flip Flashcards.

4. **🎬 YouTube Shorts Studio (9:16 Vertical Video)**
   - Paced for 45-60 second educational retention.
   - 0-3 second curiosity hook (visual + voiceover).
   - Scene-by-scene script table with timestamps, visual cues, on-screen text, and spoken voiceover.
   - Pinned comment discussion prompt, SEO tags, and 1-click script export.

5. **📸 Instagram Reels Studio**
   - Crafted for 30-45 second viral reach.
   - High-retention pattern interrupt hooks.
   - Aesthetic B-roll shot guide (lighting, desk shots, highlighter swipes).
   - Trending audio vibe recommendations.
   - Ready-to-paste Instagram captions with 12-15 targeted hashtags.

6. **📋 3-Day Exam Revision Planner**
   - Day 1: Concept Mastery & Core Cheat Sheet
   - Day 2: High-Yield Short Q&A & Flashcards
   - Day 3: Timed MCQ Practice & Final Review
   - Interactive revision checklist.

7. **💾 Multi-Format Export Center**
   - Export full course bundle as `JSON` (`output/mcqs.json`, `output/short_qa.json`, `output/short_reels.json`).
   - Export student revision notes to `Markdown` (`output/study_guide.md`).
   - Summary report with document metrics (`output/summary_report.json`).

---

## 🤖 Supported AI Providers

The application supports three flexible AI engines:
1. **Local Ollama** (default: `qwen3.8:latest`, `qwen3-coder:latest`, `gemma4:latest`, etc.) - runs 100% locally and privately.
2. **Google Gemini** (`gemini-3.8-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-pro-preview`) - cloud-based speed and deep reasoning.
3. **Built-in Smart Heuristic Engine** - zero-latency, works 100% offline without needing an active LLM server or GPU.

---

## 🚀 Quick Start

### Option 1: Streamlit Interactive Web Application (Recommended)

Run the full interactive dashboard:

```bash
# Activate your virtual environment
source bin/activate

# Launch Streamlit
streamlit run app.py
```

Then open `http://localhost:8501` in your browser.
*Tip: Click the sidebar button **"🚀 Load Sample Exam PDF (Operating Systems)"** to test immediately without having to upload a file!*

---

### Option 2: Command-Line Interface (CLI)

Process any PDF directly from your terminal and save all course files to `output/`:

```bash
# Using auto or heuristic engine
python course.py sample_operating_systems.pdf --output-dir output

# Using local Ollama with a specific model
python course.py path/to/document.pdf --provider ollama --model qwen3.8:latest

# Using Google Gemini API
python course.py path/to/document.pdf --provider gemini --model gemini-3.8-flash
```

Generated files will be saved in `output/`:
- `output/mcqs.json`
- `output/short_qa.json`
- `output/short_reels.json`
- `output/study_guide.md`
- `output/summary_report.json`

---

### Option 3: React + Vite Web Frontend

If you prefer a React frontend:

```bash
cd react
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## 📁 Project Structure

```
eCourse/
├── app.py                     # Main interactive Streamlit web application
├── course.py                  # Core parsing, generation engine & CLI
├── google.py                  # Streamlit app dedicated to Google Gemini
├── sample_generator.py        # Utility to generate test exam PDFs
├── sample_operating_systems.pdf # Sample 3-page test PDF
├── requirements.txt           # Python dependencies
├── output/                    # Output directory for exported JSON and Markdown
│   ├── mcqs.json
│   ├── short_qa.json
│   ├── short_reels.json
│   ├── study_guide.md
│   └── summary_report.json
└── react/                     # Modern React + Vite web application
    ├── src/
    │   ├── App.jsx            # Interactive quiz, reels studio & tabs
    │   ├── api.js             # PDF text extraction and API router
    │   └── styles.css         # Clean UI styling
    ├── package.json
    └── vite.config.js
```
