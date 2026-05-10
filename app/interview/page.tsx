'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface Score {
  score: number
  academic_knowledge: number
  practical_experience: number
  problem_solving: number
  communication_confidence: number
  professionalism: number
  work_environment_fit: number
  language_technical: number
  hesitation_signals: number
  notes: string
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  score?: Score
  voiceAnalysis?: {
    wordsPerMinute: number
    duration: number
    wordCount: number
    confidence: string
    hesitation: string
  }
}

const CONFIG = {
  candidateName: 'Ahmed',
  jobTitle: 'Teacher',
  institution: 'XYZ School',
  sector: 'Education',
  yearsExperience: '3-5 years',
  language: 'en',
  plan: 'free',
  cvSummary: '',
  jobRequirements: '',
  isCareerSwitch: false,
}

const HESITATION_WORDS = ['um', 'uh', 'er', 'ah', 'like', 'you know', 'sort of', 'kind of', 'يعني', 'اممم', 'آه']

function highlightHesitations(text: string) {
  const words = text.split(/(\s+)/)
  return (
    <span>
      {words.map((word, i) => {
        const clean = word.toLowerCase().replace(/[.,!?]/g, '')
        const isHesitation = HESITATION_WORDS.includes(clean)
        return (
          <span key={i} style={isHesitation ? {
            color: '#F59E0B', fontWeight: 600,
            background: 'rgba(245,158,11,0.1)',
            borderRadius: 3, padding: '0 2px'
          } : {}}>
            {word}
          </span>
        )
      })}
    </span>
  )
}

