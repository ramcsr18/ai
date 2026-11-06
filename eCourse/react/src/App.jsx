import { useState } from 'react'
import { extractText, chunkText, generateTopic } from './api.js'

function McqItem({ m, i, onSelect, selectedAnswer }) {
  const isAnswered = selectedAnswer !== undefined
  const isCorrect = selectedAnswer === m.answer

  return (
    <div className="q" style={{ marginBottom: 16 }}>
      <p style={{ fontWeight: 600 }}>{i + 1}. {m.q}</p>
      {m.options.map((opt, j) => {
        let btnClass = 'opt'
        if (isAnswered) {
          if (j === m.answer) btnClass += ' ok'
          else if (j === selectedAnswer) btnClass += ' bad'
        }
        return (
          <button
            key={j}
            disabled={isAnswered}
            className={btnClass}
            onClick={() => onSelect(i, j)}
          >
            {'ABCD'[j]}. {opt}
          </button>
        )
      })}
      {isAnswered && (
        <div className="ex" style={{ marginTop: 8 }}>
          {isCorrect ? '✅ Correct! ' : '❌ Incorrect. '}
          <b>Explanation:</b> {m.explanation}
        </div>
      )}
    </div>
  )
}

function YouTubeShortView({ s }) {
  if (!s) return null
  const scriptText = [
    `TITLE: ${s.title}`,
    `HOOK: ${s.hook}`,
    ...(s.scenes || []).map((sc) => `[${sc.timestamp}] ${sc.visual}\nVO: ${sc.voiceover}`),
    `CTA: ${s.cta}`,
    `PINNED COMMENT: ${s.pinned_comment}`
  ].join('\n\n')

  return (
    <div className="video-studio">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span className="tag" style={{ background: '#dc2626', color: '#fff', border: 0 }}>YouTube Shorts (9:16)</span>
        <span className="tag">{s.duration || '45-60s'}</span>
      </div>
      <h4 style={{ margin: '8px 0' }}>{s.title}</h4>
      <p><b>⚡ Hook (0-3s):</b> <i>"{s.hook}"</i></p>

      <div style={{ margin: '12px 0' }}>
        <b>🎬 Scene Breakdown:</b>
        {(s.scenes || []).map((sc, i) => (
          <div className="sc" key={i}>
            <b>{sc.timestamp || `Scene ${i + 1}`}</b>
            <div>
              <div>🎥 {sc.visual}</div>
              <div style={{ color: 'var(--mut)', marginTop: 2 }}>🎙️ <i>"{sc.voiceover}"</i></div>
            </div>
          </div>
        ))}
      </div>

      {s.pinned_comment && <p className="ex">📌 <b>Pinned Comment:</b> {s.pinned_comment}</p>}
      <button className="g" onClick={() => navigator.clipboard?.writeText(scriptText)}>
        📋 Copy Full Shorts Script
      </button>
    </div>
  )
}

