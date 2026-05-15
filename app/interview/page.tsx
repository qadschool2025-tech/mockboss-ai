'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { loadConfig } from '../../lib/getInterviewConfig'

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
  coaching_note?: string
  question_type?: string
}

const getPlanTime = (plan: string) => {
  if (plan === 'go') return 15 * 60
  if (plan === 'pro') return 30 * 60
  if (plan === 'expert') return 60 * 60
  return 15 * 60
}

const hesitationWords = {
  en: ['um', 'uh', 'er', 'like', 'you know', 'basically', 'literally', 'actually', 'so', 'right'],
  ar: ['يعني', 'اممم', 'اهه', 'كيف', 'هيك', 'يلا', 'طب'],
}

const highlightHesitation = (text: string, lang: string) => {
  const words = lang === 'ar' ? hesitationWords.ar : hesitationWords.en
  let result = text
  words.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi')
    result = result.replace(regex, `<mark style="background:rgba(204,120,92,0.25);color:#CC785C;border-radius:3px;padding:0 2px;font-weight:700">${word}</mark>`)
  })
  return result
}

const QUESTION_TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  HR:           { bg: 'rgba(59,130,246,0.1)',  color: '#3B82F6' },
  Technical:    { bg: 'rgba(16,185,129,0.1)',  color: '#10B981' },
  Behavioral:   { bg: 'rgba(139,92,246,0.1)',  color: '#8B5CF6' },
  Scenario:     { bg: 'rgba(245,158,11,0.1)',  color: '#F59E0B' },
  Pressure:     { bg: 'rgba(239,68,68,0.1)',   color: '#EF4444' },
  CV_Deep_Dive: { bg: 'rgba(204,120,92,0.1)',  color: '#CC785C' },
}

const translations = {
  en: {
    basedOn: 'Based on highest hiring standards',
    speaking: '● Speaking...',
    listening: '○ Listening',
    processing: 'Processing...',
    candidate: 'Candidate',
    yourTurn: 'Your turn',
    listeningToInterviewer: 'Listening to Interviewer...',
    tapToRecord: '🎤 Tap mic to start recording',
    tapToStop: '🔴 Tap again to stop & send your answer',
    recording: '● Recording...',
    typeHere: 'Or type your answer here...',
    micDenied: 'Microphone access denied — please allow mic permission',
    transcribeFailed: 'Transcription failed — please try again',
    sessionEnded: 'Session ended',
    score: 'Score',
    redirecting: 'Redirecting to your report...',
    viewReport: 'View Full Report →',
    performance: 'Performance',
    end: 'End Interview',
    endConfirm: 'End interview?',
    question: 'Q',
    poweredBy: 'Developed by certified HR professionals, powered by AI',
    startBtn: 'Enter Interview Room →',
    startHint: 'Click to start and enable audio',
    showTranscript: 'Show Transcript',
    hideTranscript: 'Hide Transcript',
    transcript: 'Conversation',
    recruiterNote: 'Recruiter Note',
  },
  ar: {
    basedOn: 'وفق أعلى معايير التوظيف',
    speaking: '● يتحدث...',
    listening: '○ يستمع',
    processing: 'جاري المعالجة...',
    candidate: 'مرشح',
    yourTurn: 'دورك',
    listeningToInterviewer: 'يستمع للمحاور...',
    tapToRecord: '🎤 اضغط على المايك للبدء',
    tapToStop: '🔴 اضغط مجدداً لإيقاف التسجيل وإرسال إجابتك',
    recording: '● جاري التسجيل...',
    typeHere: 'أو اكتب إجابتك هنا...',
    micDenied: 'تم رفض الوصول للميكروفون — يرجى السماح بالإذن',
    transcribeFailed: 'فشل التحويل — يرجى المحاولة مجدداً',
    sessionEnded: 'انتهت الجلسة',
    score: 'النتيجة',
    redirecting: 'جاري التحويل إلى تقريرك...',
    viewReport: 'عرض التقرير الكامل ←',
    performance: 'الأداء',
    end: 'إنهاء المقابلة',
    endConfirm: 'إنهاء المقابلة؟',
    question: 'س',
    poweredBy: 'طُوِّر بمشاركة متخصصين معتمدين في الموارد البشرية، مدعوم بالذكاء الاصطناعي',
    startBtn: 'ادخل غرفة المقابلة ←',
    startHint: 'اضغط للبدء وتفعيل الصوت',
    showTranscript: 'عرض المحادثة',
    hideTranscript: 'إخفاء المحادثة',
    transcript: 'المحادثة',
    recruiterNote: 'ملاحظة المحاور',
  }
}

