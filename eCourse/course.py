"""
Course Content Generation Engine for PDF Documents.
Generates:
1. Key Topic Summaries & Exam Cheat Sheets
2. Multiple Choice Questions (MCQs) with distractors, explanations, and difficulty ratings
3. Short Question and Answer (Q&A) pairs with model answers and scoring keywords
4. Short-form Video Scripts:
   - YouTube Shorts (educational breakdown, scene visual cues, voiceover, pinned comments)
   - Instagram Reels (viral hook, B-roll visuals, trending audio suggestion, captions, hashtags)
5. Exam Revision Checklist & Study Planner

Supports:
- Local Ollama (qwen3.8, gemma4, etc.)
- Google Gemini API (gemini-3.8-flash, etc.)
- Smart Heuristic/Rule-based Engine (instant offline zero-latency generation)
"""

import os
import sys
import re
import json
import argparse
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, asdict

# PDF Libraries
import PyPDF2
try:
    from pdfminer.high_level import extract_text as pdfminer_extract_text
    HAS_PDFMINER = True
except ImportError:
    HAS_PDFMINER = False


# ==========================================
# 1. PDF Extraction and Document Intelligence
# ==========================================

class PDFCourseParser:
    """Extracts, cleans, and structures text from PDF documents for course generation."""

    def __init__(self):
        self.raw_text: str = ""
        self.pages: List[str] = []
        self.metadata: Dict[str, Any] = {}

    def parse_pdf(self, file_path_or_buffer) -> Dict[str, Any]:
        """Parses a PDF file from a path or file-like buffer and extracts pages and text."""
        self.pages = []
        self.raw_text = ""
        self.metadata = {}

        try:
            if isinstance(file_path_or_buffer, str):
                file_obj = open(file_path_or_buffer, "rb")
                should_close = True
            else:
                file_obj = file_path_or_buffer
                should_close = False

            try:
                reader = PyPDF2.PdfReader(file_obj)
                num_pages = len(reader.pages)

                # Extract metadata if available
                if reader.metadata:
                    self.metadata = {
                        "title": reader.metadata.title or "",
                        "author": reader.metadata.author or "",
                        "subject": reader.metadata.subject or ""
                    }

                for idx, page in enumerate(reader.pages):
                    page_text = page.extract_text() or ""
                    # Normalize whitespace and hyphens
                    cleaned_page = self._clean_text(page_text)
                    self.pages.append(cleaned_page)

                self.raw_text = "\n\n".join(self.pages).strip()

            finally:
                if should_close:
                    file_obj.close()

        except Exception as e:
            # Fallback to pdfminer if file path is available
            if isinstance(file_path_or_buffer, str) and HAS_PDFMINER:
                try:
                    self.raw_text = self._clean_text(pdfminer_extract_text(file_path_or_buffer))
                    self.pages = [self.raw_text]
                except Exception as inner_e:
                    raise RuntimeError(f"Failed to parse PDF: {e} | pdfminer error: {inner_e}")
            else:
                raise RuntimeError(f"Failed to parse PDF: {e}")

        # Compute document statistics
        words = re.findall(r'\b\w+\b', self.raw_text)
        stats = {
            "total_pages": len(self.pages),
            "total_characters": len(self.raw_text),
            "total_words": len(words),
            "estimated_read_time_mins": max(1, round(len(words) / 200)),
            "metadata": self.metadata
        }
        return stats

    def _clean_text(self, text: str) -> str:
        """Normalizes extracted text, removes header/footer noise, fixes line wrapping."""
        # Replace non-breaking spaces and irregular whitespace
        text = text.replace('\xa0', ' ').replace('\r\n', '\n').replace('\r', '\n')
        # Fix hyphenated words broken across lines: e.g. "concur- \nrent" -> "concurrent"
        text = re.sub(r'(\w+)-\s*\n\s*(\w+)', r'\1\2', text)
        # Collapse multiple spaces
        text = re.sub(r'[ \t]+', ' ', text)
        # Collapse excessive newlines
        text = re.sub(r'\n{3,}', '\n\n', text)
        return text.strip()

    def extract_topics(self) -> List[Dict[str, Any]]:
        """Identifies key topics/sections from the text using layout heuristics and heading patterns."""
        if not self.raw_text:
            return []

        topics: List[Dict[str, Any]] = []
        raw_paragraphs = [p.strip() for p in self.raw_text.split('\n\n') if len(p.strip()) > 25]

        current_title = ""
        current_sentences: List[str] = []

        for p in raw_paragraphs:
            lines = [l.strip() for l in p.split('\n') if l.strip()]
            if not lines:
                continue

            first_line = lines[0]
            # Check if first line is a topic heading
            is_heading = bool(
                re.match(r'^(Topic\s*\d+|Chapter\s*\d+|\d+[\.:]\s+|[A-Z0-9\s,\-:]{4,55}:?$)', first_line) and
                len(first_line) <= 80
            )

            if is_heading:
                # Commit previous topic if exists
                if current_title and current_sentences:
                    topics.append({
                        "title": current_title,
                        "content": " ".join(current_sentences)
                    })
                    current_sentences = []
                current_title = re.sub(r'[:#*]', '', first_line).strip()
                # Content is remaining lines of this paragraph
                if len(lines) > 1:
                    current_sentences.append(" ".join(lines[1:]))
            else:
                if not current_title:
                    current_title = "Fundamental Concepts & Overview"
                current_sentences.append(" ".join(lines))

        if current_sentences:
            topics.append({
                "title": current_title or "Fundamental Concepts & Overview",
                "content": " ".join(current_sentences)
            })

        # If too few topics detected, split text into even chunks
        if len(topics) < 2 and len(self.raw_text) > 400:
            topics = []
            chunk_size = 2000
            for i in range(0, len(self.raw_text), chunk_size):
                chunk = self.raw_text[i:i + chunk_size].strip()
                if chunk:
                    first_sent = (re.split(r'[.\n]', chunk)[0] or f"Topic {len(topics)+1}").strip()
                    first_sent = (first_sent[:50] + "...") if len(first_sent) > 50 else first_sent
                    topics.append({
                        "title": first_sent if len(first_sent) > 8 else f"Core Module {len(topics)+1}",
                        "content": chunk
                    })

        return topics

    def split_by_pages(self) -> List[Dict[str, Any]]:
        """Splits the document by page for fine-grained context control."""
        return [
            {"title": f"Page {idx + 1}", "content": page}
            for idx, page in enumerate(self.pages)
            if page.strip()
        ]

    def split_by_chunks(self, chunk_size: int = 3000) -> List[Dict[str, Any]]:
        """Splits the document into fixed-size character chunks."""
        chunks = []
        for i in range(0, len(self.raw_text), chunk_size):
            text = self.raw_text[i : i + chunk_size].strip()
            if text:
                chunks.append({
                    "title": f"Segment {len(chunks) + 1}",
                    "content": text
                })
        return chunks


