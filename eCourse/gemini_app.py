"""
Streamlit Application powered by Google Gemini API.
Generates MCQs, Short Q&A, YouTube Shorts, Instagram Reels, and Exam Study Guides from PDF documents.
"""

import os
import streamlit as st
import io

from course import ExamContentGenerator
from sample_generator import create_sample_study_pdf

st.set_page_config(page_title="Gemini Course & Exam Prep Studio", page_icon="💎", layout="wide")

st.title("💎 Google Gemini AI Course & Exam Content Studio")
st.markdown("Harness Google Gemini to convert PDF study material into MCQs, Short Q&A, and YouTube/Instagram Reel scripts.")

# API Key handling
api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")

with st.sidebar:
    st.subheader("🔑 Gemini Configuration")
    user_key = st.text_input("Gemini API Key", value=api_key or "", type="password", help="Enter your Gemini API key or set GEMINI_API_KEY environment variable")
    if user_key:
        api_key = user_key
        os.environ["GEMINI_API_KEY"] = user_key
        
    model_choice = st.selectbox("Gemini Model", ["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.1-pro-preview"], index=0)

    if st.button("🚀 Load Sample Exam PDF"):
        sample_path = "sample_operating_systems.pdf"
        if not os.path.exists(sample_path):
            sample_path = create_sample_study_pdf(sample_path)
        with open(sample_path, "rb") as f:
            st.session_state.gemini_pdf_bytes = f.read()
            st.session_state.gemini_pdf_name = "sample_operating_systems.pdf"
        st.success("Loaded sample PDF!")

uploaded_file = st.file_uploader("Upload PDF Document", type=["pdf"])

pdf_bytes = None
pdf_name = ""
if uploaded_file:
    pdf_bytes = uploaded_file.read()
    pdf_name = uploaded_file.name
elif "gemini_pdf_bytes" in st.session_state:
    pdf_bytes = st.session_state.gemini_pdf_bytes
    pdf_name = st.session_state.gemini_pdf_name

if pdf_bytes:
    st.info(f"Loaded: **{pdf_name}** ({len(pdf_bytes)/1024:.1f} KB)")
    
    if st.button("✨ Generate Course Content with Gemini", type="primary"):
        with st.spinner("Analyzing PDF and generating course materials with Gemini..."):
            provider = "gemini" if api_key else "heuristic"
            if not api_key:
                st.warning("No Gemini API key provided. Falling back to local offline heuristic engine.")
                
            generator = ExamContentGenerator(provider=provider, model_name=model_choice, api_key=api_key)
            result = generator.process_pdf(io.BytesIO(pdf_bytes))
            
            if "error" in result:
                st.error(result["error"])
            else:
                st.session_state.gemini_result = result
                st.success("Generation completed!")

if "gemini_result" in st.session_state:
    res = st.session_state.gemini_result
    tab1, tab2, tab3, tab4, tab5 = st.tabs(["📚 Topics", "🎯 MCQs", "💡 Short Q&A", "📱 Reels & Shorts", "💾 Export"])
    
    with tab1:
        for t in res.get("topics", []):
            st.subheader(t.get("title"))
            st.write(t.get("core_summary"))
            if t.get("formula_or_rule"):
                st.info(t.get("formula_or_rule"))
                
    with tab2:
        for m in res.get("mcqs", []):
            st.markdown(f"**Q{m['id']}: {m['question']}**")
            for j, o in enumerate(m.get("options", [])):
                st.markdown(f"- {'ABCD'[j]}: {o}")
            with st.expander("Show Answer & Explanation"):
                st.write(f"Answer: {m.get('correct_answer')}")
                st.write(m.get("explanation"))
            st.divider()
            
    with tab3:
        for q in res.get("short_qa", []):
            st.markdown(f"**Q{q['id']} ({q.get('marks', 3)} Marks): {q['question']}**")
            st.markdown(f"*{q['model_answer']}*")
            if q.get("exam_tip"):
                st.caption(f"Tip: {q['exam_tip']}")
            st.divider()
            
    with tab4:
        col_yt, col_ig = st.columns(2)
        with col_yt:
            st.subheader("🎬 YouTube Shorts")
            for s in res.get("youtube_shorts", []):
                st.markdown(f"### {s['title']}")
                st.write(f"**Hook:** {s['hook']['voiceover']}")
                for sc in s.get("scenes", []):
                    st.write(f"- [{sc['timestamp']}] {sc['voiceover']}")
        with col_ig:
            st.subheader("📸 Instagram Reels")
            for r in res.get("instagram_reels", []):
                st.markdown(f"### {r['title']}")
                st.write(f"**Sound:** {r['trending_audio_vibe']}")
                st.code(r.get("caption"))
                
    with tab5:
        st.download_button("Download JSON", str(res), "gemini_ecourse.json")