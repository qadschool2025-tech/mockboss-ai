'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

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

function buildConfig() {
  let raw: any = {}
  if (typeof window !== 'undefined') {
    try {
      const stored = sessionStorage.getItem('barbaros_config')
      if (stored) raw = JSON.parse(stored)
    } catch {}
  }
  return {
    sessionId:       raw.sessionId       ?? `session_${Date.now()}`,
    candidateName:   raw.candidateName   ?? 'Candidate',
    jobTitle:        raw.jobTitle         ?? 'Professional',
    institution:     raw.institution      ?? 'Organisation',
    sector:          raw.sector           ?? 'General',
    yearsExperience: raw.yearsExperience  ?? '3 years',
    language:        raw.language          ?? 'en',
    plan:            raw.plan              ?? 'go',
    jobRequirements: raw.jobRequirements   ?? '',
    hasCv:           Boolean(raw.hasCv),
    cvFileName:      raw.cvFileName         ?? '',
    cvMimeType:      raw.cvMimeType         ?? '',
    cvBase64:        raw.cvBase64           ?? '',
    difficulty:      'standard',
  }
}

function scoreLabel(s: number): { text: string; color: string } {
  if (s >= 80) return { text: 'Strong',        color: '#22C55E' }
  if (s >= 65) return { text: 'Good',          color: '#86EFAC' }
  if (s >= 50) return { text: 'Fair',          color: '#F59E0B' }
  return            { text: 'Needs clarity', color: '#F87171' }
}

