'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface VoiceAnalysis {
  wordsPerMinute: number
  duration: number
  wordCount: number
  confidence: 'high' | 'medium' | 'low'
  hesitation: 'high' | 'medium' | 'low'
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  score?: any
  voiceAnalysis?: VoiceAnalysis
}

const getPlanTime = (plan: string) => {
  if (plan === 'go') return 15 * 60
  if (plan === 'pro') return 30 * 60
  if (plan === 'expert') return 60 * 60
  return 15 * 60
}

export default function InterviewPage() {
  const router = useRouter()

  const [CONFIG] = useState(() => {
    if (typeof window === 'undefined') {
      return {
        candidateName: 'Candidate',
        jobTitle: 'Professional',
        institution: 'Company',
        sector: 'General',
        yearsExperience: '1–3 years',
        language: 'en',
        jobRequirements: '',
        cvText: '',
        plan: 'go',
      }
    }
    try {
      const saved = sessionStorage.getItem('barbaros_config')
      if (saved) return JSON.parse(saved)
    } catch {}
    return {
      candidateName: 'Candidate',
      jobTitle: 'Professional',
      institution: 'Company',
      sector: 'General',
      yearsExperience: '1–3 years',
      language: 'en',
      jobRequirements: '',
      cvText: '',
      plan: 'go',
    }
  })

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sessionStartTime] = useState(Date.now())
  const [timeLeft, setTimeLeft] = useState(() => getPlanTime(
    (() => {
      if (typeof window === 'undefined') return 'go'
      try {
        const saved = sessionStorage.getItem('barbaros_config')
        if (saved) return JSON.parse(saved).plan ?? 'go'
      } catch {}
      return 'go'
    })()
  ))
  const [overallScore, setOverallScore] = useState<number | null>(null)
  const [questionCount, setQuestionCount] = useState(1)
  const [isEnded, setIsEnded] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [audioReady, setAudioReady] = useState(false)
  const [pendingAudio, setPendingAudio] = useState<string | null>(null)
  const [micError, setMicError] = useState<string | null>(null)
  const [showMicHint, setShowMicHint] = useState(true)

  const chatRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const hasStarted = useRef(false)
  const silenceTimer = useRef<any>(null)
  const messagesRef = useRef<Message[]>([])
  const isLoadingRef = useRef(false)
  const isEndedRef = useRef(false)
  const isRecordingRef = useRef(false)
  const isTranscribingRef = useRef(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const isMutedRef = useRef(false)
  const audioReadyRef = useRef(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const overallScoreRef = useRef<number | null>(null)

  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { isLoadingRef.current = isLoading }, [isLoading])
  useEffect(() => { isEndedRef.current = isEnded }, [isEnded])
  useEffect(() => { isRecordingRef.current = isRecording }, [isRecording])
  useEffect(() => { isTranscribingRef.current = isTranscribing }, [isTranscribing])
  useEffect(() => { overallScoreRef.current = overallScore }, [overallScore])

  // إخفاء تنبيه المايك بعد أول تسجيل
  useEffect(() => {
    if (isRecording) setShowMicHint(false)
  }, [isRecording])

  useEffect(() => {
    if (audioReady && pendingAudio) {
      playAudioDirect(pendingAudio)
      setPendingAudio(null)
    }
  }, [audioReady, pendingAudio])

  const playAudioDirect = (audioBase64: string) => {
    if (isMutedRef.current) return
    try {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
        audioRef.current = null
      }
      const audio = new Audio(`data:audio/mpeg;base64,${audioBase64}`)
      audioRef.current = audio
      audio.play().catch(err => console.warn('Audio play failed:', err))
    } catch (err) {
      console.warn('Audio error:', err)
    }
  }

  const playAudio = useCallback((audioBase64: string) => {
    if (isMutedRef.current) return
    if (!audioReadyRef.current) {
      setPendingAudio(audioBase64)
      return
    }
    playAudioDirect(audioBase64)
  }, [])

  const handleFirstInteraction = useCallback(() => {
    if (!audioReadyRef.current) {
      audioReadyRef.current = true
      setAudioReady(true)
    }
  }, [])

  const toggleMute = () => {
    const next = !isMuted
    setIsMuted(next)
    isMutedRef.current = next
    if (next && audioRef.current) audioRef.current.pause()
  }

  const resetSilenceTimer = useCallback(() => {
    if (silenceTimer.current) clearTimeout(silenceTimer.current)
    silenceTimer.current = setTimeout(() => {
      if (!isLoadingRef.current && !isEndedRef.current && !isRecordingRef.current && !isTranscribingRef.current) {
        const silenceMsg: Message = { role: 'user', content: '[Candidate is silent]' }
        const newMsgs = [...messagesRef.current, silenceMsg]
        setMessages(newMsgs)
        callAdam(newMsgs)
      }
    }, 30000)
  }, [])

  const startRecording = async () => {
    if (isLoading || isTranscribing || isEnded) return
    try {
      handleFirstInteraction()
      setMicError(null)
      if (silenceTimer.current) clearTimeout(silenceTimer.current)
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        await transcribeAudio(audioBlob)
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch (err: any) {
      setMicError('Microphone access denied — please allow mic permission')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecordingRef.current) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const transcribeAudio = async (audioBlob: Blob) => {
    setIsTranscribing(true)
    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, 'recording.webm')

      const res = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData
      })

      const data = await res.json()
      if (!data.success) throw new Error(data.error)

      if (data.text?.trim()) {
        const userMsg: Message = {
          role: 'user',
          content: data.text.trim(),
          voiceAnalysis: data.analysis
        }
        const newMessages = [...messagesRef.current, userMsg]
        setMessages(newMessages)
        await callAdam(newMessages)
      } else {
        resetSilenceTimer()
      }
    } catch (err: any) {
      setMicError('Transcription failed — please type your answer')
      resetSilenceTimer()
    } finally {
      setIsTranscribing(false)
    }
  }

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
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
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

  const getPlanLabel = (plan: string) => {
    if (plan === 'go') return 'GO · 15 min'
    if (plan === 'pro') return 'Pro · 30 min'
    if (plan === 'expert') return 'Expert · 60 min'
    return 'GO · 15 min'
  }

  const endSession = (msgs: Message[], finalScore: number | null) => {
    sessionStorage.setItem('barbaros_messages', JSON.stringify(msgs))
    sessionStorage.setItem('barbaros_score', String(finalScore ?? 0))
    setIsEnded(true)
    setTimeout(() => router.push('/session-end'), 2000)
  }

  const callAdam = async (msgs: Message[]) => {
    setIsLoading(true)
    if (silenceTimer.current) clearTimeout(silenceTimer.current)
    try {
      const res = await fetch('/api/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: CONFIG, messages: msgs, sessionStartTime })
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)

      const newMsg: Message = { role: 'assistant', content: data.content, score: data.score }
      const updatedMsgs = [...msgs, newMsg]
      setMessages(updatedMsgs)

      if (data.audioBase64) playAudio(data.audioBase64)

      let latestScore = overallScoreRef.current
      if (data.score) {
        const all = [...msgs.filter(m => m.score).map(m => m.score.score), data.score.score]
        latestScore = Math.round(all.reduce((a, b) => a + b, 0) / all.length)
        setOverallScore(latestScore)
        setQuestionCount(prev => prev + 1)
      }

      if (data.isEndOfSession) {
        endSession(updatedMsgs, latestScore)
      } else {
        resetSilenceTimer()
      }
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }])
    } finally {
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }

  const sendMessage = async () => {
    if (!input.trim() || isLoading || isEnded) return
    handleFirstInteraction()
    if (silenceTimer.current) clearTimeout(silenceTimer.current)
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    const userMsg: Message = { role: 'user', content: input.trim() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    await callAdam(newMessages)
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const getConfidenceColor = (level: string) => {
    if (level === 'high') return '#22C55E'
    if (level === 'medium') return '#F59E0B'
    return '#EF4444'
  }

  return (
    <div
      onClick={handleFirstInteraction}
      style={{ fontFamily: 'system-ui, sans-serif', background: '#0B0D11', color: '#F0EDE8', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}
    >
      {/* Nav */}
      <div style={{ background: '#0F1117', borderBottom: '0.5px solid rgba(255,255,255,0.07)', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 800, fontSize: 16 }}>Barbar<span style={{ color: '#E85D2F' }}>os</span></div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>{CONFIG.jobTitle} · {CONFIG.institution}</div>
          <div style={{ fontSize: 10, color: 'rgba(240,237,232,0.4)' }}>Based on highest hiring standards</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={toggleMute} style={{ background: 'none', border: '0.5px solid rgba(255,255,255,0.2)', borderRadius: 6, color: '#F0EDE8', padding: '3px 8px', cursor: 'pointer', fontSize: 14 }}>
            {isMuted ? '🔇' : '🔊'}
          </button>
          <span style={{ fontSize: 10, color: '#F87171', background: 'rgba(220,38,38,0.1)', border: '0.5px solid rgba(220,38,38,0.2)', borderRadius: 20, padding: '3px 8px' }}>● Live</span>
          <span style={{ fontWeight: 800, fontSize: 16, color: timeLeft < 180 ? '#EF4444' : '#F0EDE8' }}>{formatTime(timeLeft)}</span>
        </div>
      </div>

      {/* Mic Hint Banner */}
      {showMicHint && !isEnded && (
        <div style={{ background: 'linear-gradient(135deg, rgba(37,99,235,0.15), rgba(42,92,255,0.08))', border: '0.5px solid rgba(42,92,255,0.3)', margin: '10px 16px 0', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>🎤</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#8B96FF', marginBottom: 2 }}>How to use your microphone</div>
            <div style={{ fontSize: 11, color: 'rgba(240,237,232,0.55)', lineHeight: 1.5 }}>
              Press and <strong style={{ color: '#F0EDE8' }}>hold</strong> the mic button while speaking. Release <strong style={{ color: '#F0EDE8' }}>only when you finish your complete answer.</strong>
            </div>
          </div>
          <button
            onClick={() => setShowMicHint(false)}
            style={{ background: 'none', border: 'none', color: 'rgba(240,237,232,0.3)', cursor: 'pointer', fontSize: 16, flexShrink: 0, padding: 4 }}>
            ✕
          </button>
        </div>
      )}

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
          <div style={{ width: 44, height: 44, background: '#1a1a22', border: '1.5px solid rgba(255,255,255,0.08)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16 }}>
            {CONFIG.candidateName?.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{CONFIG.candidateName}</div>
            <div style={{ fontSize: 10, color: 'rgba(240,237,232,0.35)' }}>Candidate · {CONFIG.yearsExperience}</div>
            <div style={{ fontSize: 9, color: isRecording ? '#EF4444' : isTranscribing ? '#F59E0B' : 'rgba(240,237,232,0.25)', marginTop: 2 }}>
              {isRecording ? '● Recording... keep holding' : isTranscribing ? '◌ Processing...' : isLoading ? 'Listening...' : 'Your turn'}
            </div>
          </div>
        </div>
      </div>

      {/* Chat */}
      <div ref={chatRef} style={{ flex: 1, padding: '10px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 200, maxHeight: 300 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ maxWidth: '88%', alignSelf: msg.role === 'assistant' ? 'flex-start' : 'flex-end', background: msg.role === 'assistant' ? '#1a1f2e' : '#1E3A8A', border: msg.role === 'assistant' ? '0.5px solid rgba(42,92,255,0.18)' : 'none', borderRadius: 10, padding: '10px 13px', fontSize: 13, lineHeight: 1.7 }}>
            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.5, marginBottom: 4, textTransform: 'uppercase', color: msg.role === 'assistant' ? '#8B96FF' : 'rgba(255,255,255,0.5)' }}>
              {msg.role === 'assistant' ? 'Adam Reid' : CONFIG.candidateName}
            </div>
            {msg.content === '[Candidate is silent]'
              ? <span style={{ color: 'rgba(240,237,232,0.3)', fontStyle: 'italic' }}>...</span>
              : msg.content}
            {msg.score && (
              <div style={{ marginTop: 6, padding: '3px 8px', background: 'rgba(42,92,255,0.1)', borderRadius: 5, fontSize: 10, color: '#8B96FF' }}>
                Score: {msg.score.score}/100
              </div>
            )}
            {msg.voiceAnalysis && (
              <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 9, padding: '2px 6px', background: 'rgba(255,255,255,0.05)', borderRadius: 4, color: getConfidenceColor(msg.voiceAnalysis.confidence) }}>
                  Confidence: {msg.voiceAnalysis.confidence}
                </span>
                <span style={{ fontSize: 9, padding: '2px 6px', background: 'rgba(255,255,255,0.05)', borderRadius: 4, color: getConfidenceColor(msg.voiceAnalysis.hesitation === 'low' ? 'high' : msg.voiceAnalysis.hesitation === 'high' ? 'low' : 'medium') }}>
                  Hesitation: {msg.voiceAnalysis.hesitation}
                </span>
              </div>
            )}
          </div>
        ))}
        {(isLoading || isTranscribing) && (
          <div style={{ alignSelf: 'flex-start', background: '#1a1f2e', border: '0.5px solid rgba(42,92,255,0.15)', borderRadius: 10, padding: '12px 16px', display: 'flex', gap: 4, alignItems: 'center' }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ width: 6, height: 6, background: isTranscribing ? '#F59E0B' : '#8B96FF', borderRadius: '50%', animation: `pulse 1.2s infinite ${i * 0.2}s` }} />
            ))}
            {isTranscribing && <span style={{ fontSize: 10, color: '#F59E0B', marginLeft: 6 }}>Processing your voice...</span>}
          </div>
        )}
      </div>

      {/* Input */}
      {!isEnded ? (
        <div style={{ padding: '10px 16px', borderTop: '0.5px solid rgba(255,255,255,0.05)' }}>
          {micError && (
            <div style={{ fontSize: 11, color: '#F87171', marginBottom: 6, textAlign: 'center', padding: '4px 8px', background: 'rgba(239,68,68,0.08)', borderRadius: 6 }}>
              ⚠ {micError}
            </div>
          )}
          {/* Recording reminder */}
          {isRecording && (
            <div style={{ fontSize: 11, color: '#DC2626', marginBottom: 6, textAlign: 'center', padding: '4px 8px', background: 'rgba(220,38,38,0.08)', borderRadius: 6, fontWeight: 600, animation: 'pulse 1s infinite' }}>
              ● Recording — keep holding until you finish your complete answer
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onTouchStart={(e) => { e.preventDefault(); startRecording() }}
              onTouchEnd={(e) => { e.preventDefault(); stopRecording() }}
              disabled={isLoading || isTranscribing || isEnded}
              style={{
                width: 44, height: 44, borderRadius: 8, border: 'none',
                cursor: isLoading || isTranscribing ? 'not-allowed' : 'pointer',
                flexShrink: 0, fontSize: 20,
                background: isRecording ? '#DC2626' : '#1E293B',
                boxShadow: isRecording ? '0 0 20px rgba(220,38,38,0.7)' : 'none',
                transition: 'all 0.15s',
                userSelect: 'none' as any
              }}
            >
              {isTranscribing ? '⏳' : isRecording ? '⏹' : '🎤'}
            </button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={isRecording ? '● Recording... keep holding until done' : isTranscribing ? 'Processing...' : 'Hold 🎤 for your full answer, or type here...'}
              disabled={isLoading || isRecording || isTranscribing}
              rows={1}
              style={{ flex: 1, background: '#16181F', border: '0.5px solid rgba(255,255,255,0.08)', color: '#F0EDE8', fontFamily: 'inherit', fontSize: 13, padding: '9px 12px', borderRadius: 8, outline: 'none', resize: 'none' }}
            />
            <button
              onClick={sendMessage}
              disabled={isLoading || !input.trim() || isRecording || isTranscribing}
              style={{ width: 44, height: 44, background: (isLoading || !input.trim()) ? '#1a1a22' : '#2563EB', border: 'none', borderRadius: 8, cursor: (isLoading || !input.trim()) ? 'not-allowed' : 'pointer', color: '#fff', fontSize: 18, flexShrink: 0, transition: 'background 0.15s' }}
            >→</button>
          </div>
        </div>
      ) : (
        <div style={{ padding: 16, textAlign: 'center', borderTop: '0.5px solid rgba(255,255,255,0.05)' }}>
          <div style={{ fontSize: 14, color: '#8B96FF', marginBottom: 8 }}>
            Session ended · Score: {overallScore ?? '—'}/100
          </div>
          <div style={{ fontSize: 12, color: 'rgba(240,237,232,0.3)', marginBottom: 12 }}>
            Redirecting to your report...
          </div>
          <button
            onClick={() => router.push('/report')}
            style={{ background: '#1E3A8A', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            View Full Report →
          </button>
        </div>
      )}

      {/* Bottom */}
      <div style={{ background: '#0D0F14', borderTop: '0.5px solid rgba(255,255,255,0.04)', padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 10, color: 'rgba(240,237,232,0.2)' }}>Q{questionCount} · {getPlanLabel(CONFIG.plan)}</div>
        <div style={{ background: 'rgba(42,92,255,0.08)', border: '0.5px solid rgba(42,92,255,0.15)', borderRadius: 6, padding: '4px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: 8, color: 'rgba(240,237,232,0.2)', textTransform: 'uppercase' }}>Performance</div>
          <div style={{ fontWeight: 800, fontSize: 15, color: '#8B96FF' }}>{overallScore ?? '—'}</div>
        </div>
        <button
          onClick={() => {
            if (confirm('End interview?')) {
              endSession(messagesRef.current, overallScoreRef.current)
            }
          }}
          style={{ background: 'rgba(239,68,68,0.07)', border: '0.5px solid rgba(239,68,68,0.18)', color: '#F87171', borderRadius: 6, padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
        >End</button>
      </div>

      <style>{`@keyframes pulse{0%,80%,100%{opacity:0.3}40%{opacity:1}}`}</style>
    </div>
  )
}
