# 🤖 Project Agents: eCourse

This document outlines the specialized AI agents and engines that power the eCourse PDF-to-Course pipeline. These agents are designed to transform raw academic PDF content into structured, high-yield educational materials and viral social media scripts.

---

## 🛠️ Core Agents

### 1. Document Intelligence Agent
**Implementation:** `PDFCourseParser`
- **Role:** Text Extraction & Structuring Specialist.
- **Responsibilities:**
  - Extracts raw text and metadata from multi-page academic PDFs.
  - Normalizes content by fixing hyphenated line breaks and removing header/footer noise.
  - Uses layout heuristics to identify topic boundaries and chapter hierarchies.
  - Computes document statistics (reading time, word count, page counts).

### 2. Heuristic Content Agent
**Implementation:** `SmartHeuristicCourseGenerator`
- **Role:** Deterministic Offline Generator.
- **Responsibilities:**
  - Provides instant, zero-latency generation without requiring an LLM server.
  - Uses NLP patterns to extract key definitions and generate recall-based MCQs.
  - Implements deterministic rotation for MCQ options to ensure variety.
  - Generates structured Short Q&A pairs based on sentence-pair heuristics.

### 3. AI Course Specialist Agent
**Implementation:** `LLMCourseGenerator`
- **Role:** Elite Educational Content Creator.
- **Persona:** "Elite educational course creator and exam preparation specialist."
- **Responsibilities:**
  - Leverages state-of-the-art LLMs (Google Gemini, Local Ollama) for deep pedagogical reasoning.
  - Generates high-yield summaries, conceptual MCQs, and "exam trap" warnings.
  - Crafts high-retention social scripts for YouTube Shorts and Instagram Reels, including:
    - Curiosity-driven hooks.
    - Scene-by-scene visual and voiceover breakdowns.
    - Trending audio suggestions and viral captions.

### 4. Course Orchestrator Agent
**Implementation:** `ExamContentGenerator`
- **Role:** Pipeline Coordinator.
- **Responsibilities:**
  - Manages the end-to-end workflow: `Parse PDF` $\rightarrow$ `Identify Topics` $\rightarrow$ `Generate Content` $\rightarrow$ `Export`.
  - Iteratively processes document segments to avoid LLM context overflow.
  - Coordinates the fallback mechanism (switching to the Heuristic Agent if LLM generation fails).
  - Handles multi-format exports (JSON, Markdown) for various study components.

---

## 🔄 Agent Workflow

1. **Input:** The **Course Orchestrator** receives a PDF.
2. **Analysis:** The **Document Intelligence Agent** breaks the PDF into structured topics.
3. **Generation:** Depending on the user's provider choice:
   - The **AI Course Specialist** generates high-fidelity content.
   - OR the **Heuristic Content Agent** provides instant offline results.
4. **Aggregation:** The **Course Orchestrator** collects all segments and formats them.
5. **Export:** The system generates the final `study_guide.md` and JSON data packs.