export default function InterviewPage() {
  const router = useRouter()
  const TIME_LIMIT = CONFIG.plan === 'expert' ? 3600 : CONFIG.plan === 'pro' ? 1800 : 900
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isEnded, setIsEnded] = useState(false)
  const [overallScore, setOverallScore] = useState<number | null>(null)
  const [questionCount, setQuestionCount] = useState(0)
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [micError, setMicError] = useState<string | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [audioReady, setAudioReady] = useState(false)
  const [pendingAudio, setPendingAudio] = useState<string | null>(null)
  const [showTranscript, setShowTranscript] = useState(false)

  const chatRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const hasStarted = useRef(false)
  const sessionStartTime = useRef(Date.now())
  const silenceTimer = useRef<NodeJS.Timeout | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioReadyRef = useRef(false)
  const isMutedRef = useRef(false)
  const isLoadingRef = useRef(false)
  const isEndedRef = useRef(false)
  const isRecordingRef = useRef(false)
  const isTranscribingRef = useRef(false)
  const messagesRef = useRef<Message[]>([])
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { isLoadingRef.current = isLoading }, [isLoading])
  useEffect(() => { isEndedRef.current = isEnded }, [isEnded])
  useEffect(() => { isRecordingRef.current = isRecording }, [isRecording])
  useEffect(() => { isTranscribingRef.current = isTranscribing }, [isTranscribing])

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
      mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
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
      const res = await fetch('/api/transcribe', { method: 'POST', body: formData })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      if (data.text?.trim()) {
        const userMsg: Message = { role: 'user', content: data.text.trim(), voiceAnalysis: data.analysis }
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

  const callAdam = async (msgs: Message[]) => {
    setIsLoading(true)
    isLoadingRef.current = true
    if (silenceTimer.current) clearTimeout(silenceTimer.current)
    try {
      const res = await fetch('/api/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: CONFIG, messages: msgs, sessionStartTime: sessionStartTime.current })
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)

      const newMsg: Message = { role: 'assistant', content: data.content, score: data.score }
      setMessages(prev => [...prev, newMsg])

      if (data.audioBase64) playAudio(data.audioBase64)

      if (data.score) {
        setOverallScore(() => {
          const all = [...msgs.filter(m => m.score).map(m => m.score!.score), data.score.score]
          return Math.round(all.reduce((a: number, b: number) => a + b, 0) / all.length)
        })
        setQuestionCount(prev => prev + 1)
      }

      if (data.isEndOfSession) {
        setIsEnded(true)
        isEndedRef.current = true
      } else {
        resetSilenceTimer()
      }
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }])
    } finally {
      setIsLoading(false)
      isLoadingRef.current = false
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

  const handleEnd = () => {
    if (confirm(CONFIG.language === 'ar' ? 'هل تريد إنهاء المقابلة؟' : 'End the interview?')) {
      setIsEnded(true)
      isEndedRef.current = true
      if (silenceTimer.current) clearTimeout(silenceTimer.current)
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    }
  }

  const lastAdamMsg = [...messages].reverse().find(m => m.role === 'assistant')
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user' && m.content !== '[Candidate is silent]')

  return (
    <div
      onClick={handleFirstInteraction}
      style={{ fontFamily: 'system-ui, sans-serif', background: '#0B0D11', color: '#F0EDE8', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}
    >
      {/* Nav */}
      <div style={{ background: '#0F1117', borderBottom: '0.5px solid rgba(255,255,255,0.07)', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 800, fontSize: 16 }}>Mock<span style={{ color: '#E85D2F' }}>Boss</span> AI</div>
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

      {/* Faces */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '12px 16px 0' }}>
        {/* HR Evaluator */}
        <div style={{ background: '#111520', border: '0.5px solid rgba(42,92,255,0.2)', borderRadius: 10, padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 44, height: 44, background: '#2563EB', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🎯</div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700 }}>{CONFIG.institution} — HR</div>
            <div style={{ fontSize: 10, color: 'rgba(240,237,232,0.35)' }}>Certified Interview Evaluator</div>
            <div style={{ fontSize: 9, color: '#8B96FF', marginTop: 2 }}>{isLoading ? '● Speaking...' : '○ Listening'}</div>
          </div>
        </div>
        {/* Candidate */}
        <div style={{ background: '#111318', border: '0.5px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 44, height: 44, background: '#1a1a22', border: '1.5px solid rgba(255,255,255,0.08)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16 }}>
            {CONFIG.candidateName.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{CONFIG.candidateName}</div>
            <div style={{ fontSize: 10, color: 'rgba(240,237,232,0.35)' }}>Candidate · {CONFIG.yearsExperience}</div>
            <div style={{ fontSize: 9, color: 'rgba(240,237,232,0.25)', marginTop: 2 }}>
              {isRecording ? '🔴 Recording...' : isTranscribing ? '⏳ Processing...' : isLoading ? 'Listening...' : 'Your turn'}
            </div>
          </div>
        </div>
      </div>

      {/* Hybrid UI */}
      <div style={{ padding: '12px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>

        {/* HR message — always visible */}
        <div style={{ background: '#111520', border: '0.5px solid rgba(42,92,255,0.2)', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.6, color: '#8B96FF', textTransform: 'uppercase', marginBottom: 6 }}>
            {CONFIG.institution} — HR
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.7, color: '#F0EDE8', minHeight: 24 }}>
            {isLoading ? (
              <div style={{ display: 'flex', gap: 4, padding: '4px 0' }}>
                {[0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, background: '#8B96FF', borderRadius: '50%', animation: `pulse 1.2s infinite ${i*0.2}s` }} />)}
              </div>
            ) : lastAdamMsg?.content || '...'}
          </div>
        </div>

        {/* Last user answer */}
        {lastUserMsg && !isLoading && (
          <div style={{ background: '#0f1825', border: '0.5px solid rgba(37,99,235,0.2)', borderRadius: 10, padding: '10px 14px', alignSelf: 'flex-end', maxWidth: '90%' }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.6, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 6 }}>
              {CONFIG.candidateName}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.7 }}>
              {highlightHesitations(lastUserMsg.content)}
            </div>
            {lastUserMsg.voiceAnalysis && (
              <div style={{ marginTop: 6, fontSize: 10, color: 'rgba(240,237,232,0.3)', display: 'flex', gap: 10 }}>
                <span>{lastUserMsg.voiceAnalysis.wordsPerMinute} WPM</span>
                <span style={{ color: lastUserMsg.voiceAnalysis.confidence === 'high' ? '#22C55E' : lastUserMsg.voiceAnalysis.confidence === 'medium' ? '#F59E0B' : '#EF4444' }}>
                  {lastUserMsg.voiceAnalysis.confidence} confidence
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Transcript toggle */}
      <div style={{ padding: '8px 16px 0', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={(e) => { e.stopPropagation(); setShowTranscript(prev => !prev) }}
          style={{ background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'rgba(240,237,232,0.5)', padding: '4px 10px', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          {showTranscript ? '▲ Hide transcript' : '▼ Show transcript'}
        </button>
      </div>

      {/* Full transcript */}
      {showTranscript && (
        <div ref={chatRef} style={{ margin: '8px 16px 0', background: '#0D0F14', border: '0.5px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 12, maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {messages.filter(m => m.content !== '[Candidate is silent]').map((msg, i) => (
            <div key={i} style={{ maxWidth: '88%', alignSelf: msg.role === 'assistant' ? 'flex-start' : 'flex-end', background: msg.role === 'assistant' ? '#1a1f2e' : '#1E3A8A', border: msg.role === 'assistant' ? '0.5px solid rgba(42,92,255,0.18)' : 'none', borderRadius: 10, padding: '8px 12px', fontSize: 12, lineHeight: 1.6 }}>
              <div style={{ fontSize: 8, fontWeight: 600, letterSpacing: 0.5, marginBottom: 3, textTransform: 'uppercase', color: msg.role === 'assistant' ? '#8B96FF' : 'rgba(255,255,255,0.4)' }}>
                {msg.role === 'assistant' ? `${CONFIG.institution} — HR` : CONFIG.candidateName}
              </div>
              {msg.role === 'user' ? highlightHesitations(msg.content) : msg.content}
              {msg.score && (
                <div style={{ marginTop: 4, fontSize: 9, color: '#8B96FF' }}>Score: {msg.score.score}/100</div>
              )}
            </div>
          ))}
          {isLoading && (
            <div style={{ alignSelf: 'flex-start', background: '#1a1f2e', borderRadius: 10, padding: '10px 14px', display: 'flex', gap: 4 }}>
              {[0,1,2].map(i => <div key={i} style={{ width: 5, height: 5, background: '#8B96FF', borderRadius: '50%', animation: `pulse 1.2s infinite ${i*0.2}s` }} />)}
            </div>
          )}
        </div>
      )}

      <div style={{ flex: 1 }} />

      {/* Mic error */}
      {micError && (
        <div style={{ margin: '0 16px', padding: '8px 12px', background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)', borderRadius: 8, fontSize: 11, color: '#F87171' }}>
          {micError}
        </div>
      )}

      {/* Input */}
      {!isEnded ? (
        <div style={{ padding: '10px 16px', display: 'flex', gap: 8, borderTop: '0.5px solid rgba(255,255,255,0.05)', alignItems: 'flex-end' }}>
          <button
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            disabled={isLoading || isTranscribing || isEnded}
            style={{
              width: 44, height: 44, flexShrink: 0, borderRadius: 10, border: 'none', cursor: 'pointer',
              background: isRecording ? '#EF4444' : isTranscribing ? '#92400E' : 'rgba(42,92,255,0.15)',
              color: isRecording ? '#fff' : '#8B96FF', fontSize: 18,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s'
            }}
          >
            {isTranscribing ? '⏳' : isRecording ? '⏹' : '🎙️'}
          </button>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={CONFIG.language === 'ar' ? 'اكتب إجابتك واضغط Enter...' : 'Type your answer and press Enter...'}
            disabled={isLoading}
            rows={1}
            style={{ flex: 1, background: '#16181F', border: '0.5px solid rgba(255,255,255,0.08)', color: '#F0EDE8', fontFamily: 'inherit', fontSize: 13, padding: '9px 12px', borderRadius: 8, outline: 'none', resize: 'none', direction: CONFIG.language === 'ar' ? 'rtl' : 'ltr' }}
          />
          <button
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            style={{ width: 44, height: 44, background: (isLoading || !input.trim()) ? '#1a1a22' : '#2563EB', border: 'none', borderRadius: 8, cursor: (isLoading || !input.trim()) ? 'not-allowed' : 'pointer', color: '#fff', fontSize: 18, flexShrink: 0, transition: 'background 0.15s' }}
          >→</button>
        </div>
      ) : (
        <div style={{ padding: 16, textAlign: 'center', borderTop: '0.5px solid rgba(255,255,255,0.05)' }}>
          <div style={{ fontSize: 14, color: '#8B96FF', marginBottom: 8 }}>Session ended · Score: {overallScore ?? '—'}/100</div>
          <button
            onClick={() => router.push('/report')}
            style={{ background: '#1E3A8A', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >View Full Report →</button>
        </div>
      )}

      {/* Bottom bar */}
      <div style={{ background: '#0D0F14', borderTop: '0.5px solid rgba(255,255,255,0.04)', padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 10, color: 'rgba(240,237,232,0.2)' }}>Q {questionCount}</div>
        <div style={{ background: 'rgba(42,92,255,0.08)', border: '0.5px solid rgba(42,92,255,0.15)', borderRadius: 6, padding: '4px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: 8, color: 'rgba(240,237,232,0.2)', textTransform: 'uppercase' }}>Score</div>
          <div style={{ fontWeight: 800, fontSize: 15, color: '#8B96FF' }}>{overallScore ?? '—'}</div>
        </div>
        <button
          onClick={handleEnd}
          style={{
            background: 'rgba(239,68,68,0.1)',
            border: '0.5px solid rgba(239,68,68,0.3)',
            color: '#F87171', borderRadius: 8,
            padding: '8px 20px',
            fontSize: 13, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit'
          }}
        >
          {CONFIG.language === 'ar' ? 'إنهاء المقابلة' : 'End Interview'}
        </button>
      </div>

      <style>{`@keyframes pulse{0%,80%,100%{opacity:0.3}40%{opacity:1}}`}</style>
    </div>
  )
}