# ==========================================
# 2. Smart Heuristic Course Generator (Zero-Dependency)
# ==========================================

class SmartHeuristicCourseGenerator:
    """
    Deterministic NLP & pattern-based generator.
    Works offline with zero external dependencies, providing instant, reliable,
    and accurate course content extracted directly from the PDF text.
    """

    def generate_topic_summary(self, title: str, text: str) -> Dict[str, Any]:
        sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', text) if len(s.strip()) > 25]
        summary_sents = sentences[:3] if sentences else [text[:200]]

        # Extract potential rules, formulas, or key concepts
        key_concepts = []
        for s in sentences:
            if any(term in s.lower() for term in ["is defined", "means", "guarantees", "refers to", "ensures", "crucial", "essential", "primary"]):
                key_concepts.append(s)
            if len(key_concepts) >= 4:
                break
        if not key_concepts:
            key_concepts = sentences[1:5] if len(sentences) > 4 else sentences

        # Exam traps / pitfalls
        traps = [
            f"Confusing definitions in {title}: ensure exact technical keywords are memorized.",
            "Watch out for edge conditions and exception states frequently targeted in multiple-choice questions.",
            "Remember difference between necessary conditions versus sufficient conditions in exams."
        ]

        return {
            "title": title,
            "core_summary": " ".join(summary_sents),
            "key_takeaways": key_concepts[:4],
            "exam_pitfall": traps[0],
            "formula_or_rule": f"Key Principle: Master the fundamental trade-offs and definitions associated with {title}."
        }

    def generate_mcqs(self, topics: List[Dict[str, Any]], count_per_topic: Optional[int] = None) -> List[Dict[str, Any]]:
        mcqs = []
        qid = 1

        for topic in topics:
            text = topic["content"]
            title = topic["title"]
            sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', text) if len(s.strip()) > 35]

            for s in sentences:
                if count_per_topic and len([m for m in mcqs if m["topic"] == title]) >= count_per_topic:
                    break

                # Look for definitions: "X is Y", "X refers to Y", "X consists of Y"
                match = re.search(r'^(.*?)\s+(?:is|are|refers to|consists of|ensures|guarantees)\s+(.*)$', s, re.IGNORECASE)
                if match:
                    subject = match.group(1).strip()
                    predicate = match.group(2).strip()
                    if 3 < len(subject) < 50 and len(predicate) > 15:
                        correct_opt = predicate.rstrip('.')
                        # Construct realistic distractors
                        distractors = [
                            f"Prevents any external access without validation",
                            f"Allocates memory dynamically regardless of constraints",
                            f"Causes unrestricted concurrency without scheduling"
                        ]
                        options = [
                            correct_opt,
                            distractors[0],
                            distractors[1],
                            distractors[2]
                        ]

                        # Rotate options deterministically
                        rot = (qid % 4)
                        shuffled_opts = options[rot:] + options[:rot]
                        correct_idx = shuffled_opts.index(correct_opt)

                        mcqs.append({
                            "id": qid,
                            "topic": title,
                            "question": f"According to {title}, what is the primary role or definition of '{subject}'?",
                            "options": shuffled_opts,
                            "answer_index": correct_idx,
                            "correct_answer": correct_opt,
                            "explanation": f"Based on the course document: {s}",
                            "difficulty": "Medium" if qid % 2 == 0 else "Hard",
                            "bloom_level": "Conceptual" if qid % 2 == 0 else "Application"
                        })
                        qid += 1

            # Fallback if no matching regex
            if not any(m["topic"] == title for m in mcqs) and sentences:
                s = sentences[0]
                mcqs.append({
                    "id": qid,
                    "topic": title,
                    "question": f"Which statement accurately describes the core concept of {title}?",
                    "options": [
                        s[:120],
                        f"It completely disables all shared resource allocation",
                        f"It restricts scheduling solely to single-threaded sequential execution",
                        f"None of the standard criteria apply to this mechanism"
                    ],
                    "answer_index": 0,
                    "correct_answer": s[:120],
                    "explanation": f"Directly stated in the document: '{s}'",
                    "difficulty": "Easy",
                    "bloom_level": "Recall"
                })
                qid += 1

        return mcqs

    def generate_short_qa(self, topics: List[Dict[str, Any]], count_per_topic: Optional[int] = None) -> List[Dict[str, Any]]:
        qa_pairs = []
        qid = 1

        for topic in topics:
            title = topic["title"]
            text = topic["content"]
            sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', text) if len(s.strip()) > 30]

            for i in range(0, len(sentences), 2):
                if count_per_topic and len([q for q in qa_pairs if q["topic"] == title]) >= count_per_topic:
                    break
                s1 = sentences[i]
                s2 = sentences[i + 1] if i + 1 < len(sentences) else ""

                # Extract key noun phrases
                words = re.findall(r'\b[A-Za-z]{5,}\b', s1)
                keywords = list(dict.fromkeys(words[:4]))

                question_prompts = [
                    f"Explain the primary mechanism and significance of {title}.",
                    f"State the essential conditions and operational characteristics of {title}.",
                    f"What problem does {title} solve in practical systems?"
                ]
                q_text = question_prompts[(qid - 1) % len(question_prompts)]

                model_ans = f"{s1} {s2}".strip()
                qa_pairs.append({
                    "id": qid,
                    "topic": title,
                    "question": q_text,
                    "model_answer": model_ans,
                    "key_keywords": keywords,
                    "exam_tip": "In an exam, write at least 2 distinct bullet points and underline the key technical terms.",
                    "marks": 3 if qid % 2 != 0 else 5
                })
                qid += 1

        return qa_pairs

    def generate_youtube_shorts(self, topics: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        shorts = []
        for i, topic in enumerate(topics[:3]):
            title = topic["title"]
            text = topic["content"]
            sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', text) if len(s.strip()) > 20]
            s1 = sentences[0] if len(sentences) > 0 else f"Mastering {title}."
            s2 = sentences[1] if len(sentences) > 1 else f"Here is the most critical rule to know."
            s3 = sentences[2] if len(sentences) > 2 else f"Examiners frequently test this distinction."

            shorts.append({
                "topic": title,
                "title": f"Stop Failing {title}! 60-Second Exam Masterclass 🧠",
                "duration_target": "45-60 seconds",
                "target_platform": "YouTube Shorts (9:16 Vertical)",
                "hook": {
                    "visual": "Fast zoom-in on an exam question marked wrong with red ink, followed by bold red text: 'DO NOT MAKE THIS MISTAKE'",
                    "voiceover": f"If this {title} question shows up on your exam tomorrow, 80% of students will get it wrong. Here is how you score 100%."
                },
                "scenes": [
                    {
                        "timestamp": "0:04 - 0:15",
                        "visual_cue": "Animated diagram highlighting the core concept on chalkboard with neon arrows",
                        "on_screen_text": f"RULE #1: {title[:35]}",
                        "voiceover": f"First, remember this: {s1}"
                    },
                    {
                        "timestamp": "0:15 - 0:32",
                        "visual_cue": "Split screen comparison: Wrong Approach vs Right Approach (green checkmark)",
                        "on_screen_text": "EXAM TRAP ALERT ⚠️",
                        "voiceover": f"Here is the common trap examiners set: {s2}"
                    },
                    {
                        "timestamp": "0:32 - 0:48",
                        "visual_cue": "Step-by-step 3-bullet checklist appearing with satisfying sound effects",
                        "on_screen_text": "MUST-MEMORIZE CHECKLIST 📝",
                        "voiceover": f"To lock in full marks: {s3}"
                    },
                    {
                        "timestamp": "0:48 - 0:58",
                        "visual_cue": "End screen card with subscribe button and comment challenge question",
                        "on_screen_text": "TEST YOURSELF IN COMMENTS 👇",
                        "voiceover": "Can you explain this in your own words? Drop your answer in the comments and subscribe for daily exam hacks!"
                    }
                ],
                "pinned_comment": f"Drop your questions on {title} below! Full PDF course notes and flashcards available in the bio link 🚀",
                "seo_tags": ["#Shorts", "#ExamPrep", "#StudyTips", "#CollegeHacks", "#LearnIn60Seconds"]
            })
        return shorts

    def generate_instagram_reels(self, topics: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        reels = []
        for i, topic in enumerate(topics[:3]):
            title = topic["title"]
            text = topic["content"]
            sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', text) if len(s.strip()) > 20]
            s1 = sentences[0] if len(sentences) > 0 else f"{title} breakdown"
            s2 = sentences[1] if len(sentences) > 1 else f"Save this for revision."

            reels.append({
                "topic": title,
                "title": f"POV: You study {title} in 30 seconds ⚡️",
                "duration_target": "30-45 seconds",
                "target_platform": "Instagram Reels (9:16 Vertical)",
                "hook": {
                    "pattern_interrupt": "Quick cut of a student staring stressed at textbook, then tapping screen to reveal clean aesthetic digital notes",
                    "text_sticker": f"Stop scrolling if you have exams soon 🛑",
                    "voiceover": f"Here is how to master {title} without reading a 500-page book."
                },
                "scenes": [
                    {
                        "scene_number": 1,
                        "b_roll_visual": "Aesthetic top-down desk shot: iPad with color-coded note highlights, coffee mug, warm lofi lighting",
                        "text_overlay": f"THE 30-SEC SUMMARY ✨",
                        "voiceover": f"Point 1: {s1}"
                    },
                    {
                        "scene_number": 2,
                        "b_roll_visual": "Quick animated highlighter swipe across key formulas and definitions",
                        "text_overlay": "WHAT PROFESSORS ACTUALLY GRADE 👀",
                        "voiceover": f"Point 2: Remember that {s2}"
                    },
                    {
                        "scene_number": 3,
                        "b_roll_visual": "Tapping the 'Save' button animation on screen with glowing outline",
                        "text_overlay": "SAVE FOR REVISION 💾",
                        "voiceover": "Save this reel right now so you don't panic the night before the exam!"
                    }
                ],
                "trending_audio_vibe": "Chill Lofi Study Beats / Deep Focus Ambient Synth",
                "call_to_action": "Bookmark this reel and share with your study buddy! 📚✨",
                "caption": (
                    f"Exam week is coming! 📚 Here is everything you actually need to know about {title}.\n\n"
                    f"⚡️ Key Takeaway: {s1}\n"
                    f"💡 Pro Tip: Never mix up the core definitions during the test.\n\n"
                    f"👇 Tag a friend who is cramming tonight!\n\n"
                    f"#ExamPrep #StudyWithMe #StudyHacks #StudentLife #ReelsEdu #ExamTips #Flashcards #CollegeTips #GradStudent #LearnOnReels"
                ),
                "hashtags": [
                    "#ExamPrep", "#StudyGram", "#StudyWithMe", "#ReelsEdu", "#CollegeLife",
                    "#StudyHacks", "#ExamTips", "#LearnOnReels", "#ProductivityTips", "#StudyMotivation"
                ]
            })
        return reels


# ==========================================
# 3. LLM Course Generator (Ollama & Gemini)
# ==========================================

class LLMCourseGenerator:
    """Uses Ollama or Google Gemini to produce course materials."""

    def __init__(self, provider: str = "ollama", model_name: str = "qwen3.8:latest", api_key: Optional[str] = None):
        self.provider = provider.lower()
        self.model_name = model_name
        self.api_key = api_key or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        self.ollama_base_url = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
        self.heuristic_fallback = SmartHeuristicCourseGenerator()

    def generate_full_pack(self, topics: List[Dict[str, Any]], preferences: Dict[str, bool] = None, progress_callback: Optional[callable] = None, abort_check: Optional[callable] = None) -> Dict[str, Any]:
        """Generates all study components across topics iteratively to limit context."""
        if not topics:
            return {"topics": [], "mcqs": [], "short_qa": [], "youtube_shorts": [], "instagram_reels": []}

        if preferences is None:
            preferences = {"mcq": True, "qa": True, "yt": True, "ig": True}

        # Initialize aggregation containers
        aggregated = {
            "topics": [],
            "mcqs": [],
            "short_qa": [],
            "youtube_shorts": [],
            "instagram_reels": []
        }

        # Process each topic independently to avoid context overflow
        for i, topic in enumerate(topics):
            # Abort check
            if abort_check and abort_check():
                print(" Generation aborted by user.")
                break

            msg = f"Generating content for segment {i+1}/{len(topics)}: {topic['title']}..."
            if progress_callback:
                progress_callback(msg)
            else:
                print(msg)
            try:
                # We still generate the summary for every topic as it's the core of the course
                # But we only generate the other components if enabled in preferences

                # For the LLM, we can customize the prompt based on preferences to save tokens/time
                segment_pack = self._generate_for_segment(topic, preferences=preferences)

                # Merge results
                aggregated["topics"].extend(segment_pack.get("topics", []))
                aggregated["mcqs"].extend(segment_pack.get("mcqs", []))
                aggregated["short_qa"].extend(segment_pack.get("short_qa", []))
                aggregated["youtube_shorts"].extend(segment_pack.get("youtube_shorts", []))
                aggregated["instagram_reels"].extend(segment_pack.get("instagram_reels", []))
            except Exception as e:
                msg_err = f"Warning: Failed to generate for {topic['title']}: {e}. Using heuristic fallback."
                if progress_callback:
                    progress_callback(msg_err)
                else:
                    print(msg_err)
                fallback = self.heuristic_fallback.generate_topic_summary(topic["title"], topic["content"])
                aggregated["topics"].append(fallback)

        # Fix IDs for MCQs and Short QA after aggregation
        for idx, mcq in enumerate(aggregated["mcqs"], 1):
            mcq["id"] = idx
        for idx, qa in enumerate(aggregated["short_qa"], 1):
            qa["id"] = idx

        return aggregated

    def _generate_for_segment(self, topic: Dict[str, Any], preferences: Dict[str, bool] = None) -> Dict[str, Any]:
        """Generates course materials for a single segment of text."""
        if preferences is None:
            preferences = {"mcq": True, "qa": True, "yt": True, "ig": True}

        if self.provider == "gemini" and self.api_key:
            return self._generate_segment_with_gemini(topic, preferences=preferences)
        elif self.provider == "ollama":
            return self._generate_segment_with_ollama(topic, preferences=preferences)
        else:
            # Use heuristic for this specific topic
            summaries = [self.heuristic_fallback.generate_topic_summary(topic["title"], topic["content"])]

            mcqs = []
            if preferences.get("mcq"):
                mcqs = self.heuristic_fallback.generate_mcqs([topic])

            short_qa = []
            if preferences.get("qa"):
                short_qa = self.heuristic_fallback.generate_short_qa([topic])

            youtube_shorts = []
            if preferences.get("yt"):
                youtube_shorts = self.heuristic_fallback.generate_youtube_shorts([topic])

            instagram_reels = []
            if preferences.get("ig"):
                instagram_reels = self.heuristic_fallback.generate_instagram_reels([topic])

            return {
                "topics": summaries,
                "mcqs": mcqs,
                "short_qa": short_qa,
                "youtube_shorts": youtube_shorts,
                "instagram_reels": instagram_reels
            }

    def _generate_segment_with_ollama(self, topic: Dict[str, Any], preferences: Dict[str, bool] = None) -> Dict[str, Any]:
        """Calls local Ollama instance for a single topic."""
        if preferences is None:
            preferences = {"mcq": True, "qa": True, "yt": True, "ig": True}
        try:
            from langchain_ollama import OllamaLLM
            llm = OllamaLLM(model=self.model_name, base_url=self.ollama_base_url, temperature=0.3)

            content_text = f"### {topic['title']}\n{topic['content']}"
            prompt = self._get_base_prompt(content_text, preferences=preferences)

            res = llm.invoke(prompt)
            cleaned_json = re.sub(r'^```json\s*', '', res.strip(), flags=re.MULTILINE)
            cleaned_json = re.sub(r'```$', '', cleaned_json.strip())
            return json.loads(cleaned_json)
        except Exception as e:
            print(f" Ollama error: {e}")
            summaries = [self.heuristic_fallback.generate_topic_summary(topic["title"], topic["content"])]
            mcqs = self.heuristic_fallback.generate_mcqs([topic]) if preferences.get("mcq") else []
            short_qa = self.heuristic_fallback.generate_short_qa([topic]) if preferences.get("qa") else []
            youtube_shorts = self.heuristic_fallback.generate_youtube_shorts([topic]) if preferences.get("yt") else []
            instagram_reels = self.heuristic_fallback.generate_instagram_reels([topic]) if preferences.get("ig") else []

            return {
                "topics": summaries,
                "mcqs": mcqs,
                "short_qa": short_qa,
                "youtube_shorts": youtube_shorts,
                "instagram_reels": instagram_reels
            }

    def _get_base_prompt(self, text: str, preferences: Dict[str, bool] = None) -> str:
        """Returns the standardized prompt for generating course materials from text."""
        if preferences is None:
            preferences = {"mcq": True, "qa": True, "yt": True, "ig": True}

        # Build a dynamic list of what to generate to save tokens and time
        generation_tasks = []
        if preferences.get("mcq"):
            generation_tasks.append('MCQs (Multiple Choice Questions) with 4 options, a correct answer index, and a pedagogical explanation')
        if preferences.get("qa"):
            generation_tasks.append('Short Q&A pairs (3-5 marks) with model answers and scoring keywords')
        if preferences.get("yt"):
            generation_tasks.append('YouTube Shorts scripts (9:16 vertical) with hooks, scene-by-scene breakdowns, and pinned comments')
        if preferences.get("ig"):
            generation_tasks.append('Instagram Reels scripts with viral hooks, B-roll shot guides, and captions')

        tasks_str = " AND ".join(generation_tasks) if generation_tasks else "the core summary"

        return f"""You are an elite educational course creator and exam preparation specialist.
Analyze the following course material and return ONLY a valid, raw JSON object (no markdown wrapping, no explanation) with this exact schema:
{{
  "topics": [
    {{
      "title": "Topic title",
      "core_summary": "2-3 sentences concise summary",
      "key_takeaways": ["Takeaway 1", "Takeaway 2", "Takeaway 3"],
      "exam_pitfall": "Common trap students fall into",
      "formula_or_rule": "Key mnemonic or principle"
    }}
  ],
  "mcqs": [
    {{
      "id": 1,
      "topic": "Topic Name",
      "question": "Clear exam question testing understanding",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answer_index": 0,
      "correct_answer": "Option A",
      "explanation": "Why this answer is correct and others are wrong",
      "difficulty": "Medium",
      "bloom_level": "Conceptual"
    }}
  ],
  "short_qa": [
    {{
      "id": 1,
      "topic": "Topic Name",
      "question": "High-yield short question for a 3-5 mark exam",
      "model_answer": "Model exam answer (2-3 sentences)",
      "key_keywords": ["keyword1", "keyword2"],
      "exam_tip": "How to structure answer for full marks",
      "marks": 3
    }}
  ],
  "youtube_shorts": [
    {{
      "topic": "Topic Name",
      "title": "High-CTR Catchy Educational Title",
      "duration_target": "45-60 seconds",
      "target_platform": "YouTube Shorts (9:16 Vertical)",
      "hook": {{
        "visual": "Action/visual cue for 0-3s",
        "voiceover": "Curiosity-sparking opening line"
      }},
      "scenes": [
        {{
          "timestamp": "0:04 - 0:15",
          "visual_cue": "What to show on screen",
          "on_screen_text": "Text overlay",
          "voiceover": "Spoken line"
        }}
      ],
      "pinned_comment": "Discussion prompt for viewers",
      "seo_tags": ["#Shorts", "#ExamPrep"]
    }}
  ],
  "instagram_reels": [
    {{
      "topic": "Topic Name",
      "title": "Viral Instagram Reel Hook",
      "duration_target": "30-45 seconds",
      "target_platform": "Instagram Reels (9:16 Vertical)",
      "hook": {{
        "pattern_interrupt": "Visual pattern interrupt description",
        "text_sticker": "Text sticker on screen",
        "voiceover": "Opening audio line"
      }},
      "scenes": [
        {{
          "scene_number": 1,
          "b_roll_visual": "Aesthetic B-roll visual description",
          "text_overlay": "Text sticker",
          "voiceover": "Spoken line"
        }}
      ],
      "trending_audio_vibe": "Music suggestion",
      "call_to_action": "Save and share CTA",
      "caption": "Full Instagram caption ready to paste",
      "hashtags": ["#ExamPrep", "#StudyTips"]
    }}
  ]
}}

TASK: Generate the core summary AND {tasks_str} based strictly on the material provided.
IMPORTANT: Generate as many high-quality MCQs and Short Q&A pairs as the provided material supports. Do not limit the number of questions; ensure full coverage of every technical concept mentioned in the text.

STUDY MATERIAL:
{text}
"""

    def _generate_segment_with_gemini(self, topic: Dict[str, Any], preferences: Dict[str, bool] = None) -> Dict[str, Any]:
        """Calls Google Gemini API for a single topic."""
        if preferences is None:
            preferences = {"mcq": True, "qa": True, "yt": True, "ig": True}
        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=self.api_key)
            content_text = f"### {topic['title']}\n{topic['content']}"
            prompt = self._get_base_prompt(content_text, preferences=preferences)

            model_to_use = self.model_name if "gemini" in self.model_name else "gemini-3.8-flash"
            response = client.models.generate_content(
                model=model_to_use,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.3
                )
            )
            return json.loads(response.text)
        except Exception as e:
            print(f" Gemini error: {e}")
            summaries = [self.heuristic_fallback.generate_topic_summary(topic["title"], topic["content"])]
            mcqs = self.heuristic_fallback.generate_mcqs([topic]) if preferences.get("mcq") else []
            short_qa = self.heuristic_fallback.generate_short_qa([topic]) if preferences.get("qa") else []
            youtube_shorts = self.heuristic_fallback.generate_youtube_shorts([topic]) if preferences.get("yt") else []
            instagram_reels = self.heuristic_fallback.generate_instagram_reels([topic]) if preferences.get("ig") else []

            return {
                "topics": summaries,
                "mcqs": mcqs,
                "short_qa": short_qa,
                "youtube_shorts": youtube_shorts,
                "instagram_reels": instagram_reels
            }


