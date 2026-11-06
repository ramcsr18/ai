import os
import json
import streamlit as st
from typing import Dict, Any, List

# Import our course generation engine
from course import ExamContentGenerator, PDFCourseParser
from sample_generator import create_sample_study_pdf

# ==========================================
# Page Configuration & Styling
# ==========================================
st.set_page_config(
    page_title="AI Course & Exam Content Studio",
    page_icon="🎓",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom Styling for modern clean aesthetics
st.markdown("""
<style>
    /* Metric Card Styling */
    .metric-card {
        background: linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%);
        border: 1px solid rgba(128,128,128,0.2);
        border-radius: 12px;
        padding: 18px;
        margin-bottom: 12px;
    }
    .topic-badge {
        background: #2563eb;
        color: white;
        padding: 3px 10px;
        border-radius: 12px;
        font-size: 0.8rem;
        font-weight: 600;
        display: inline-block;
        margin-right: 6px;
    }
    .difficulty-badge {
        padding: 3px 8px;
        border-radius: 8px;
        font-size: 0.75rem;
        font-weight: 600;
        display: inline-block;
    }
    .diff-easy { background: #16a34a; color: white; }
    .diff-medium { background: #ca8a04; color: white; }
    .diff-hard { background: #dc2626; color: white; }
    
    /* Quiz card */
    .quiz-box {
        background: rgba(128,128,128,0.05);
        border: 1px solid rgba(128,128,128,0.25);
        border-radius: 10px;
        padding: 16px;
        margin-bottom: 16px;
    }
    .quiz-correct {
        border-left: 5px solid #16a34a;
        background: rgba(22, 163, 74, 0.08);
    }
    .quiz-incorrect {
        border-left: 5px solid #dc2626;
        background: rgba(220, 38, 38, 0.08);
    }
    
    /* Reels mockup container */
    .reel-container {
        border: 2px dashed #6366f1;
        border-radius: 16px;
        padding: 20px;
        background: rgba(99, 102, 241, 0.03);
        margin-bottom: 20px;
    }
</style>
""", unsafe_allow_html=True)


# ==========================================
# Session State Initialization
# ==========================================
if "course_data" not in st.session_state:
    st.session_state.course_data = None
if "document_stats" not in st.session_state:
    st.session_state.document_stats = None
if "quiz_answers" not in st.session_state:
    st.session_state.quiz_answers = {}
if "quiz_submitted" not in st.session_state:
    st.session_state.quiz_submitted = False
if "flashcard_idx" not in st.session_state:
    st.session_state.flashcard_idx = 0
if "mastered_cards" not in st.session_state:
    st.session_state.mastered_cards = set()


# ==========================================
# Sidebar Configuration
# ==========================================
with st.sidebar:
    st.title("⚙️ Course Generator Settings")
    
    provider = st.selectbox(
        "🤖 AI Engine Provider",
        ["Local Ollama", "Google Gemini", "Fast Local Heuristic (Offline)"],
        index=0,
        help="Select which AI engine to power the generation. Local Heuristic runs immediately without server requirements."
    )
    
    model_name = "qwen3.8:latest"
    gemini_key = ""
    
    if provider == "Local Ollama":
        model_name = st.text_input("Ollama Model Name", value="qwen3.8:latest", help="Run `ollama list` to view local models")
    elif provider == "Google Gemini":
        model_name = st.selectbox("Gemini Model", ["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.1-pro-preview"], index=0)
        gemini_key = st.text_input("Google API Key", type="password", value=os.environ.get("GEMINI_API_KEY", ""), help="Google AI Studio API key")
    
    st.divider()
    st.subheader("📚 Content Customization")

    st.markdown("**Select content to generate:**")
    gen_mcq = st.checkbox("🎯 Multiple Choice Questions", value=True)
    gen_qa = st.checkbox("💡 Short Q&A", value=False)
    gen_yt = st.checkbox("🎬 YouTube Shorts", value=False)
    gen_ig = st.checkbox("📸 Instagram Reels", value=False)

    st.info("The engine automatically generates all possible questions for the selected formats to ensure maximum coverage.")
    
    st.divider()
    st.subheader("💡 Fast Testing Demo")
    if st.button("🚀 Load Sample Exam PDF (Operating Systems)", use_container_width=True):
        sample_path = "sample_operating_systems.pdf"
        if not os.path.exists(sample_path):
            sample_path = create_sample_study_pdf(sample_path)
        with open(sample_path, "rb") as f:
            st.session_state.uploaded_pdf_bytes = f.read()
            st.session_state.uploaded_pdf_name = "sample_operating_systems.pdf"
        st.success("Sample exam PDF loaded into memory!")
        st.rerun()

    st.divider()
    if st.button("🛑 Stop Generation", type="secondary", use_container_width=True):
        st.session_state.abort_generation = True
        st.warning("Stopping generation... (will take effect after current segment)")


# ==========================================
# Main Header
# ==========================================
st.title("🎓 PDF to eCourse & Social Learning Studio")
st.markdown(
    "Transform academic PDFs into interactive **Exam Study Guides**, **MCQ Quizzes**, "
    "**High-Yield Short Q&As**, and viral **YouTube Shorts & Instagram Reels**."
)

# PDF Uploader
col_up, col_btn = st.columns([3, 1])
with col_up:
    uploaded_file = st.file_uploader(
        "Upload Course Material or Exam Syllabus (PDF)",
        type=["pdf"],
        help="Upload lecture notes, textbook chapters, or revision guides."
    )

pdf_data = None
pdf_name = ""

if uploaded_file is not None:
    pdf_data = uploaded_file.read()
    pdf_name = uploaded_file.name
elif "uploaded_pdf_bytes" in st.session_state:
    pdf_data = st.session_state.uploaded_pdf_bytes
    pdf_name = st.session_state.get("uploaded_pdf_name", "sample_document.pdf")

# Process PDF Trigger
if pdf_data:
    st.info(f"📄 Loaded Document: **{pdf_name}** ({len(pdf_data) / 1024:.1f} KB)")
    
    if st.button("⚡ Generate Complete Online Course & Social Content Pack", type="primary", use_container_width=True):
        # Reset abort state
        st.session_state.abort_generation = False

        with st.status("🚀 Generating course curriculum iteratively...", expanded=True) as status:
            provider_arg = "heuristic" if "Heuristic" in provider else ("gemini" if "Gemini" in provider else "ollama")

            import io
            generator = ExamContentGenerator(
                provider=provider_arg,
                model_name=model_name,
                api_key=gemini_key
            )

            # Define a callback for Streamlit progress updates
            def st_progress(msg):
                st.write(msg)

            # Define an abort check
            def check_abort():
                return st.session_state.get("abort_generation", False)

            # Prepare preferences from checkboxes
            prefs = {
                "mcq": gen_mcq,
                "qa": gen_qa,
                "yt": gen_yt,
                "ig": gen_ig
            }

            result = generator.process_pdf(
                io.BytesIO(pdf_data),
                progress_callback=st_progress,
                preferences=prefs,
                abort_check=check_abort
            )

            if "error" in result:
                st.error(result["error"])
            elif st.session_state.get("abort_generation", False):
                st.warning("Generation was aborted by the user.")
            else:
                st.session_state.course_data = result
                st.session_state.document_stats = result["document_stats"]
                st.session_state.quiz_answers = {}
                st.session_state.quiz_submitted = False
                st.session_state.flashcard_idx = 0
                st.session_state.mastered_cards = set()
                # Save exports automatically
                generator.export_all(result, output_dir="output")
                status.update(label="✅ Course pack generated successfully!", state="complete", expanded=False)


# ==========================================
# Display Generated Course Content
# ==========================================
course = st.session_state.course_data
if course:
    stats = st.session_state.document_stats
    
    # Quick metrics header
    st.divider()
    m1, m2, m3, m4, m5 = st.columns(5)
    m1.metric("Pages Analyzed", stats.get("total_pages", 0))
    m2.metric("Total Words", f"{stats.get('total_words', 0):,}")
    m3.metric("Key Topics", len(course.get("topics", [])))
    m4.metric("MCQs", len(course.get("mcqs", [])))
    m5.metric("Short Q&A Pairs", len(course.get("short_qa", [])))

    # Main Tabs
    tab_study, tab_mcq, tab_qa, tab_yt, tab_ig, tab_planner, tab_export = st.tabs([
        "📚 Topics & Cheat Sheets",
        "🎯 Interactive MCQ Quiz",
        "💡 High-Yield Short Q&A",
        "🎬 YouTube Shorts Studio",
        "📸 Instagram Reels Studio",
        "📋 Exam Revision Planner",
        "💾 Export & Download"
    ])

    # ----------------------------------------------------
    # TAB 1: Topics & Cheat Sheets
    # ----------------------------------------------------
    with tab_study:
        st.subheader("📖 Key Topics & High-Yield Summary Cheat Sheet")
        topics = course.get("topics", [])
        if not topics:
            st.info("No topics available.")
        for idx, t in enumerate(topics, 1):
            with st.expander(f"📌 Topic {idx}: {t.get('title', 'Topic')}", expanded=True):
                st.markdown(f"**Core Summary:**\n{t.get('core_summary', '')}")
                
                col_a, col_b = st.columns(2)
                with col_a:
                    st.markdown("**Key Takeaways:**")
                    for k in t.get("key_takeaways", []):
                        st.markdown(f"- ✅ {k}")
                with col_b:
                    if t.get("formula_or_rule"):
                        st.info(f"💡 **Key Rule / Mnemonic:**\n{t['formula_or_rule']}")
                    if t.get("exam_pitfall"):
                        st.warning(f"⚠️ **Exam Trap to Avoid:**\n{t['exam_pitfall']}")

    # ----------------------------------------------------
    # TAB 2: Interactive MCQ Quiz
    # ----------------------------------------------------
    with tab_mcq:
        st.subheader("🎯 Test Your Knowledge: Interactive MCQ Practice")
        st.caption("Select your answers and click 'Submit Quiz' at the bottom to calculate your exam score with in-depth feedback.")
        
        mcqs = course.get("mcqs", [])
        if not mcqs:
            st.info("No MCQs generated.")
        
        for q in mcqs:
            qid = q.get("id", 1)
            diff = q.get("difficulty", "Medium")
            diff_class = "diff-easy" if diff == "Easy" else ("diff-medium" if diff == "Medium" else "diff-hard")
            bloom = q.get("bloom_level", "Recall")
            
            st.markdown(f"""
            <div style="margin-top:14px; margin-bottom:4px;">
                <span class="topic-badge">{q.get('topic', 'Topic')}</span>
                <span class="difficulty-badge {diff_class}">{diff}</span>
                <span style="font-size:0.8rem; color:#888; margin-left:6px;">Cognitive Level: {bloom}</span>
            </div>
            """, unsafe_allow_html=True)
            
            st.markdown(f"**Question {qid}: {q.get('question', '')}**")
            
            options = q.get("options", [])
            # Streamlit radio
            current_choice = st.session_state.quiz_answers.get(qid, None)
            choice = st.radio(
                f"Select answer for Q{qid}",
                options,
                key=f"mcq_{qid}",
                index=options.index(current_choice) if current_choice in options else None,
                label_visibility="collapsed"
            )
            st.session_state.quiz_answers[qid] = choice

            # If quiz submitted, show color-coded explanation
            if st.session_state.quiz_submitted:
                correct_idx = q.get("answer_index", 0)
                correct_text = options[correct_idx] if correct_idx < len(options) else q.get("correct_answer")
                
                if choice == correct_text:
                    st.success(f"✅ **Correct!** ({q.get('explanation')})")
                else:
                    st.error(f"❌ **Incorrect.** You selected: *{choice or 'No selection'}*\n\n**Correct Answer:** **Option {'ABCD'[correct_idx]}: {correct_text}**\n\n💡 **Explanation:** {q.get('explanation')}")
            st.divider()

        # Submit / Reset Quiz
        col_sub, col_rst = st.columns([1, 1])
        with col_sub:
            if st.button("📝 Submit Quiz & Grade Answers", type="primary", use_container_width=True):
                st.session_state.quiz_submitted = True
                st.rerun()
        with col_rst:
            if st.button("🔄 Retake / Reset Quiz", use_container_width=True):
                st.session_state.quiz_answers = {}
                st.session_state.quiz_submitted = False
                st.rerun()

        # Score calculation
        if st.session_state.quiz_submitted and mcqs:
            score = 0
            for q in mcqs:
                qid = q.get("id")
                correct_idx = q.get("answer_index", 0)
                options = q.get("options", [])
                correct_text = options[correct_idx] if correct_idx < len(options) else q.get("correct_answer")
                if st.session_state.quiz_answers.get(qid) == correct_text:
                    score += 1
            pct = round((score / len(mcqs)) * 100)
            
            st.markdown(f"### 🏆 Exam Score: **{score} / {len(mcqs)}** ({pct}%)")
            if pct >= 80:
                st.balloons()
                st.success("🌟 Outstanding performance! You demonstrate strong mastery of these core concepts.")
            elif pct >= 60:
                st.warning("👍 Good effort! Review the flagged questions in the explanations to secure top marks.")
            else:
                st.error("⚠️ We recommend reviewing the Key Topics & Cheat Sheet before your exam.")

    # ----------------------------------------------------
    # TAB 3: High-Yield Short Q&A
    # ----------------------------------------------------
    with tab_qa:
        st.subheader("💡 High-Yield Short Questions & Answers")
        st.caption("Standard 2-mark to 5-mark examination questions with model responses and scoring keywords.")
        
        short_qas = course.get("short_qa", [])
        qa_view = st.radio("Display Mode:", ["Interactive Flashcards Deck", "Comprehensive List"], horizontal=True)
        
        if qa_view == "Comprehensive List":
            for q in short_qas:
                with st.expander(f"Q{q.get('id')}: {q.get('question')} ({q.get('marks', 3)} Marks)"):
                    st.markdown(f"**Model Answer:**\n{q.get('model_answer')}")
                    if q.get("key_keywords"):
                        st.markdown(f"**Scoring Keywords:** `{'`, `'.join(q['key_keywords'])}`")
                    if q.get("exam_tip"):
                        st.info(f"💡 **Examiner Tip:** {q['exam_tip']}")
        else:
            # Interactive Flashcard deck
            if short_qas:
                total_cards = len(short_qas)
                idx = st.session_state.flashcard_idx % total_cards
                card = short_qas[idx]
                
                st.markdown(f"**Flashcard {idx + 1} of {total_cards}** | Topic: `{card.get('topic')}`")
                
                st.markdown(f"""
                <div class="quiz-box" style="min-height: 140px; border-left: 6px solid #6366f1;">
                    <h3>❓ {card.get('question')}</h3>
                    <p style="color:#888;">Worth: {card.get('marks', 3)} Marks</p>
                </div>
                """, unsafe_allow_html=True)
                
                show_key = f"reveal_card_{idx}"
                if show_key not in st.session_state:
                    st.session_state[show_key] = False
                
                col_rev, col_next, col_prev = st.columns([2, 1, 1])
                with col_rev:
                    if st.button("👁️ Reveal / Hide Model Answer", key=f"btn_rev_{idx}", use_container_width=True):
                        st.session_state[show_key] = not st.session_state[show_key]
                        st.rerun()
                with col_next:
                    if st.button("Next ➡️", use_container_width=True):
                        st.session_state.flashcard_idx = (idx + 1) % total_cards
                        st.rerun()
                with col_prev:
                    if st.button("⬅️ Previous", use_container_width=True):
                        st.session_state.flashcard_idx = (idx - 1) % total_cards
                        st.rerun()
                        
                if st.session_state[show_key]:
                    st.markdown(f"### 📝 Model Answer:\n{card.get('model_answer')}")
                    if card.get("key_keywords"):
                        st.markdown(f"**Keywords:** `{'`, `'.join(card['key_keywords'])}`")
                    if card.get("exam_tip"):
                        st.info(f"💡 **Exam Tip:** {card['exam_tip']}")

    # ----------------------------------------------------
    # TAB 4: YouTube Shorts Studio
    # ----------------------------------------------------
    with tab_yt:
        st.subheader("🎬 YouTube Shorts Studio (9:16 Vertical Scripts)")
        st.caption("Paced for 45-60 second educational retention, high CTR titles, visual cues, and pinned comments.")
        
        yt_shorts = course.get("youtube_shorts", [])
        if not yt_shorts:
            st.info("No YouTube Shorts generated.")
        
        for idx, s in enumerate(yt_shorts, 1):
            st.markdown(f"""
            <div class="reel-container">
                <span class="topic-badge">YouTube Short #{idx}</span>
                <span class="topic-badge" style="background:#dc2626;">YouTube Shorts (9:16)</span>
                <span style="font-size:0.85rem; color:#888;">Target: {s.get('duration_target', '45-60s')}</span>
                <h3 style="margin-top:8px;">{s.get('title')}</h3>
            </div>
            """, unsafe_allow_html=True)
            
            st.markdown(f"**⚡ Hook (0-3s):**")
            st.markdown(f"- 🎥 **Visual:** {s.get('hook', {}).get('visual')}")
            st.markdown(f"- 🎙️ **Voiceover:** \"*{s.get('hook', {}).get('voiceover')}*\"")
            
            st.markdown("**🎬 Scene-by-Scene Visual Breakdown:**")
            scenes_data = []
            for sc in s.get("scenes", []):
                scenes_data.append({
                    "Timestamp": sc.get("timestamp"),
                    "Visual Cue / Animation": sc.get("visual_cue"),
                    "On-Screen Text": sc.get("on_screen_text"),
                    "Spoken Voiceover": sc.get("voiceover")
                })
            st.table(scenes_data)
            
            st.markdown(f"📌 **Pinned Comment Challenge:** `{s.get('pinned_comment')}`")
            st.markdown(f"🏷️ **SEO Tags:** `{' '.join(s.get('seo_tags', []))}`")
            
            # Copy script
            full_script = f"TITLE: {s.get('title')}\nHOOK VOICEOVER: {s.get('hook', {}).get('voiceover')}\n\n" + "\n".join([
                f"[{sc.get('timestamp')}] ({sc.get('visual_cue')})\nVO: {sc.get('voiceover')}" for sc in s.get("scenes", [])
            ]) + f"\n\nPINNED COMMENT: {s.get('pinned_comment')}"
            st.download_button(
                f"📋 Download Script (Short #{idx})",
                full_script,
                file_name=f"youtube_short_{idx}.txt",
                key=f"dl_yt_{idx}"
            )
            st.divider()

    # ----------------------------------------------------
    # TAB 5: Instagram Reels Studio
    # ----------------------------------------------------
    with tab_ig:
        st.subheader("📸 Instagram Reels Studio")
        st.caption("Viral pattern interrupt hooks, aesthetic B-roll shot list, trending sound vibes, and formatted captions.")
        
        ig_reels = course.get("instagram_reels", [])
        if not ig_reels:
            st.info("No Instagram Reels generated.")
            
        for idx, r in enumerate(ig_reels, 1):
            st.markdown(f"""
            <div class="reel-container" style="border-color: #ec4899; background: rgba(236, 72, 153, 0.03);">
                <span class="topic-badge" style="background:#ec4899;">Instagram Reel #{idx}</span>
                <span style="font-size:0.85rem; color:#888;">Duration: {r.get('duration_target', '30-45s')}</span>
                <h3 style="margin-top:8px;">{r.get('title')}</h3>
            </div>
            """, unsafe_allow_html=True)
            
            st.markdown(f"🎵 **Recommended Audio Vibe:** `{r.get('trending_audio_vibe')}`")
            st.markdown(f"⚡ **Hook (0-3s):**")
            st.markdown(f"- 👁️ **Pattern Interrupt:** {r.get('hook', {}).get('pattern_interrupt')}")
            st.markdown(f"- 🏷️ **Text Sticker:** `{r.get('hook', {}).get('text_sticker')}`")
            st.markdown(f"- 🎙️ **Voiceover:** \"*{r.get('hook', {}).get('voiceover')}*\"")
            
            st.markdown("**📸 Shot List & B-Roll Aesthetic:**")
            for sc in r.get("scenes", []):
                st.markdown(f"- **Scene {sc.get('scene_number')}:** {sc.get('b_roll_visual')}")
                st.markdown(f"  - 💬 *Text on Screen:* `{sc.get('text_overlay')}`")
                st.markdown(f"  - 🎙️ *Voiceover:* \"{sc.get('voiceover')}\"")
                
            st.markdown(f"📢 **Call to Action:** {r.get('call_to_action')}")
            st.markdown("**📝 Copy-Paste Instagram Caption & Hashtags:**")
            st.code(r.get("caption", ""), language="text")
            st.divider()

    # ----------------------------------------------------
    # TAB 6: Exam Revision Planner
    # ----------------------------------------------------
    with tab_planner:
        st.subheader("📋 3-Day Exam Revision Strategy & Checklist")
        st.caption("Structured timeline to prepare students for top exam grades.")
        
        col_d1, col_d2, col_d3 = st.columns(3)
        with col_d1:
            st.markdown("### 🗓️ Day 1: Concept Mastery")
            st.markdown("- Read through Core Topics & Cheat Sheet")
            st.markdown("- Note down definitions and formula rules")
            st.markdown("- Watch YouTube Shorts breakdowns for visual recall")
        with col_d2:
            st.markdown("### 🗓️ Day 2: Active Recall")
            st.markdown("- Drill the High-Yield Short Q&A flashcards")
            st.markdown("- Practice writing out 3-mark and 5-mark answers")
            st.markdown("- Highlight must-include examiner keywords")
        with col_d3:
            st.markdown("### 🗓️ Day 3: Mock Testing")
            st.markdown("- Take the Interactive MCQ Quiz under 15-minute timer")
            st.markdown("- Review all missed questions and explanations")
            st.markdown("- Review Instagram Reels tips before entering the exam")

        st.divider()
        st.markdown("### ✅ Final Revision Checklist")
        for idx, item in enumerate(course.get("revision_checklist", []), 1):
            st.checkbox(f"{item}", key=f"chk_{idx}")

    # ----------------------------------------------------
    # TAB 7: Export & Download
    # ----------------------------------------------------
    with tab_export:
        st.subheader("💾 Export Course Pack to All Formats")
        st.markdown("Export your complete exam preparation and social content pack to share with students or import into LMS / Notion.")
        
        generator = ExamContentGenerator()
        md_guide = generator.generate_markdown_guide(course)
        json_dump = json.dumps(course, indent=2, ensure_ascii=False)
        
        c_dl1, c_dl2 = st.columns(2)
        with c_dl1:
            st.download_button(
                "📥 Download Complete Course Pack (.json)",
                json_dump,
                file_name="course_content_pack.json",
                mime="application/json",
                use_container_width=True
            )
        with c_dl2:
            st.download_button(
                "📖 Download Comprehensive Study Guide (.md)",
                md_guide,
                file_name="Exam_Study_Guide.md",
                mime="text/markdown",
                use_container_width=True
            )
        
        st.markdown("#### 📄 Markdown Preview:")
        st.text_area("Markdown Output", md_guide[:2000] + "\n\n... (truncated for preview)", height=350)
else:
    st.info("👆 Upload a PDF above or click **'🚀 Load Sample Exam PDF'** in the sidebar to begin generating your course content!")