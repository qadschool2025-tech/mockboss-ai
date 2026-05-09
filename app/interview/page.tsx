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
  const [adamSpeaking, setAdamSpeaking] = useState(false)
  const [showText, setShowText] = useState(false)
  const [lastAdamText, setLastAdamText] = useState('')

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
      setAdamSpeaking(true)
      audio.onended = () => setAdamSpeaking(false)
      audio.play().catch(err => {
        console.warn('Audio play failed:', err)
        setAdamSpeaking(false)
      })
    } catch (err) {
      console.warn('Audio error:', err)
      setAdamSpeaking(false)
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
    if (next && audioRef.current) {
      audioRef.current.pause()
      setAdamSpeaking(false)
    }
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
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
        setAdamSpeaking(false)
      }

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
      formData.append('language', CONFIG.language === 'ar' ? 'ar' : CONFIG.language === 'mixed' ? 'ar' : 'en')

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
      setMicError('Transcription failed — please try again')
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
      setLastAdamText(data.content)

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
    }
  }

  const sendMessage = async () => {
    if (!input.trim() || isLoading || isEnded) return
    handleFirstInteraction()
    if (silenceTimer.current) clearTimeout(silenceTimer.current)
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; setAdamSpeaking(false) }
    const userMsg: Message = { role: 'user', content: input.trim() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    await callAdam(newMessages)
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
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

      {/* Main Room */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', gap: 24 }}>

        {/* Adam Card */}
        <div style={{ width: '100%', maxWidth: 420, background: '#111520', border: `1px solid ${adamSpeaking ? 'rgba(42,92,255,0.6)' : 'rgba(42,92,255,0.15)'}`, borderRadius: 20, padding: '28px 24px', textAlign: 'center', transition: 'all 0.3s', boxShadow: adamSpeaking ? '0 0 30px rgba(42,92,255,0.12)' : 'none' }}>

          <div style={{ width: 80, height: 80, background: adamSpeaking ? '#1d45cc' : '#2563EB', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, margin: '0 auto 16px', transition: 'all 0.3s', boxShadow: adamSpeaking ? '0 0 24px rgba(37,99,235,0.5)' : 'none' }}>
            🎯
          </div>

          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Adam Reid</div>
          <div style={{ fontSize: 11, color: 'rgba(240,237,232,0.4)', marginBottom: 20 }}>Certified Interview Evaluator · Barbaros AI</div>

          {/* Adam Voice Waves */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, height: 44, marginBottom: 8 }}>
            {adamSpeaking ? (
              [16, 28, 36, 32, 36, 24, 16].map((h, i) => (
                <div key={i} style={{ width: 4, borderRadius: 4, background: '#2563EB', animation: `wave 0.8s ease-in-out infinite`, animationDelay: `${i * 0.1}s`, height: `${h}px` }} />
              ))
            ) : isLoading ? (
              [0, 1, 2].map(i => (
                <div key={i} style={{ width: 8, height: 8, background: '#8B96FF', borderRadius: '50%', animation: `pulse 1.2s infinite ${i * 0.2}s` }} />
              ))
            ) : (
              <div style={{ fontSize: 11, color: 'rgba(240,237,232,0.3)' }}>
                {isTranscribing ? 'Processing...' : '○ Listening'}
              </div>
            )}
          </div>

          {adamSpeaking && <div style={{ fontSize: 11, color: '#8B96FF', fontWeight: 600 }}>● Speaking...</div>}

          {/* Show Text Button — Emergency */}
          {lastAdamText && !adamSpeaking && !isLoading && (
            <button
              onClick={() => setShowText(!showText)}
              style={{ marginTop: 12, background: 'none', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'rgba(240,237,232,0.3)', fontSize: 10, cursor: 'pointer', padding: '4px 10px', fontFamily: 'inherit' }}>
              {showText ? 'Hide text' : 'Show text'}
            </button>
          )}

          {/* Emergency Text */}
          {showText && lastAdamText && (
            <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12, color: 'rgba(240,237,232,0.6)', lineHeight: 1.6, textAlign: 'left' }}>
              {lastAdamText}
            </div>
          )}
        </div>

        {/* Candidate Card */}
        <div style={{ width: '100%', maxWidth: 420, background: '#111318', border: `1px solid ${isRecording ? 'rgba(220,38,38,0.5)' : isTranscribing ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.06)'}`, borderRadius: 20, padding: '20px 24px', textAlign: 'center', transition: 'all 0.3s', boxShadow: isRecording ? '0 0 20px rgba(220,38,38,0.08)' : 'none' }}>

          <div style={{ width: 56, height: 56, background: '#1a1a22', border: `2px solid ${isRecording ? '#DC2626' : 'rgba(255,255,255,0.08)'}`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 20, margin: '0 auto 10px', transition: 'all 0.3s' }}>
            {CONFIG.candidateName?.charAt(0).toUpperCase()}
          </div>

          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{CONFIG.candidateName}</div>
          <div style={{ fontSize: 10, color: 'rgba(240,237,232,0.35)', marginBottom: 14 }}>Candidate · {CONFIG.yearsExperience}</div>

          {/* Candidate Waves */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, height: 32 }}>
            {isRecording ? (
              [12, 22, 28, 22, 12].map((h, i) => (
                <div key={i} style={{ width: 4, borderRadius: 4, background: '#DC2626', animation: `wave 0.6s ease-in-out infinite`, animationDelay: `${i * 0.1}s`, height: `${h}px` }} />
              ))
            ) : isTranscribing ? (
              <div style={{ fontSize: 11, color: '#F59E0B', fontWeight: 600 }}>◌ Processing...</div>
            ) : (
              <div style={{ fontSize: 11, color: 'rgba(240,237,232,0.25)' }}>
                {isLoading ? 'Listening to Adam...' : 'Your turn'}
              </div>
            )}
          </div>

          {isRecording && (
            <div style={{ fontSize: 10, color: '#DC2626', marginTop: 8, fontWeight: 600 }}>
              ● Keep holding until you finish your complete answer
            </div>
          )}
        </div>

      </div>

      {/* Input Area */}
      {!isEnded ? (
        <div style={{ padding: '12px 16px', borderTop: '0.5px solid rgba(255,255,255,0.05)', background: '#0D0F14' }}>
          {micError && (
            <div style={{ fontSize: 11, color: '#F87171', marginBottom: 8, textAlign: 'center', padding: '6px 10px', background: 'rgba(239,68,68,0.08)', borderRadius: 8 }}>
              ⚠ {micError}
            </div>
          )}

          {!isRecording && !isLoading && !isTranscribing && (
            <div style={{ fontSize: 11, color: 'rgba(240,237,232,0.25)', textAlign: 'center', marginBottom: 8 }}>
              🎤 Hold for your <strong style={{ color: 'rgba(240,237,232,0.4)' }}>complete answer</strong> — release only when done
            </div>
          )}

          {isRecording && (
            <div style={{ fontSize: 11, color: '#DC2626', textAlign: 'center', marginBottom: 8, fontWeight: 600, animation: 'pulse 1s infinite' }}>
              ● Recording — keep holding until you finish
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onTouchStart={(e) => { e.preventDefault(); startRecording() }}
              onTouchEnd={(e) => { e.preventDefault(); stopRecording() }}
              disabled={isLoading || isTranscribing || isEnded}
              style={{ width: 52, height: 52, borderRadius: 12, border: 'none', cursor: isLoading || isTranscribing ? 'not-allowed' : 'pointer', flexShrink: 0, fontSize: 22, background: isRecording ? '#DC2626' : '#1E293B', boxShadow: isRecording ? '0 0 24px rgba(220,38,38,0.8)' : 'none', transition: 'all 0.15s', userSelect: 'none' as any }}>
              {isTranscribing ? '⏳' : isRecording ? '⏹' : '🎤'}
            </button>

            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={isRecording ? '● Recording...' : isTranscribing ? 'Processing...' : 'Or type your answer here...'}
              disabled={isLoading || isRecording || isTranscribing}
              rows={1}
              style={{ flex: 1, background: '#16181F', border: '0.5px solid rgba(255,255,255,0.08)', color: '#F0EDE8', fontFamily: 'inherit', fontSize: 13, padding: '9px 12px', borderRadius: 8, outline: 'none', resize: 'none' }}
            />

            <button
              onClick={sendMessage}
              disabled={isLoading || !input.trim() || isRecording || isTranscribing}
              style={{ width: 52, height: 52, background: (isLoading || !input.trim()) ? '#1a1a22' : '#2563EB', border: 'none', borderRadius: 12, cursor: (isLoading || !input.trim()) ? 'not-allowed' : 'pointer', color: '#fff', fontSize: 20, flexShrink: 0, transition: 'background 0.15s' }}>→</button>
          </div>
        </div>
      ) : (
        <div style={{ padding: 20, textAlign: 'center', borderTop: '0.5px solid rgba(255,255,255,0.05)', background: '#0D0F14' }}>
          <div style={{ fontSize: 14, color: '#8B96FF', marginBottom: 8 }}>Session ended · Score: {overallScore ?? '—'}/100</div>
          <div style={{ fontSize: 12, color: 'rgba(240,237,232,0.3)', marginBottom: 12 }}>Redirecting to your report...</div>
          <button onClick={() => router.push('/report')} style={{ background: '#1E3A8A', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            View Full Report →
          </button>
        </div>
      )}

      {/* Bottom Bar */}
      <div style={{ background: '#0B0D11', borderTop: '0.5px solid rgba(255,255,255,0.04)', padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 10, color: 'rgba(240,237,232,0.2)' }}>Q{questionCount} · {getPlanLabel(CONFIG.plan)}</div>
        <div style={{ background: 'rgba(42,92,255,0.08)', border: '0.5px solid rgba(42,92,255,0.15)', borderRadius: 6, padding: '4px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: 8, color: 'rgba(240,237,232,0.2)', textTransform: 'uppercase' }}>Performance</div>
          <div style={{ fontWeight: 800, fontSize: 15, color: '#8B96FF' }}>{overallScore ?? '—'}</div>
        </div>
        <button
          onClick={() => { if (confirm('End interview?')) endSession(messagesRef.current, overallScoreRef.current) }}
          style={{ background: 'rgba(239,68,68,0.07)', border: '0.5px solid rgba(239,68,68,0.18)', color: '#F87171', borderRadius: 6, padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          End
        </button>
      </div>

      <style>{`
        @keyframes pulse { 0%,80%,100%{opacity:0.3} 40%{opacity:1} }
        @keyframes wave { 0%,100%{transform:scaleY(0.5)} 50%{transform:scaleY(1)} }
      `}</style>
    </div>
  )
}