const Barbaros = ({ size = 22 }: { size?: number }) => (
  <span style={{ fontWeight: 900, fontSize: size }}>
    <span style={{ color: '#1A1A1A' }}>Barbar</span>
    <span style={{ color: '#CC785C' }}>os</span>
  </span>
)

export default function InterviewPage() {
  const router = useRouter()

const [CONFIG] = useState(() => loadConfig())

  const t = translations[CONFIG.language === 'ar' ? 'ar' : 'en']
  const isRTL = CONFIG.language === 'ar'

  const [started, setStarted] = useState(false)
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
  const [interviewerSpeaking, setInterviewerSpeaking] = useState(false)
  const [lastInterviewerText, setLastInterviewerText] = useState('')
  const [lastQuestionType, setLastQuestionType] = useState<string | null>(null)
  const [lastCoachingNote, setLastCoachingNote] = useState<string | null>(null)
  const [showTranscript, setShowTranscript] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)

  const inputRef = useRef<HTMLTextAreaElement>(null)
  const hasStarted = useRef(false)
  const silenceTimer = useRef<any>(null)
  const recordingTimer = useRef<any>(null)
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
  const transcriptEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { isLoadingRef.current = isLoading }, [isLoading])
  useEffect(() => { isEndedRef.current = isEnded }, [isEnded])
  useEffect(() => { isRecordingRef.current = isRecording }, [isRecording])
  useEffect(() => { isTranscribingRef.current = isTranscribing }, [isTranscribing])
  useEffect(() => { overallScoreRef.current = overallScore }, [overallScore])

  useEffect(() => {
    if (showTranscript && transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, showTranscript])

  useEffect(() => {
    if (audioReady && pendingAudio) {
      playAudioDirect(pendingAudio)
      setPendingAudio(null)
    }
  }, [audioReady, pendingAudio])

  useEffect(() => {
    if (isRecording) {
      setRecordingSeconds(0)
      recordingTimer.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1)
      }, 1000)
    } else {
      clearInterval(recordingTimer.current)
      setRecordingSeconds(0)
    }
    return () => clearInterval(recordingTimer.current)
  }, [isRecording])

  const formatRecordingTime = (secs: number) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

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
      setInterviewerSpeaking(true)
      audio.onended = () => setInterviewerSpeaking(false)
      audio.play().catch(err => {
        console.warn('Audio play failed:', err)
        setInterviewerSpeaking(false)
      })
    } catch (err) {
      console.warn('Audio error:', err)
      setInterviewerSpeaking(false)
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
      setInterviewerSpeaking(false)
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

  const toggleRecording = async () => {
    if (isLoading || isTranscribing || isEnded) return

    if (isRecordingRef.current) {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop()
        setIsRecording(false)
      }
    } else {
      try {
        handleFirstInteraction()
        setMicError(null)
        if (silenceTimer.current) clearTimeout(silenceTimer.current)
        if (audioRef.current) {
          audioRef.current.pause()
          audioRef.current = null
          setInterviewerSpeaking(false)
        }
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
        mediaRecorderRef.current = mediaRecorder
        audioChunksRef.current = []
        mediaRecorder.ondataavailable = e => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data)
        }
        mediaRecorder.onstop = async () => {
          stream.getTracks().forEach(track => track.stop())
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
          await transcribeAudio(audioBlob)
        }
        mediaRecorder.start()
        setIsRecording(true)
      } catch (err: any) {
        setMicError(t.micDenied)
      }
    }
  }

  const transcribeAudio = async (audioBlob: Blob) => {
    setIsTranscribing(true)
    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, 'recording.webm')
      formData.append('language', CONFIG.language === 'ar' ? 'ar' : CONFIG.language === 'mixed' ? 'ar' : 'en')
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
      setMicError(t.transcribeFailed)
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

  // ✅ تعديل: endSession يحفظ barbaros_report أيضاً
  const endSession = (msgs: Message[], finalScore: number | null) => {
    const scored = msgs.filter(m => m.score)
    const reportData = {
      candidateName:   CONFIG.candidateName,
      jobTitle:        CONFIG.jobTitle,
      institution:     CONFIG.institution,
      sector:          CONFIG.sector,
      yearsExperience: CONFIG.yearsExperience,
      language:        CONFIG.language,
      plan:            CONFIG.plan,
      finalScore:      finalScore ?? 0,
      scores:          scored.map(m => m.score),
      messages:        msgs,
    }
    sessionStorage.setItem('barbaros_report',   JSON.stringify(reportData))
    sessionStorage.setItem('barbaros_messages', JSON.stringify(msgs))
    sessionStorage.setItem('barbaros_score',    String(finalScore ?? 0))
    setIsEnded(true)
    setTimeout(() => router.push('/report'), 2000)
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

      const newMsg: Message = {
        role: 'assistant',
        content: data.content,
        score: data.score,
        coaching_note: data.coaching_note,
        question_type: data.question_type,
      }
      const updatedMsgs = [...msgs, newMsg]
      setMessages(updatedMsgs)
      setLastInterviewerText(data.content)

      if (data.question_type) setLastQuestionType(data.question_type)
      if (data.coaching_note) setLastCoachingNote(data.coaching_note)
      else setLastCoachingNote(null)

      if (data.audioBase64) playAudio(data.audioBase64)

      let latestScore = overallScoreRef.current
      if (data.score) {
        const all = [...msgs.filter(m => m.score).map(m => m.score.score), data.score.score]
        latestScore = Math.round(all.reduce((a, b) => a + b, 0) / all.length)
        setOverallScore(latestScore)
        setQuestionCount(prev => prev + 1)
      }

      if (data.isEndOfSession) {
        if (data.rebuiltAnswers) {
          sessionStorage.setItem('barbaros_rebuilt', JSON.stringify(data.rebuiltAnswers))
        }
        // ✅ تعديل: حفظ reportData من API إذا موجود
        if (data.reportData) {
          sessionStorage.setItem('barbaros_report', JSON.stringify(data.reportData))
          sessionStorage.setItem('barbaros_messages', JSON.stringify(updatedMsgs))
          sessionStorage.setItem('barbaros_score', String(latestScore ?? 0))
          setIsEnded(true)
          setTimeout(() => router.push('/report'), 2000)
        } else {
          endSession(updatedMsgs, latestScore)
        }
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
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; setInterviewerSpeaking(false) }
    const userMsg: Message = { role: 'user', content: input.trim() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    await callAdam(newMessages)
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const handleStart = () => {
    handleFirstInteraction()
    setStarted(true)
    if (!hasStarted.current) {
      hasStarted.current = true
      callAdam([])
    }
  }

  if (!started) {
    return (
      <div
        dir={isRTL ? 'rtl' : 'ltr'}
        style={{
          fontFamily: 'system-ui, sans-serif', background: '#F5F1EB', color: '#1A1A1A',
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center'
        }}
      >
        <div style={{ textAlign: 'center', padding: '24px' }}>
          <div style={{ fontSize: 72, marginBottom: 24 }}>🎯</div>
          <div style={{ fontSize: 28, marginBottom: 8 }}><Barbaros size={28} /></div>
          <div style={{ fontSize: 14, color: 'rgba(26,26,26,0.55)', marginBottom: 6, fontWeight: 600 }}>
            {CONFIG.candidateName} · {CONFIG.jobTitle}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(26,26,26,0.4)', marginBottom: 48 }}>
            {CONFIG.institution}
          </div>
          <button
            onClick={handleStart}
            style={{
              background: '#CC785C', border: 'none', borderRadius: 14,
              padding: '16px 48px', fontSize: 16, fontWeight: 800,
              color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
              letterSpacing: -0.3, marginBottom: 16
            }}>
            {t.startBtn}
          </button>
          <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.35)' }}>{t.startHint}</div>
        </div>
      </div>
    )
  }

  return (
    <div
      onClick={handleFirstInteraction}
      dir={isRTL ? 'rtl' : 'ltr'}
      style={{ fontFamily: 'system-ui, sans-serif', background: '#F5F1EB', color: '#1A1A1A', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}
    >
      <nav style={{ background: '#F5F1EB', borderBottom: '0.5px solid #E5DDD0', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Barbaros size={20} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#1A1A1A' }}>{CONFIG.jobTitle} · {CONFIG.institution}</div>
          <div style={{ fontSize: 10, color: 'rgba(26,26,26,0.45)' }}>{t.basedOn}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={toggleMute} style={{ background: '#FFFFFF', border: '0.5px solid #E5DDD0', borderRadius: 6, color: '#1A1A1A', padding: '3px 8px', cursor: 'pointer', fontSize: 14 }}>
            {isMuted ? '🔇' : '🔊'}
          </button>
          <span style={{ fontSize: 10, color: '#DC2626', background: 'rgba(220,38,38,0.08)', border: '0.5px solid rgba(220,38,38,0.2)', borderRadius: 20, padding: '3px 8px', fontWeight: 700 }}>
            ● {isRTL ? 'مباشر' : 'Live'}
          </span>
          <span style={{ fontWeight: 800, fontSize: 16, color: timeLeft < 180 ? '#DC2626' : '#1A1A1A' }}>
            {formatTime(timeLeft)}
          </span>
        </div>
      </nav>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', gap: 16 }}>

        {/* Interviewer Card */}
        <div style={{
          width: '100%', maxWidth: 440, background: '#FFFFFF',
          border: `1px solid ${interviewerSpeaking ? '#CC785C' : '#E5DDD0'}`,
          borderRadius: 20, padding: '28px 24px', textAlign: 'center',
          transition: 'all 0.3s',
          boxShadow: interviewerSpeaking ? '0 0 24px rgba(204,120,92,0.15)' : '0 1px 4px rgba(0,0,0,0.06)'
        }}>
          <div style={{
            width: 80, height: 80,
            background: interviewerSpeaking ? '#CC785C' : '#F5F1EB',
            border: `2px solid ${interviewerSpeaking ? '#CC785C' : '#E5DDD0'}`,
            borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 36, margin: '0 auto 16px', transition: 'all 0.3s',
          }}>🎯</div>

          <div style={{ fontSize: 15, marginBottom: 4 }}>
            <span style={{ fontWeight: 900 }}>
              <span style={{ color: '#1A1A1A' }}>Barbar</span>
              <span style={{ color: '#CC785C' }}>os</span>
            </span>
            {' '}<span style={{ color: '#1A1A1A', fontWeight: 400 }}>Interviewer</span>
          </div>
          <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.45)', marginBottom: 16 }}>{t.basedOn}</div>

          {lastQuestionType && (
            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center' }}>
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: 0.5, padding: '4px 10px', borderRadius: 20,
                background: QUESTION_TYPE_COLORS[lastQuestionType]?.bg || 'rgba(26,26,26,0.06)',
                color: QUESTION_TYPE_COLORS[lastQuestionType]?.color || '#1A1A1A',
                textTransform: 'uppercase',
              }}>
                {lastQuestionType.replace('_', ' ')}
              </span>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, height: 44, marginBottom: 8 }}>
            {interviewerSpeaking ? (
              [16, 28, 36, 32, 36, 24, 16].map((h, i) => (
                <div key={i} style={{ width: 4, borderRadius: 4, background: '#CC785C', animation: 'wave 0.8s ease-in-out infinite', animationDelay: `${i * 0.1}s`, height: `${h}px` }} />
              ))
            ) : isLoading ? (
              [0, 1, 2].map(i => (
                <div key={i} style={{ width: 8, height: 8, background: '#CC785C', borderRadius: '50%', animation: `pulse 1.2s infinite ${i * 0.2}s`, opacity: 0.5 }} />
              ))
            ) : (
              <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.4)' }}>
                {isTranscribing ? t.processing : t.listening}
              </div>
            )}
          </div>

          {interviewerSpeaking && (
            <div style={{ fontSize: 11, color: '#CC785C', fontWeight: 700, marginBottom: 8 }}>{t.speaking}</div>
          )}

          {lastInterviewerText && (
            <div style={{ marginTop: 14, padding: '14px 16px', background: '#F5F1EB', border: '0.5px solid #E5DDD0', borderRadius: 12, textAlign: isRTL ? 'right' : 'left' }}>
              <div style={{ fontSize: 13, color: '#1A1A1A', lineHeight: 1.7 }}
                dangerouslySetInnerHTML={{ __html: highlightHesitation(lastInterviewerText, CONFIG.language) }} />
            </div>
          )}

          {lastCoachingNote && (
            <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(204,120,92,0.06)', border: '0.5px solid rgba(204,120,92,0.3)', borderRadius: 10, textAlign: isRTL ? 'right' : 'left' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#CC785C', marginBottom: 4, letterSpacing: 0.5, textTransform: 'uppercase' }}>{t.recruiterNote}</div>
              <div style={{ fontSize: 12, color: '#1A1A1A', lineHeight: 1.6 }}>{lastCoachingNote}</div>
            </div>
          )}
        </div>

        {/* Candidate Card */}
        <div style={{
          width: '100%', maxWidth: 440, background: '#FFFFFF',
          border: `1px solid ${isRecording ? 'rgba(220,38,38,0.5)' : isTranscribing ? 'rgba(204,120,92,0.3)' : '#E5DDD0'}`,
          borderRadius: 20, padding: '20px 24px', textAlign: 'center',
          transition: 'all 0.3s',
          boxShadow: isRecording ? '0 0 20px rgba(220,38,38,0.08)' : '0 1px 4px rgba(0,0,0,0.06)'
        }}>
          <div style={{
            width: 56, height: 56, background: '#F5F1EB',
            border: `2px solid ${isRecording ? '#DC2626' : '#E5DDD0'}`,
            borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 20, margin: '0 auto 10px', transition: 'all 0.3s', color: '#1A1A1A'
          }}>
            {CONFIG.candidateName?.charAt(0).toUpperCase()}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2, color: '#1A1A1A' }}>{CONFIG.candidateName}</div>
          <div style={{ fontSize: 10, color: 'rgba(26,26,26,0.45)', marginBottom: 14 }}>{t.candidate} · {CONFIG.yearsExperience}</div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, height: 32 }}>
            {isRecording ? (
              [12, 22, 28, 22, 12].map((h, i) => (
                <div key={i} style={{ width: 4, borderRadius: 4, background: '#DC2626', animation: 'wave 0.6s ease-in-out infinite', animationDelay: `${i * 0.1}s`, height: `${h}px` }} />
              ))
            ) : isTranscribing ? (
              <div style={{ fontSize: 11, color: '#CC785C', fontWeight: 600 }}>{t.processing}</div>
            ) : (
              <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.4)' }}>
                {isLoading ? t.listeningToInterviewer : t.yourTurn}
              </div>
            )}
          </div>

          {isRecording && (
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#DC2626', animation: 'pulse 1s infinite' }} />
              <span style={{ fontSize: 13, color: '#DC2626', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                {formatRecordingTime(recordingSeconds)}
              </span>
            </div>
          )}
        </div>

        {/* Transcript Toggle */}
        <div style={{ width: '100%', maxWidth: 440 }}>
          <button
            onClick={() => setShowTranscript(prev => !prev)}
            style={{
              width: '100%', padding: '10px', background: '#FFFFFF',
              border: '0.5px solid #E5DDD0', borderRadius: 10,
              color: '#1A1A1A', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
            }}>
            {showTranscript ? '▲' : '▼'} {showTranscript ? t.hideTranscript : t.showTranscript}
          </button>

          {showTranscript && (
            <div style={{ marginTop: 8, background: '#FFFFFF', border: '0.5px solid #E5DDD0', borderRadius: 12, padding: '16px', maxHeight: 280, overflowY: 'auto' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(26,26,26,0.45)', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12 }}>
                {t.transcript}
              </div>
              {messages.filter(m => !m.content.startsWith('[')).map((msg, i) => (
                <div key={i} style={{ marginBottom: 12, textAlign: msg.role === 'user' ? (isRTL ? 'left' : 'right') : (isRTL ? 'right' : 'left') }}>
                  {msg.role === 'assistant' && msg.question_type && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: 0.5, padding: '2px 8px', borderRadius: 20,
                        background: QUESTION_TYPE_COLORS[msg.question_type]?.bg || 'rgba(26,26,26,0.06)',
                        color: QUESTION_TYPE_COLORS[msg.question_type]?.color || '#1A1A1A',
                        textTransform: 'uppercase',
                      }}>
                        {msg.question_type.replace('_', ' ')}
                      </span>
                    </div>
                  )}
                  <div style={{
                    display: 'inline-block', maxWidth: '85%', padding: '8px 12px',
                    borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                    background: msg.role === 'user' ? '#CC785C' : '#F5F1EB',
                    color: msg.role === 'user' ? '#FFFFFF' : '#1A1A1A',
                    fontSize: 12, lineHeight: 1.6, fontWeight: msg.role === 'user' ? 600 : 400,
                  }}>
                    {msg.role === 'assistant' ? (
                      <span dangerouslySetInnerHTML={{ __html: highlightHesitation(msg.content, CONFIG.language) }} />
                    ) : msg.content}
                  </div>
                  {msg.role === 'assistant' && msg.coaching_note && (
                    <div style={{ marginTop: 4, padding: '6px 10px', background: 'rgba(204,120,92,0.06)', border: '0.5px solid rgba(204,120,92,0.25)', borderRadius: 8, fontSize: 11, color: '#CC785C', lineHeight: 1.5 }}>
                      <span style={{ fontWeight: 700 }}>{t.recruiterNote}: </span>{msg.coaching_note}
                    </div>
                  )}
                </div>
              ))}
              <div ref={transcriptEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* Input Area */}
      {!isEnded ? (
        <div style={{ padding: '12px 16px', borderTop: '0.5px solid #E5DDD0', background: '#F5F1EB' }}>
          {micError && (
            <div style={{ fontSize: 11, color: '#DC2626', marginBottom: 8, textAlign: 'center', padding: '6px 10px', background: 'rgba(220,38,38,0.06)', border: '0.5px solid rgba(220,38,38,0.2)', borderRadius: 8, fontWeight: 600 }}>
              ⚠ {micError}
            </div>
          )}
          <div style={{ fontSize: 11, textAlign: 'center', marginBottom: 8, fontWeight: 600, color: isRecording ? '#DC2626' : 'rgba(26,26,26,0.4)' }}>
            {isRecording ? t.tapToStop : isTranscribing ? t.processing : !isLoading ? t.tapToRecord : ''}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={toggleRecording}
              disabled={isLoading || isTranscribing || isEnded}
              style={{
                width: 52, height: 52, borderRadius: 12, border: 'none',
                cursor: isLoading || isTranscribing ? 'not-allowed' : 'pointer',
                flexShrink: 0, fontSize: 22,
                background: isRecording ? '#DC2626' : '#1A1A1A',
                boxShadow: isRecording ? '0 0 20px rgba(220,38,38,0.5)' : 'none',
                transition: 'all 0.15s',
              }}>
              {isTranscribing ? '⏳' : isRecording ? '⏹' : '🎤'}
            </button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={isRecording ? t.recording : isTranscribing ? t.processing : t.typeHere}
              disabled={isLoading || isRecording || isTranscribing}
              rows={1}
              dir={isRTL ? 'rtl' : 'ltr'}
              style={{
                flex: 1, background: '#FFFFFF', border: '0.5px solid #E5DDD0',
                color: '#1A1A1A', fontFamily: 'inherit', fontSize: 13,
                padding: '9px 12px', borderRadius: 8, outline: 'none', resize: 'none'
              }}
            />
            <button
              onClick={sendMessage}
              disabled={isLoading || !input.trim() || isRecording || isTranscribing}
              style={{
                width: 52, height: 52,
                background: (isLoading || !input.trim()) ? '#E5DDD0' : '#CC785C',
                border: 'none', borderRadius: 12,
                cursor: (isLoading || !input.trim()) ? 'not-allowed' : 'pointer',
                color: (isLoading || !input.trim()) ? 'rgba(26,26,26,0.3)' : '#fff',
                fontSize: 20, flexShrink: 0, transition: 'background 0.15s'
              }}>
              {isRTL ? '←' : '→'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ padding: 20, textAlign: 'center', borderTop: '0.5px solid #E5DDD0', background: '#F5F1EB' }}>
          <div style={{ fontSize: 14, color: '#CC785C', marginBottom: 8, fontWeight: 700 }}>
            {t.sessionEnded} · {t.score}: {overallScore ?? '—'}/100
          </div>
          <div style={{ fontSize: 12, color: 'rgba(26,26,26,0.5)', marginBottom: 12 }}>{t.redirecting}</div>
          {/* ✅ تعديل: زر التقرير يتأكد من وجود البيانات */}
          <button
            onClick={() => router.push('/report')}
            style={{ background: '#CC785C', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            {t.viewReport}
          </button>
        </div>
      )}

      {/* Bottom Bar */}
      <div style={{ background: '#EDE6D8', borderTop: '0.5px solid #E5DDD0', padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 10, color: 'rgba(26,26,26,0.45)', fontWeight: 600 }}>
          {t.question}{questionCount} · {getPlanLabel(CONFIG.plan)}
        </div>
        <div style={{ background: 'rgba(204,120,92,0.1)', border: '0.5px solid rgba(204,120,92,0.25)', borderRadius: 6, padding: '4px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: 8, color: 'rgba(26,26,26,0.4)', textTransform: 'uppercase', fontWeight: 700 }}>{t.performance}</div>
          <div style={{ fontWeight: 800, fontSize: 15, color: '#CC785C' }}>{overallScore ?? '—'}</div>
        </div>
        <button
         onClick={() => {
    const isAr = CONFIG.language === 'ar'
    const msg = isAr
      ? 'للحصول على أفضل تقييم، أكمل المقابلة حتى نهايتها.\n\nهل تريد الإنهاء الآن؟'
      : 'For the best evaluation, complete the interview until the end.\n\nEnd interview now?'
    if (confirm(msg)) endSession(messagesRef.current, overallScoreRef.current)
  }}
  style={{ background: 'rgba(220,38,38,0.08)', border: '0.5px solid rgba(220,38,38,0.25)', color: '#DC2626', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
  {t.end}
        </button>
      </div>

      <footer style={{ background: '#EDE6D8', borderTop: '0.5px solid #E5DDD0', padding: '8px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: 10, color: 'rgba(26,26,26,0.3)' }}>{t.poweredBy}</div>
      </footer>

      <style>{`
        @keyframes pulse { 0%,80%,100%{opacity:0.3} 40%{opacity:1} }
        @keyframes wave { 0%,100%{transform:scaleY(0.5)} 50%{transform:scaleY(1)} }
      `}</style>
    </div>
  )
}