function InstagramReelView({ r }) {
  if (!r) return null
  return (
    <div className="video-studio" style={{ borderColor: '#ec4899' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span className="tag" style={{ background: '#ec4899', color: '#fff', border: 0 }}>Instagram Reel</span>
        <span className="tag">{r.duration || '30-45s'}</span>
      </div>
      <h4 style={{ margin: '8px 0' }}>{r.title}</h4>
      {r.audio_vibe && <p>🎵 <b>Trending Sound Vibe:</b> <code>{r.audio_vibe}</code></p>}
      <p><b>⚡ Pattern Interrupt Hook:</b> <i>"{r.hook}"</i></p>

      <div style={{ margin: '12px 0' }}>
        <b>📸 Shot List & B-Roll Aesthetic:</b>
        {(r.scenes || []).map((sc, i) => (
          <div className="sc" key={i}>
            <b>Shot {i + 1}</b>
            <div>
              <div>🎥 {sc.visual}</div>
              <div style={{ color: 'var(--mut)', marginTop: 2 }}>🎙️ <i>"{sc.voiceover}"</i></div>
            </div>
          </div>
        ))}
      </div>

      <p className="ex"><b>Caption & Hashtags:</b></p>
      <pre style={{ background: 'rgba(128,128,128,0.1)', padding: 10, borderRadius: 8, whiteSpace: 'pre-wrap' }}>
        {r.caption}
      </pre>

      <button className="g" onClick={() => navigator.clipboard?.writeText(r.caption)}>
        📋 Copy Instagram Caption
      </button>
    </div>
  )
}

const SAMPLE_TEXT = `Topic 1: Process Synchronization, Mutexes, and Semaphores
Process synchronization coordinates concurrent execution to ensure consistent shared data.
A critical section is a piece of code where shared resources like memory or files are accessed.
Mutual exclusion ensures that only one thread executes in its critical section at a time.
Semaphores are integer variables accessed via wait() and signal() atomic operations.
A binary semaphore functions identically to a mutex lock.

Topic 2: Deadlock Characterization and Prevention
A deadlock occurs when concurrent processes are blocked because each holds a resource while waiting for another.
Coffman established four necessary conditions: Mutual Exclusion, Hold and Wait, No Preemption, and Circular Wait.
Deadlock avoidance uses dynamically gathered state information such as Dijkstra's Banker's Algorithm.

Topic 3: Virtual Memory and Paging
Virtual memory separates user logical memory from physical RAM.
Paging divides logical memory into fixed-size pages and physical memory into frames.
The Translation Lookaside Buffer (TLB) accelerates address translation.
A page fault occurs when a requested page is not resident in physical RAM.
Page replacement algorithms include FIFO, LRU (Least Recently Used), and Optimal.`

export default function App() {
  const [cfg, setCfg] = useState({ model: 'qwen3.8:latest', ctx: 4096, cpu: false, topics: 3 })
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [topics, setTopics] = useState([])
  const [tab, setTab] = useState('mcq')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [userAnswers, setUserAnswers] = useState({})

  const set = (k) => (e) => setCfg({ ...cfg, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  async function onFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setBusy(true)
    setTopics([])
    setUserAnswers({})
    setFileName(file.name)
    try {
      const { text, pages } = await extractText(file, (i, n) => setStatus(`Parsed page ${i}/${n}`))
      if (text.length < 50) throw new Error('No extractable text found (scanned PDF?)')
      setText(text)
      setStatus(`Ready: ${pages} pages, ${text.length.toLocaleString()} characters.`)
    } catch (err) {
      setText('')
      setStatus('Could not read PDF: ' + err.message)
    }
    setBusy(false)
  }

  function loadSample() {
    setText(SAMPLE_TEXT)
    setFileName('sample_operating_systems.pdf')
    setStatus('Loaded Sample Exam Notes into memory.')
  }

  async function generate() {
    if (!text) return
    setBusy(true)
    setTopics([])
    setUserAnswers({})
    const ctx = +cfg.ctx
    const pieces = chunkText(text, Math.round(ctx * 1.2), +cfg.topics)
    try {
      for (let i = 0; i < pieces.length; i++) {
        setStatus(`Generating module ${i + 1}/${pieces.length}…`)
        const t = await generateTopic(pieces[i], { ...cfg, ctx }, i)
        setTopics((prev) => [...prev, t])
      }
      setStatus('Course generation completed!')
    } catch (err) {
      setStatus('Generation failed: ' + err.message)
    }
    setBusy(false)
  }

  function handleAnswer(topicIdx, mcqIdx, optIdx) {
    setUserAnswers((prev) => ({
      ...prev,
      [`${topicIdx}_${mcqIdx}`]: optIdx
    }))
  }

  function downloadJSON() {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(topics, null, 2)], { type: 'application/json' }))
    a.download = 'ecourse_pack.json'
    a.click()
  }

  // Calculate Quiz Score
  let totalMcqs = 0
  let correctCount = 0
  topics.forEach((t, tIdx) => {
    (t.mcqs || []).forEach((m, mIdx) => {
      totalMcqs++
      if (userAnswers[`${tIdx}_${mIdx}`] === m.answer) {
        correctCount++
      }
    })
  })

  return (
    <main>
      <h1>🎓 e<span>Course</span> &amp; Social Studio</h1>
      <p className="s">
        Upload study material. Generate interactive MCQs, exam Q&amp;As, and viral YouTube Shorts &amp; Instagram Reels.
      </p>

      <div className="card">
        <div className="row">
          <label>Ollama Model <input value={cfg.model} onChange={set('model')} style={{ width: 140 }} /></label>
          <label>Topics <input type="number" min="1" max="8" value={cfg.topics} onChange={set('topics')} style={{ width: 50 }} /></label>
          <label>Context <input type="number" step="1024" value={cfg.ctx} onChange={set('ctx')} style={{ width: 70 }} /></label>
          <label><input type="checkbox" checked={cfg.cpu} onChange={set('cpu')} /> CPU only</label>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '10px 0' }}>
          <input type="file" accept="application/pdf" onChange={onFile} disabled={busy} />
          <button className="g" onClick={loadSample} disabled={busy}>Load Sample Exam Notes</button>
        </div>

        {fileName && <p style={{ fontSize: '0.9rem', color: 'var(--mut)' }}>Loaded: <b>{fileName}</b></p>}

        <p>
          <button onClick={generate} disabled={busy || !text}>
            {busy ? 'Generating Content…' : '✨ Generate Full Course Pack'}
          </button>{' '}
          <span className="ex">{status}</span>
        </p>
      </div>

      {topics.length > 0 && (
        <>
          <div className="tabs">
            {[
              ['mcq', `🎯 MCQs Quiz (${correctCount}/${totalMcqs})`],
              ['qa', '💡 Short Q&A'],
              ['yt', '🎬 YouTube Shorts'],
              ['ig', '📸 Instagram Reels'],
              ['sum', '📚 Topics & Cheat Sheets']
            ].map(([k, l]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
            ))}
            <button className="g" onClick={downloadJSON}>💾 Download JSON</button>
          </div>

          {tab === 'mcq' && totalMcqs > 0 && (
            <div className="card" style={{ background: 'rgba(37,99,235,0.06)', borderColor: '#2563eb' }}>
              <b>Exam Quiz Progress:</b> {Object.keys(userAnswers).length} / {totalMcqs} answered |
              <b> Score:</b> {correctCount} / {totalMcqs} ({Math.round((correctCount / totalMcqs) * 100) || 0}%)
              <button
                className="g"
                style={{ marginLeft: 16, padding: '4px 8px', fontSize: '0.8rem' }}
                onClick={() => setUserAnswers({})}
              >
                Reset Answers
              </button>
            </div>
          )}
        </>
      )}

      {topics.map((t, tIdx) => (
        <section className="card" key={tIdx}>
          <h3>{t.title}</h3>

          {tab === 'sum' && (
            <div>
              <p><b>Summary:</b> {t.summary}</p>
              {t.key_takeaways && (
                <div>
                  <b>Key Takeaways:</b>
                  <ul>
                    {t.key_takeaways.map((item, i) => <li key={i}>{item}</li>)}
                  </ul>
                </div>
              )}
              {t.exam_tip && <p className="ex" style={{ color: '#c2410c' }}>💡 <b>Exam Trap:</b> {t.exam_tip}</p>}
            </div>
          )}

          {tab === 'mcq' && (t.mcqs || []).map((m, mIdx) => (
            <McqItem
              key={mIdx}
              m={m}
              i={mIdx}
              selectedAnswer={userAnswers[`${tIdx}_${mIdx}`]}
              onSelect={(_, optIdx) => handleAnswer(tIdx, mIdx, optIdx)}
            />
          ))}

          {tab === 'qa' && (t.qa || []).map((x, i) => (
            <details key={i} style={{ marginBottom: 12 }}>
              <summary>❓ {x.q}</summary>
              <div style={{ marginTop: 8, paddingLeft: 12, borderLeft: '3px solid var(--ac)' }}>
                <p><b>Model Answer:</b> {x.a}</p>
              </div>
            </details>
          ))}

          {tab === 'yt' && <YouTubeShortView s={t.youtube_short} />}
          {tab === 'ig' && <InstagramReelView r={t.instagram_reel} />}
        </section>
      ))}
    </main>
  )
}