function InterviewRoom() {
  const [CONFIG] = useState(() => buildConfig())

  const [messages, setMessages]             = useState<Message[]>([])
  const [input, setInput]                   = useState('')
  const [isLoading, setIsLoading]           = useState(false)
  const [sessionStartTime]                  = useState(Date.now())
  const [timeLeft, setTimeLeft]             = useState(() => {
    const limits: Record<string, number> = { go: 15*60, pro: 30*60, expert: 45*60 }
    return limits[CONFIG.plan] ?? 15*60
  })
  const [questionCount, setQuestionCount]   = useState(1)
  const [isEnded, setIsEnded]               = useState(false)
  const [isMuted, setIsMuted]               = useState(false)
  const [isRecording, setIsRecording]       = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [audioReady, setAudioReady]         = useState(false)
  const [pendingAudio, setPendingAudio]     = useState<string | null>(null)
  const [micError, setMicError]             = useState<string | null>(null)
  const [isGenerating, setIsGenerating]     = useState(false)
  const [genStep, setGenStep]               = useState(0)
  const [genError, setGenError]             = useState<string | null>(null)

  const chatRef           = useRef<HTMLDivElement>(null)
  const inputRef          = useRef<HTMLTextAreaElement>(null)
  const silenceTimer      = useRef<any>(null)
  const messagesRef       = useRef<Message[]>([])
  const isLoadingRef      = useRef(false)
  const isEndedRef        = useRef(false)
  const isRecordingRef    = useRef(false)
  const isTranscribingRef = useRef(false)
  const audioRef          = useRef<HTMLAudioElement | null>(null)
  const isMutedRef        = useRef(false)
  const audioReadyRef     = useRef(false)
  const mediaRecorderRef  = useRef<MediaRecorder | null>(null)
  const audioChunksRef    = useRef<Blob[]>([])
  const wasNearBottomRef  = useRef(true)
  const lastMessageCountRef = useRef(0)

  useEffect(() => { messagesRef.current     = messages     }, [messages])
  useEffect(() => { isLoadingRef.current    = isLoading    }, [isLoading])
  useEffect(() => { isEndedRef.current      = isEnded      }, [isEnded])
  useEffect(() => { isRecordingRef.current  = isRecording  }, [isRecording])
  useEffect(() => { isTranscribingRef.current = isTranscribing }, [isTranscribing])

  useEffect(() => {
    const id = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(id); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (timeLeft === 0 && !isEndedRef.current) setIsEnded(true)
  }, [timeLeft])

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  useEffect(() => {
    if (audioReady && pendingAudio) {
      playAudioDirect(pendingAudio)
      setPendingAudio(null)
    }
  }, [audioReady, pendingAudio])

  const handleScroll = useCallback(() => {
    const el = chatRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    wasNearBottomRef.current = distanceFromBottom < 100
  }, [])

  useEffect(() => {
    if (messages.length === lastMessageCountRef.current) return
    lastMessageCountRef.current = messages.length
    if (!wasNearBottomRef.current) return
    const frame = requestAnimationFrame(() => {
      if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
    })
    return () => cancelAnimationFrame(frame)
  }, [messages, isLoading])

  const playAudioDirect = (audioBase64: string) => {
    if (isMutedRef.current) return
    try {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; audioRef.current = null }
      const audio = new Audio(`data:audio/mpeg;base64,${audioBase64}`)
      audioRef.current = audio
      audio.onended = () => { if (audioRef.current === audio) audioRef.current = null }
      audio.play().catch(err => console.warn('Audio play failed:', err))
    } catch (err) { console.warn('Audio error:', err) }
  }

  const playAudio = useCallback((audioBase64: string) => {
    if (isMutedRef.current) return
    if (!audioReadyRef.current) { setPendingAudio(audioBase64); return }
    playAudioDirect(audioBase64)
  }, [])

  const handleFirstInteraction = useCallback(() => {
    if (!audioReadyRef.current) { audioReadyRef.current = true; setAudioReady(true) }
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
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      const mediaRecorder = new MediaRecorder(stream, { mimeType })
      audioChunksRef.current = []
      mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      mediaRecorder.start()
      mediaRecorderRef.current = mediaRecorder
      setIsRecording(true)
    } catch (err: any) {
      setMicError(err.name === 'NotAllowedError' ? 'Microphone access denied' : 'Could not access microphone')
    }
  }

  const stopRecording = async () => {
    if (!isRecordingRef.current || !mediaRecorderRef.current) return
    setIsRecording(false)
    const mediaRecorder = mediaRecorderRef.current
    mediaRecorder.stream.getTracks().forEach(t => t.stop())
    await new Promise<void>(resolve => {
      mediaRecorder.onstop = () => resolve()
      mediaRecorder.stop()
    })
    const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
    if (blob.size < 1000) return
    setIsTranscribing(true)
    try {
      const fd = new FormData()
      fd.append('audio', blob, 'recording.webm')
      const res = await fetch('/api/transcribe', { method: 'POST', body: fd })
      const data = await res.json()
      const text = data.text?.trim()
      if (text) {
        const userMsg: Message = { role: 'user', content: text }
        const newMessages = [...messagesRef.current, userMsg]
        setMessages(newMessages)
        setInput('')
        await callAdam(newMessages)
      }
    } catch (err) { console.error('Transcription error:', err) }
    finally { setIsTranscribing(false) }
  }

  // MIC FIX: single click toggles recording on/off (was push-to-hold).
  // Tap once → start. Tap again → stop & send.
  const toggleRecording = () => {
    if (isLoading || isTranscribing || isEnded) return
    if (isRecordingRef.current) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  const callAdam = async (msgs: Message[]) => {
    setIsLoading(true)
    handleFirstInteraction()
    try {
      const res = await fetch('/api/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: CONFIG.sessionId,
          config: CONFIG,
          messages: msgs,
          sessionStartTime
        })
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)

      const newMsg: Message = { role: 'assistant', content: data.content, score: data.score }
      setMessages(prev => [...prev, newMsg])

      if (data.audioBase64) playAudio(data.audioBase64)

      if (data.score) setQuestionCount(prev => prev + 1)

      if (data.isEndOfSession) { setIsEnded(true); return }
      resetSilenceTimer()
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
    const newMessages = [...messagesRef.current, userMsg]
    setMessages(newMessages)
    setInput('')
    await callAdam(newMessages)
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const genSteps = CONFIG.language === 'ar'
    ? ['تحليل اتساق إجاباتك...', 'مراجعة العمق التخصصي...', 'رصد الأنماط السلوكية...', 'إعداد تقييم التوظيف...']
    : ['Analyzing answer consistency...', 'Reviewing domain depth...', 'Detecting behavioral patterns...', 'Generating hiring evaluation...']

  const goToReport = async () => {
    setGenError(null)
    setIsGenerating(true)
    setGenStep(0)
    const stepTimer = setInterval(() => {
      setGenStep(prev => (prev + 1) % genSteps.length)
    }, 2200)

    try {
      const res = await fetch('/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messagesRef.current,
          config: {
            candidateName:   CONFIG.candidateName,
            jobTitle:        CONFIG.jobTitle,
            institution:     CONFIG.institution,
            sector:          CONFIG.sector,
            yearsExperience: CONFIG.yearsExperience,
            language:        CONFIG.language,
            plan:            CONFIG.plan,
          },
        }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Report generation failed')

      sessionStorage.setItem('barbaros_report', JSON.stringify({
        report:          data.report,
        candidateName:   CONFIG.candidateName,
        jobTitle:        CONFIG.jobTitle,
        institution:     CONFIG.institution,
        sector:          CONFIG.sector,
        yearsExperience: CONFIG.yearsExperience,
        language:        CONFIG.language,
        plan:            CONFIG.plan,
      }))

      clearInterval(stepTimer)
      window.location.href = '/report'
    } catch (err: any) {
      clearInterval(stepTimer)
      setIsGenerating(false)
      setGenError(
        CONFIG.language === 'ar'
          ? 'تعذّر إنشاء التقرير. حاول مرة أخرى.'
          : 'Could not generate the report. Please try again.'
      )
    }
  }

  return (
    <div
      onClick={handleFirstInteraction}
      style={{ fontFamily: 'system-ui, sans-serif', background: '#0B0D11', color: '#F0EDE8', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ background: '#0F1117', borderBottom: '0.5px solid rgba(255,255,255,0.07)', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 800, fontSize: 16 }}>
          <span style={{ color: '#F0EDE8' }}>Barbar</span><span style={{ color: '#CC785C' }}>os</span>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>{CONFIG.jobTitle} · {CONFIG.institution}</div>
          <div style={{ fontSize: 10, color: 'rgba(240,237,232,0.4)' }}>Based on highest hiring standards</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={toggleMute}
            style={{ background: 'none', border: '0.5px solid rgba(255,255,255,0.2)', borderRadius: 6, color: '#F0EDE8', padding: '3px 8px', cursor: 'pointer', fontSize: 14 }}
          >
            {isMuted ? '🔇' : '🔊'}
          </button>
          <span style={{ fontSize: 10, color: '#F87171', background: 'rgba(220,38,38,0.1)', border: '0.5px solid rgba(220,38,38,0.2)', borderRadius: 20, padding: '3px 8px' }}>● Live</span>
          <span style={{ fontWeight: 800, fontSize: 16, color: timeLeft < 180 ? '#F87171' : '#F0EDE8' }}>
            {formatTime(timeLeft)}
          </span>
        </div>
      </div>

      <div style={{ background: '#0F1117', borderBottom: '0.5px solid rgba(255,255,255,0.04)', padding: '6px 20px', display: 'flex', gap: 20, fontSize: 11 }}>
        <span style={{ color: 'rgba(240,237,232,0.4)' }}>
          Question: <strong style={{ color: '#8B96FF' }}>{questionCount}</strong>
        </span>
        <span style={{ color: 'rgba(240,237,232,0.4)', marginLeft: 'auto' }}>
          {CONFIG.candidateName} · {CONFIG.sector}
        </span>
      </div>

      <div
        ref={chatRef}
        onScroll={handleScroll}
        style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        {messages.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 8, opacity: 0.5, paddingTop: 60 }}>
            <div style={{ fontSize: 36 }}>🎙</div>
            <div style={{ fontSize: 13 }}>Ready when you are, {CONFIG.candidateName}</div>
            <button
              type="button"
              onClick={() => callAdam([])}
              style={{ marginTop: 12, padding: '10px 24px', background: '#2563EB', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, cursor: 'pointer' }}
            >
              Start Interview
            </button>
          </div>
        )}

        {messages.map((msg, i) => {
          const label = msg.score?.score !== undefined ? scoreLabel(msg.score.score) : null
          return (
            <div
              key={i}
              style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'assistant' ? 'flex-start' : 'flex-end', maxWidth: '85%', alignSelf: msg.role === 'assistant' ? 'flex-start' : 'flex-end' }}
            >
              <div style={{ background: msg.role === 'assistant' ? '#1a1f2e' : '#1E3A8A', border: msg.role === 'assistant' ? '0.5px solid rgba(42,92,255,0.18)' : 'none', borderRadius: 10, padding: '10px 13px', fontSize: 13, lineHeight: 1.7 }}>
                <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.5, marginBottom: 4, textTransform: 'uppercase', color: msg.role === 'assistant' ? '#8B96FF' : 'rgba(255,255,255,0.5)' }}>
                  {msg.role === 'assistant'
                    ? <><span style={{ color: '#F0EDE8' }}>Barbar</span><span style={{ color: '#CC785C' }}>os</span> Interviewer</>
                    : CONFIG.candidateName
                  }
                </div>
                {msg.content}
                {label && (
                  <div style={{ marginTop: 6, padding: '2px 8px', background: 'rgba(255,255,255,0.04)', borderRadius: 5, fontSize: 10, color: label.color, display: 'inline-block' }}>
                    ● {label.text}
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {isLoading && (
          <div style={{ alignSelf: 'flex-start', background: '#1a1f2e', border: '0.5px solid rgba(42,92,255,0.15)', borderRadius: 10, padding: '12px 16px', display: 'flex', gap: 4, alignItems: 'center' }}>
            {[0,1,2].map(i => (
              <div key={i} style={{ width: 6, height: 6, background: '#8B96FF', borderRadius: '50%', animation: `pulse 1.2s infinite ${i * 0.2}s` }} />
            ))}
            {isTranscribing && <span style={{ fontSize: 10, color: '#F59E0B', marginLeft: 6 }}>Processing your voice...</span>}
          </div>
        )}
      </div>

      {!isEnded ? (
        <div style={{ padding: '10px 16px', borderTop: '0.5px solid rgba(255,255,255,0.05)' }}>
          {micError && (
            <div style={{ fontSize: 11, color: '#F87171', marginBottom: 6, textAlign: 'center', padding: '4px 8px', background: 'rgba(239,68,68,0.08)', borderRadius: 6 }}>
              ⚠ {micError}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={toggleRecording}
              disabled={isLoading || isTranscribing || isEnded}
              style={{
                width: 44, height: 44, borderRadius: 8, border: 'none',
                cursor: isLoading || isTranscribing ? 'not-allowed' : 'pointer',
                flexShrink: 0, fontSize: 20,
                background: isRecording ? '#DC2626' : '#1E293B',
                boxShadow: isRecording ? '0 0 20px rgba(220,38,38,0.7)' : 'none',
                transition: 'all 0.15s',
                userSelect: 'none' as any,
                touchAction: 'none',
              }}
            >
              {isTranscribing ? '⏳' : isRecording ? '⏹' : '🎤'}
            </button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={isRecording ? '● Recording... tap to send' : isTranscribing ? 'Processing...' : 'Tap 🎤 to speak, or type here...'}
              disabled={isLoading || isRecording || isTranscribing}
              rows={1}
              style={{ flex: 1, background: '#16181F', border: '0.5px solid rgba(255,255,255,0.08)', color: '#F0EDE8', fontFamily: 'inherit', fontSize: 13, padding: '9px 12px', borderRadius: 8, outline: 'none', resize: 'none' }}
            />
            <button
              type="button"
              onClick={sendMessage}
              disabled={isLoading || !input.trim() || isRecording || isTranscribing}
              style={{ width: 44, height: 44, background: (isLoading || !input.trim()) ? '#1a1a22' : '#2563EB', border: 'none', borderRadius: 8, cursor: (isLoading || !input.trim()) ? 'not-allowed' : 'pointer', color: '#fff', fontSize: 18, flexShrink: 0, transition: 'background 0.15s' }}
            >→</button>
          </div>
        </div>
      ) : (
        <div style={{ padding: '24px 20px', borderTop: '0.5px solid rgba(255,255,255,0.05)', background: '#0F1117' }}>
          {isGenerating ? (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginBottom: 16 }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{ width: 8, height: 8, background: '#CC785C', borderRadius: '50%', animation: `pulse 1.2s infinite ${i * 0.2}s` }} />
                ))}
              </div>
              <div style={{ fontSize: 14, color: '#F0EDE8', fontWeight: 600, minHeight: 20, transition: 'opacity 0.3s' }}>
                {genSteps[genStep]}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(240,237,232,0.4)', marginTop: 8 }}>
                {CONFIG.language === 'ar' ? 'قد يستغرق هذا بضع ثوانٍ' : 'This may take a few seconds'}
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 13, color: '#8B96FF', marginBottom: 20, textAlign: 'center', fontWeight: 600 }}>
                {CONFIG.language === 'ar' ? 'انتهت المقابلة — تقريرك جاهز' : 'Interview complete — your report is ready'}
              </div>
              {genError && (
                <div style={{ fontSize: 12, color: '#F87171', marginBottom: 14, textAlign: 'center', padding: '6px 10px', background: 'rgba(239,68,68,0.08)', borderRadius: 8 }}>
                  {genError}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  type="button"
                  onClick={goToReport}
                  style={{
                    padding: '13px 24px',
                    background: '#CC785C',
                    border: 'none',
                    borderRadius: 10,
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 800,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    width: '100%',
                  }}
                >
                  {CONFIG.language === 'ar' ? 'عرض التقرير الكامل ←' : 'View Full Report →'}
                </button>
                <button
                  type="button"
                  onClick={() => { window.location.href = '/onboarding' }}
                  style={{
                    padding: '11px 24px',
                    background: 'transparent',
                    border: '0.5px solid rgba(255,255,255,0.15)',
                    borderRadius: 10,
                    color: 'rgba(240,237,232,0.5)',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    width: '100%',
                  }}
                >
                  {CONFIG.language === 'ar' ? 'مقابلة جديدة' : 'Start New Interview'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50%       { opacity: 1;   transform: scale(1.2); }
        }
      `}</style>
    </div>
  )
}

export default function InterviewPage() {
  return <InterviewRoom />
}