# ==========================================
# 4. Exam Content Orchestrator & Exporter
# ==========================================

class ExamContentGenerator:
    """Coordinates parsing, generation across modules, and multi-format exports."""

    def __init__(self, provider: str = "auto", model_name: str = "qwen3.8:latest", api_key: Optional[str] = None):
        self.parser = PDFCourseParser()
        self.provider = provider
        self.model_name = model_name
        self.api_key = api_key
        self.generator = LLMCourseGenerator(provider=provider, model_name=model_name, api_key=api_key)

    def process_pdf(self, file_path_or_buffer, progress_callback: Optional[callable] = None, preferences: Dict[str, bool] = None, abort_check: Optional[callable] = None) -> Dict[str, Any]:
        """End-to-end pipeline: parse PDF -> identify topics -> generate all materials."""
        # 1. Parse PDF
        stats = self.parser.parse_pdf(file_path_or_buffer)
        if not self.parser.raw_text:
            return {"error": "Failed to parse PDF: No text could be extracted."}

        # 2. Extract topics (now processes whole document)
        topics = self.parser.extract_topics()
        if not topics:
            return {"error": "No coherent topics could be extracted from the document."}

        # 3. Generate content pack iteratively
        pack = self.generator.generate_full_pack(
            topics,
            preferences=preferences,
            progress_callback=progress_callback,
            abort_check=abort_check
        )

        # 4. Generate Study Checklist
        checklist = [
            f"Review key definitions for {t['title']}" for t in topics
        ] + [
            "Complete all MCQs under timed test conditions (2 minutes per question)",
            "Practice writing out short Q&A answers without referring to notes",
            "Review visual cues and memory hooks from Reels scripts for quick recall",
            "Identify weak areas and re-test 24 hours before final exam"
        ]

        result = {
            "document_stats": stats,
            "topics": pack.get("topics", []),
            "mcqs": pack.get("mcqs", []),
            "short_qa": pack.get("short_qa", []),
            "youtube_shorts": pack.get("youtube_shorts", []),
            "instagram_reels": pack.get("instagram_reels", []),
            "revision_checklist": checklist
        }
        return result

    def export_all(self, result: Dict[str, Any], output_dir: str = "output") -> Dict[str, str]:
        """Saves JSON and Markdown study guides to the output directory."""
        os.makedirs(output_dir, exist_ok=True)
        file_map = {}

        # 1. Save MCQs
        mcq_path = os.path.join(output_dir, "mcqs.json")
        with open(mcq_path, "w", encoding="utf-8") as f:
            json.dump(result.get("mcqs", []), f, indent=2, ensure_ascii=False)
        file_map["mcqs"] = mcq_path

        # 2. Save Short Q&A
        qa_path = os.path.join(output_dir, "short_qa.json")
        with open(qa_path, "w", encoding="utf-8") as f:
            json.dump(result.get("short_qa", []), f, indent=2, ensure_ascii=False)
        file_map["short_qa"] = qa_path

        # 3. Save Short Reels (combined YouTube + Instagram)
        reels_data = {
            "youtube_shorts": result.get("youtube_shorts", []),
            "instagram_reels": result.get("instagram_reels", [])
        }
        reels_path = os.path.join(output_dir, "short_reels.json")
        with open(reels_path, "w", encoding="utf-8") as f:
            json.dump(reels_data, f, indent=2, ensure_ascii=False)
        file_map["short_reels"] = reels_path

        # 4. Save Markdown Study Guide
        md_content = self.generate_markdown_guide(result)
        md_path = os.path.join(output_dir, "study_guide.md")
        with open(md_path, "w", encoding="utf-8") as f:
            f.write(md_content)
        file_map["study_guide"] = md_path

        # 5. Save Summary Report
        summary_report = {
            "total_pages": result["document_stats"]["total_pages"],
            "total_words": result["document_stats"]["total_words"],
            "topics_count": len(result.get("topics", [])),
            "mcq_count": len(result.get("mcqs", [])),
            "qa_count": len(result.get("short_qa", [])),
            "youtube_shorts_count": len(result.get("youtube_shorts", [])),
            "instagram_reels_count": len(result.get("instagram_reels", []))
        }
        summary_path = os.path.join(output_dir, "summary_report.json")
        with open(summary_path, "w", encoding="utf-8") as f:
            json.dump(summary_report, f, indent=2)
        file_map["summary_report"] = summary_path

        return file_map

    def generate_markdown_guide(self, data: Dict[str, Any]) -> str:
        """Generates a complete student exam revision guide in Markdown."""
        lines = [
            "# 🎓 Ultimate Exam Preparation Guide & Study Pack",
            f"**Generated by eCourse Engine** | Pages: {data['document_stats']['total_pages']} | Words: {data['document_stats']['total_words']}",
            "",
            "---",
            "## 📌 Table of Contents",
            "1. [Core Topics & Cheat Sheets](#core-topics--cheat-sheets)",
            "2. [Multiple Choice Practice Questions (MCQs)](#multiple-choice-practice-questions-mcqs)",
            "3. [High-Yield Short Questions & Answers](#high-yield-short-questions--answers)",
            "4. [Social Video Scripts (Shorts & Reels)](#social-video-scripts)",
            "5. [Final Revision Checklist](#final-revision-checklist)",
            "",
            "---",
            "## 📖 Core Topics & Cheat Sheets",
            ""
        ]

        for idx, t in enumerate(data.get("topics", []), 1):
            lines.append(f"### Topic {idx}: {t.get('title', 'Topic')}")
            lines.append(f"**Summary:** {t.get('core_summary', '')}\n")
            if t.get("key_takeaways"):
                lines.append("**Key Takeaways:**")
                for item in t["key_takeaways"]:
                    lines.append(f"- {item}")
                lines.append("")
            if t.get("formula_or_rule"):
                lines.append(f"> 💡 **Exam Rule / Mnemonic:** {t['formula_or_rule']}\n")
            if t.get("exam_pitfall"):
                lines.append(f"> ⚠️ **Common Exam Trap:** {t['exam_pitfall']}\n")

        lines.extend([
            "---",
            "## 🎯 Multiple Choice Practice Questions (MCQs)",
            ""
        ])

        for idx, m in enumerate(data.get("mcqs", []), 1):
            lines.append(f"#### Q{idx}. {m.get('question', '')}")
            lines.append(f"*Topic: {m.get('topic', '')} | Difficulty: {m.get('difficulty', 'Medium')} | Bloom: {m.get('bloom_level', 'Conceptual')}*")
            for j, opt in enumerate(m.get("options", [])):
                lines.append(f"- **{'ABCD'[j]}**: {opt}")
            lines.append(f"\n<details><summary><b>Reveal Correct Answer & Explanation</b></summary>")
            lines.append(f"\n**Correct Answer:** Option {'ABCD'[m.get('answer_index', 0)]} - {m.get('correct_answer', '')}")
            lines.append(f"**Explanation:** {m.get('explanation', '')}\n</details>\n")

        lines.extend([
            "---",
            "## 💡 High-Yield Short Questions & Answers",
            ""
        ])

        for idx, q in enumerate(data.get("short_qa", []), 1):
            lines.append(f"#### Q{idx} ({q.get('marks', 3)} Marks): {q.get('question', '')}")
            lines.append(f"**Model Answer:**\n{q.get('model_answer', '')}\n")
            if q.get("key_keywords"):
                lines.append(f"**Must-Include Keywords:** `{', '.join(q['key_keywords'])}`")
            if q.get("exam_tip"):
                lines.append(f"💡 *Tip:* {q['exam_tip']}\n")

        lines.extend([
            "---",
            "## 📱 Social Video Scripts (Shorts & Reels)",
            ""
        ])

        if data.get("youtube_shorts"):
            lines.append("### 🎬 YouTube Shorts")
            for idx, s in enumerate(data["youtube_shorts"], 1):
                lines.append(f"#### Short {idx}: {s.get('title', '')}")
                lines.append(f"**Duration:** {s.get('duration_target', '45-60s')}")
                lines.append(f"**Hook Visual:** {s.get('hook', {}).get('visual', '')}")
                lines.append(f"**Hook Voiceover:** \"{s.get('hook', {}).get('voiceover', '')}\"\n")
                lines.append("| Timestamp | Visual Cue | On-Screen Text | Voiceover |")
                lines.append("|---|---|---|---|")
                for sc in s.get("scenes", []):
                    lines.append(f"| {sc.get('timestamp', '')} | {sc.get('visual_cue', '')} | {sc.get('on_screen_text', '')} | {sc.get('voiceover', '')} |")
                lines.append(f"\n**Pinned Comment:** {s.get('pinned_comment', '')}\n")

        if data.get("instagram_reels"):
            lines.append("### 📸 Instagram Reels")
            for idx, r in enumerate(data["instagram_reels"], 1):
                lines.append(f"#### Reel {idx}: {r.get('title', '')}")
                lines.append(f"**Trending Sound Vibe:** {r.get('trending_audio_vibe', '')}")
                lines.append(f"**Hook Text Sticker:** `{r.get('hook', {}).get('text_sticker', '')}`\n")
                lines.append("```text")
                lines.append(r.get("caption", ""))
                lines.append("```\n")

        lines.extend([
            "---",
            "## 📋 Final Revision Checklist",
            ""
        ])
        for c in data.get("revision_checklist", []):
            lines.append(f"- [ ] {c}")

        lines.append("\n---\n*Best of luck with your exams!* 🚀\n")
        return "\n".join(lines)


