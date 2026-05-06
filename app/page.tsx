'use client'

import { useState, useEffect, useRef } from 'react'

const CONFIG = {
  candidateName: 'Ahmed',
  jobTitle: 'Teacher',
  institution: 'XYZ School',
  sector: 'Education',
  yearsExperience: '3 years',
  language: 'en',
  difficulty: 'standard',
  cvSummary: 'Experience in teaching and classroom management',
  jobRequirements: '',
  isCareerSwitch: false,
  plan: 'free'
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  score?: any
}

export default function InterviewPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sessionStartTime] = useState(Date.now())
  const [timeLeft, setTimeLeft] = useState(15 * 60)
  const [overallScore, setOverallScore] = useState<number | null>(null)
  const [questionCount, setQuestionCount] = useState(1)
  const [isEnded, setIsEnded] = useState(false)
  const chatRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const hasStarted = useRef(false)

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(interval); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight
    }
  }, [messages, isLoading])

  useEffect(() => {
    if (!hasStarted.current) {
      hasStarted.current = true
      callAdam([])
    }
  }, [])

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const callAdam = async (msgs: Message[]) => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: CONFIG,
          messages: msgs,
          sessionStartTime
        })
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)

      const newMsg: Message = {
        role: 'assistant',
        content: data.content,
        score: data.score
      }
      setMessages(prev => [...prev, newMsg])

      if (data.score) {
        setOverallScore(prev => {
          const all = [...msgs.filter(m => m.score).map(m => m.score.score), data.score.score]
          return Math.round(all.reduce((a, b) => a + b, 0) / all.length)
        })
        setQuestionCount(prev => prev + 1)
      }

      if (data.isEndOfSession) setIsEnded(true)

    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${err.message}`
      }])
    } finally {
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }

  const sendMessage = async () => {
    if (!input.trim() || isLoading || isEnded) return
    const userMsg: Message = { role: 'user', content: input.trim() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    await callAdam(newMessages)
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', background: '#0B0D11', color: '#F0EDE8', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* Nav */}
      <div style={{ background: '#0F1117', borderBottom: '0.5px solid rgba(255,255,255,0.07)', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 800, fontSize: 16 }}>Mock<span style={{ color: '#E85D2F' }}>Boss</span> AI</div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>{CONFIG.jobTitle} · {CONFIG.institution}</div>
          <div style={{ fontSize: 10, color: 'rgba(240,237,232,0.4)' }}>Based on highest hiring standards</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 10, color: '#F87171', background: 'rgba(220,38,38,0.1)', border: '0.5px solid rgba(220,38,38,0.2)', borderRadius: 20, padding: '3px 8px' }}>● Live</span>
          <span style={{ fontWeight: 800, fontSize: 16, color: timeLeft < 180 ? '#EF4444' : '#F0EDE8' }}>{formatTime(timeLeft)}</span>
        </div>
      </div>

      {/* Faces */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '12px 16px 0' }}>
        <div style={{ background: '#111520', border: '0.5px solid rgba(42,92,255,0.2)', borderRadius: 10, padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 44, height: 44, background: '#2563EB', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🎯</div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Adam Reid</div>
            <div style={{ fontSize: 10, color: 'rgba(240,237,232,0.35)' }}>Certified Interview Evaluator</div>
            <div style={{ fontSize: 9, color: '#8B96FF', marginTop: 2 }}>{isLoading ? '● Speaking...' : '○ Listening'}</div>
          </div>
        </div>
        <div style={{ background: '#111318', border: '0.5px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 44, height: 44, background: '#1a1a22', border: '1.5px solid rgba(255,255,255,0.08)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16 }}>A</div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{CONFIG.candidateName}</div>
            <div style={{ fontSize: 10, color: 'rgba(240,237,232,0.35)' }}>Candidate · {CONFIG.yearsExperience}</div>
            <div style={{ fontSize: 9, color: 'rgba(240,237,232,0.25)', marginTop: 2 }}>{isLoading ? 'Listening...' : 'Your turn'}</div>
          </div>
        </div>
      </div>

      {/* Chat */}
      <div ref={chatRef} style={{ flex: 1, padding: '10px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 200, maxHeight: 320 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ maxWidth: '88%', alignSelf: msg.role === 'assistant' ? 'flex-start' : 'flex-end', background: msg.role === 'assistant' ? '#1a1f2e' : '#1E3A8A', border: msg.role === 'assistant' ? '0.5px solid rgba(42,92,255,0.18)' : 'none', borderRadius: 10, padding: '10px 13px', fontSize: 13, lineHeight: 1.7 }}>
            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.5, marginBottom: 4, textTransform: 'uppercase', color: msg.role === 'assistant' ? '#8B96FF' : 'rgba(255,255,255,0.5)' }}>
              {msg.role === 'assistant' ? 'Adam Reid' : CONFIG.candidateName}
            </div>
            {msg.content}
            {msg.score && (
              <div style={{ marginTop: 6, padding: '3px 8px', background: 'rgba(42,92,255,0.1)', borderRadius: 5, fontSize: 10, color: '#8B96FF' }}>
                Score: {msg.score.score}/100
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div style={{ alignSelf: 'flex-start', background: '#1a1f2e', border: '0.5px solid rgba(42,92,255,0.15)', borderRadius: 10, padding: '12px 16px', display: 'flex', gap: 4 }}>
            {[0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, background: '#8B96FF', borderRadius: '50%', animation: `pulse 1.2s infinite ${i*0.2}s` }} />)}
          </div>
        )}
      </div>

      {/* Input */}
      {!isEnded ? (
        <div style={{ padding: '10px 16px', display: 'flex', gap: 8, borderTop: '0.5px solid rgba(255,255,255,0.05)' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Type your answer and press Enter..."
            disabled={isLoading}
            rows={1}
            style={{ flex: 1, background: '#16181F', border: '0.5px solid rgba(255,255,255,0.08)', color: '#F0EDE8', fontFamily: 'inherit', fontSize: 13, padding: '9px 12px', borderRadius: 8, outline: 'none', resize: 'none' }}
          />
          <button onClick={sendMessage} disabled={isLoading || !input.trim()}
            style={{ width: 40, height: 40, background: isLoading ? '#333' : '#2563EB', border: 'none', borderRadius: 8, cursor: isLoading ? 'not-allowed' : 'pointer', color: '#fff', fontSize: 18, flexShrink: 0 }}>
            →
          </button>
        </div>
      ) : (
        <div style={{ padding: 16, textAlign: 'center', borderTop: '0.5px solid rgba(255,255,255,0.05)' }}>
          <div style={{ fontSize: 14, color: '#8B96FF', marginBottom: 8 }}>Session ended · Score: {overallScore ?? '—'}/100</div>
          <button style={{ background: '#1E3A8A', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>View Full Report →</button>
        </div>
      )}

      {/* Bottom */}
      <div style={{ background: '#0D0F14', borderTop: '0.5px solid rgba(255,255,255,0.04)', padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 10, color: 'rgba(240,237,232,0.2)' }}>Question {questionCount}</div>
        <div style={{ background: 'rgba(42,92,255,0.08)', border: '0.5px solid rgba(42,92,255,0.15)', borderRadius: 6, padding: '4px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: 8, color: 'rgba(240,237,232,0.2)', textTransform: 'uppercase' }}>Performance</div>
          <div style={{ fontWeight: 800, fontSize: 15, color: '#8B96FF' }}>{overallScore ?? '—'}</div>
        </div>
        <button onClick={() => { if (confirm('End interview?')) setIsEnded(true) }}
          style={{ background: 'rgba(239,68,68,0.07)', border: '0.5px solid rgba(239,68,68,0.18)', color: '#F87171', borderRadius: 6, padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          End
        </button>
      </div>

      <style>{`@keyframes pulse{0%,80%,100%{opacity:0.3}40%{opacity:1}}`}</style>
    </div>
  )
}
