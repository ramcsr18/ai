import * as pdfjs from 'pdfjs-dist'
import worker from 'pdfjs-dist/build/pdf.worker.min.js?url'

pdfjs.GlobalWorkerOptions.workerSrc = worker

export async function extractText(file, onPage) {
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  let text = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    text += content.items.map((x) => x.str).join(' ') + '\n'
    onPage?.(i, pdf.numPages)
  }
  return { text: text.replace(/\s+/g, ' ').trim(), pages: pdf.numPages }
}

// Split the document into up to `max` evenly spaced pieces of ~`size` chars; one topic per piece.
export function chunkText(text, size, max) {
  const n = Math.max(1, Math.min(max, Math.ceil(text.length / size)))
  const len = Math.min(size, Math.ceil(text.length / n))
  const step = n > 1 ? (text.length - len) / (n - 1) : 0
  return Array.from({ length: n }, (_, i) => text.slice(Math.floor(i * step), Math.floor(i * step) + len))
}

const prompt = (piece) => `You are an elite exam-prep course creator and educational video producer.
From the study material below, extract the most important topic and return ONLY a raw JSON object (no markdown, no quotes around the json block) with this exact schema:
{
  "title": "Topic Title",
  "summary": "2-3 sentences concise summary",
  "key_takeaways": ["Takeaway 1", "Takeaway 2", "Takeaway 3"],
  "exam_tip": "Important trap or tip for exams",
  "mcqs": [
    {
      "q": "Exam question testing understanding",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answer": 0,
      "explanation": "Why this answer is right"
    }
  ],
  "qa": [
    {
      "q": "Short answer question (3-5 marks)",
      "a": "Concise model answer"
    }
  ],
  "youtube_short": {
    "title": "60-Second Exam Masterclass",
    "hook": "0-3s visual and voiceover curiosity trigger",
    "duration": "45-60s",
    "scenes": [
      {
        "timestamp": "0:04 - 0:15",
        "visual": "Animated visual cue",
        "voiceover": "Spoken line"
      }
    ],
    "pinned_comment": "Discussion prompt for viewers",
    "cta": "Subscribe for daily exam hacks!"
  },
  "instagram_reel": {
    "title": "Aesthetic Study Breakdown",
    "duration": "30-45s",
    "hook": "Stop scrolling if you have exams soon!",
    "audio_vibe": "Chill Lofi Study Beats",
    "scenes": [
      {
        "visual": "Aesthetic top-down study desk shot",
        "voiceover": "Core point to memorize"
      }
    ],
    "caption": "Full Instagram caption with hashtags",
    "hashtags": ["#ExamPrep", "#StudyWithMe", "#LearnOnReels"]
  }
}
Base everything strictly on this material:
${piece}`

// Heuristic fallback generator when local Ollama is unreachable
function generateTopicHeuristic(piece, index = 0) {
  const sentences = piece
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 25)

  const s1 = sentences[0] || piece.slice(0, 100)
  const s2 = sentences[1] || 'Essential concept for upcoming tests.'
  const s3 = sentences[2] || 'Common exam trap to avoid during revision.'
  const s4 = sentences[3] || 'Review core definitions carefully.'

  // Extract a clean topic title from the first sentence or heading
  const rawTitle = s1.split(/[:\n]/)[0].slice(0, 50).trim()
  const title = rawTitle.length > 5 ? rawTitle : `Core Exam Module ${index + 1}`

  return {
    title,
    summary: `${s1} ${s2}`,
    key_takeaways: [s1, s2, s3].slice(0, 3),
    exam_tip: `Always emphasize key definitions for ${title} to secure full marks.`,
    mcqs: [
      {
        q: `What is the primary principle behind ${title}?`,
        options: [
          s1.slice(0, 80),
          'Completely eliminates resource scheduling constraints',
          'Restricts processing strictly to single-core execution',
          'None of the above criteria apply'
        ],
        answer: 0,
        explanation: `Directly supported by the study text: "${s1}"`
      },
      {
        q: `Which statement best describes the operational mechanism in ${title}?`,
        options: [
          'Preempts any active execution without saving state',
          s2.slice(0, 80),
          'Reverses all memory transactions upon interruption',
          'Disables interrupts permanently'
        ],
        answer: 1,
        explanation: `Identified in the notes: "${s2}"`
      }
    ],
    qa: [
      {
        q: `Explain the core function and significance of ${title}.`,
        a: `${s1} ${s2}`
      },
      {
        q: `What is the most critical exam pitfall associated with ${title}?`,
        a: `${s3} ${s4}`
      }
    ],
    youtube_short: {
      title: `Stop Failing ${title}! 60-Second Exam Masterclass 🧠`,
      hook: `If this ${title} question appears on your exam tomorrow, here is how you score 100%.`,
      duration: '45-60s',
      scenes: [
        {
          timestamp: '0:04 - 0:18',
          visual: 'Animated neon diagram on blackboard highlighting rule #1',
          voiceover: `Remember rule #1: ${s1}`
        },
        {
          timestamp: '0:18 - 0:35',
          visual: 'Split-screen showing Common Mistake vs Correct Answer',
          voiceover: `Here is the trap: ${s2}`
        },
        {
          timestamp: '0:35 - 0:50',
          visual: '3-bullet cheat sheet appearing on screen',
          voiceover: `To secure full marks: ${s3}`
        }
      ],
      pinned_comment: `Drop your questions on ${title} below! Full study pack in bio link.`,
      cta: 'Subscribe for daily exam hacks and comment your answers!'
    },
    instagram_reel: {
      title: `POV: You master ${title} in 30 seconds ⚡️`,
      duration: '30-45s',
      hook: 'Stop scrolling if you have an exam this week! 🛑',
      audio_vibe: 'Chill Lofi Study Beats / Focus Synth',
      scenes: [
        {
          visual: 'Aesthetic top-down study desk with color-coded iPad highlights',
          voiceover: `Quick breakdown of ${title}: ${s1}`
        },
        {
          visual: 'Highlighter swipe across formula and key definition',
          voiceover: `What professors actually grade: ${s2}`
        },
        {
          visual: 'Save button animation on screen with glowing border',
          voiceover: 'Bookmark this reel right now so you do not panic before the test!'
        }
      ],
      caption: `Exam week prep! 📚 Everything you need to know about ${title}.\n\n⚡️ Key Takeaway: ${s1}\n💡 Pro Tip: Never confuse the core definitions.\n\n#ExamPrep #StudyWithMe #StudyTips #StudentLife #LearnOnReels`,
      hashtags: ['#ExamPrep', '#StudyWithMe', '#StudyHacks', '#LearnOnReels', '#ProductivityTips']
    }
  }
}

export async function generateTopic(piece, { model, ctx, cpu }, index = 0) {
  try {
    const res = await fetch('/ollama/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        format: 'json',
        options: { num_ctx: ctx, temperature: 0.3, ...(cpu ? { num_gpu: 0 } : {}) },
        messages: [{ role: 'user', content: prompt(piece) }]
      })
    })

    if (!res.ok) {
      let msg = ''
      try { msg = (await res.json()).error } catch { /* ignore */ }
      console.warn(`Ollama responded with ${res.status}: ${msg}. Using heuristic generator.`)
      return generateTopicHeuristic(piece, index)
    }

    const { message } = await res.json()
    const parsed = JSON.parse(message.content)
    return parsed
  } catch (err) {
    console.warn('Ollama unavailable or failed. Using fast heuristic course generator:', err.message)
    return generateTopicHeuristic(piece, index)
  }
}