# ==========================================
# 5. CLI Interface
# ==========================================

def main():
    parser = argparse.ArgumentParser(description="eCourse Content Generator from PDF documents.")
    parser.add_argument("pdf_path", nargs="?", default="sample_operating_systems.pdf", help="Path to input PDF file")
    parser.add_argument("--provider", choices=["auto", "ollama", "gemini", "heuristic"], default="auto", help="AI Provider")
    parser.add_argument("--model", default="qwen3.8:latest", help="Ollama or Gemini model name")
    parser.add_argument("--output-dir", default="output", help="Output directory to save files")

    args = parser.parse_args()

    if not os.path.exists(args.pdf_path):
        print(f"Error: PDF file '{args.pdf_path}' not found.")
        print("Tip: Run `python sample_generator.py` to create a sample test PDF!")
        sys.exit(1)

    print(f"Processing '{args.pdf_path}' using provider '{args.provider}'...")
    generator = ExamContentGenerator(provider=args.provider, model_name=args.model)
    result = generator.process_pdf(args.pdf_path)

    if "error" in result:
        print(f"Error: {result['error']}")
        sys.exit(1)

    print(f"Successfully parsed {result['document_stats']['total_pages']} pages ({result['document_stats']['total_words']} words).")
    print(f"Generated:")
    print(f" - {len(result.get('topics', []))} Key Topics")
    print(f" - {len(result.get('mcqs', []))} Practice MCQs")
    print(f" - {len(result.get('short_qa', []))} High-Yield Short Q&As")
    print(f" - {len(result.get('youtube_shorts', []))} YouTube Shorts scripts")
    print(f" - {len(result.get('instagram_reels', []))} Instagram Reels scripts")

    file_map = generator.export_all(result, output_dir=args.output_dir)
    print(f"\nAll files successfully saved to '{args.output_dir}':")
    for k, path in file_map.items():
        print(f" - {k}: {path}")

if __name__ == "__main__":
    main()
