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

// CLOSING WINDOW
// The final assessment question must be asked before the timer reaches zero.
// After the candidate answers that final question, the room shows the farewell
// and then moves to report generation. The page must not cut the candidate off.
const FINAL_QUESTION_WINDOW_SECONDS = 180
const CLOSING_REQUEST_SECONDS = 90
const CLOSING_FORCE_SECONDS = 0

function buildConfig() {
  let raw: any = {}
  if (typeof window !== 'undefined') {
    try {
      const stored = sessionStorage.getItem('barbaros_config')
      if (stored) raw = JSON.parse(stored)
    } catch {}
  }

  const parsedCv =
    raw.parsedCv && typeof raw.parsedCv === 'object'
      ? raw.parsedCv
      : undefined

  const hasCv = Boolean(
    raw.hasCv ||
    raw.cvFileName ||
    raw.cvText ||
    raw.cvSummary ||
    parsedCv
  )

  return {
    sessionId:       raw.sessionId       ?? `session_${Date.now()}`,
    candidateName:   raw.candidateName   ?? 'Candidate',
    jobTitle:        raw.jobTitle         ?? 'Professional',
    institution:     raw.institution      ?? 'Organisation',
    sector:          raw.sector           ?? 'General',
    yearsExperience: raw.yearsExperience  ?? '3 years',
    language:        raw.language         ?? 'en',
    plan:            raw.plan             ?? 'go',
    jobRequirements: raw.jobRequirements  ?? '',
    hasCv,
    cvFileName:      raw.cvFileName       ?? '',
    cvMimeType:      raw.cvMimeType       ?? '',
    cvText:          typeof raw.cvText === 'string' ? raw.cvText : '',
    cvSummary:       typeof raw.cvSummary === 'string' ? raw.cvSummary : '',
    parsedCv,
    difficulty:      'standard',
  }
}

function scoreLabel(s: number): { text: string; color: string } {
  if (s >= 80) return { text: 'Strong',        color: '#22C55E' }
  if (s >= 65) return { text: 'Good',          color: '#86EFAC' }
  if (s >= 50) return { text: 'Fair',          color: '#F59E0B' }
  return            { text: 'Needs clarity', color: '#F87171' }
}

function isQuestionLike(content: string): boolean {
  const clean = content.trim()
  if (!clean) return false
  return clean.endsWith('?') || clean.endsWith('؟')
}

// Bilingual micro-copy. Arabic only when the candidate chose Arabic.
function t(lang: string) {
  const ar = lang === 'ar'

  return {
    sessionActive:   ar ? 'جلسة تقييم جارية'          : 'Interview Session Active',
    ready:           ar ? 'جاهز'                       : 'Ready',
    readySub:        ar ? 'اضغط الميكروفون للإجابة'    : 'Press the microphone to respond',
    listening:       ar ? 'يستمع'                      : 'Listening',
    listeningSub:    ar ? 'يستمع إلى إجابتك...'         : 'Listening to your response...',
    evaluating:      ar ? 'يقيّم'                       : 'Evaluating',
    evaluatingSub:   ar ? 'يقيّم إجابتك...'             : 'Evaluating your answer...',
    speaking:        ar ? 'يتحدّث'                      : 'Speaking',
    speakingSub:     ar ? 'يطرح السؤال التالي...'       : 'Asking the next question...',
    paused:          ar ? 'المقابلة متوقّفة مؤقتاً'      : 'Interview Paused',
    pausedSub:       ar ? 'توقّفت بسبب عدم النشاط. اضغط الميكروفون للمتابعة.' : 'Interview paused due to inactivity. Press the microphone to continue.',
    focusLabel:      ar ? 'محور التقييم الحالي'          : 'Current Assessment Focus',
    begin:           ar ? 'ابدأ المقابلة'              : 'Begin Interview',
    readyTitle:      ar ? 'الجلسة جاهزة'                : 'Interview Session Ready',
    transcript:      ar ? 'النصّ'                        : 'Transcript',
    transcriptTitle: ar ? 'نصّ المقابلة'               : 'Interview Transcript',
    end:             ar ? 'إنهاء'                       : 'End',
    close:           ar ? 'إغلاق'                       : 'Close',
    audioOn:         ar ? 'الصوت مفعّل'                 : 'Audio On',
    audioMuted:      ar ? 'الصوت مكتوم'                 : 'Muted',
    micFail:         ar ? 'تعذّر استخدام الميكروفون؟ اكتب إجابتك' : "Can't use microphone? Type your response",
    typeHere:        ar ? 'اكتب إجابتك هنا...'           : 'Type your response here...',
    send:            ar ? 'إرسال'                       : 'Send',
    endTitle:        ar ? 'إنهاء المقابلة مبكراً؟'       : 'End Interview Early?',
    endBody:         ar ? 'سيُنشأ تقرير التقييم فوراً بناءً على المقابلة المكتملة حتى الآن.' : 'Your assessment report will be generated immediately based on the interview completed so far.',
    continueBtn:     ar ? 'متابعة المقابلة'            : 'Continue Interview',
    endGenerate:     ar ? 'إنهاء وإنشاء التقرير'         : 'End & Generate Report',
    complete:        ar ? 'اكتملت المقابلة'             : 'Interview Complete',
    generating:      ar ? 'جارٍ إنشاء تقرير التقييم...'  : 'Generating Assessment Report...',

    // CLOSING FLOW FIX
    // Shown during the short farewell screen before report generation.
    closing:         ar ? 'ينهي المقابلة'               : 'Closing',
    closingSub:      ar ? 'رسالة ختامية قبل التقرير...' : 'Final closing message before your report...',

    retry:           ar ? 'إعادة المحاولة'              : 'Retry',
    newInterview:    ar ? 'مقابلة جديدة'                : 'Start New Interview',
  }
}

function InterviewRoom() {
  const [CONFIG] = useState(() => buildConfig())
  const L = t(CONFIG.language)

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

  // CLOSING FLOW FIX
  // isClosing separates the farewell screen from the report generation screen.
  const [isClosing, setIsClosing]           = useState(false)

  const [isMuted, setIsMuted]               = useState(false)
  const [isRecording, setIsRecording]       = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [audioReady, setAudioReady]         = useState(false)
  const [pendingAudio, setPendingAudio]     = useState<string | null>(null)
  const [micError, setMicError]             = useState<string | null>(null)
  const [isGenerating, setIsGenerating]     = useState(false)
  const [genStep, setGenStep]               = useState(0)
  const [genError, setGenError]             = useState<string | null>(null)
  const [mounted, setMounted]               = useState(false)

  // Executive Room additions
  const [isPaused, setIsPaused]             = useState(false)
  const [isSpeaking, setIsSpeaking]         = useState(false)
  const [showTranscript, setShowTranscript] = useState(false)
  const [showTextInput, setShowTextInput]   = useState(false)
  const [showEndModal, setShowEndModal]     = useState(false)
  const [currentFocus, setCurrentFocus]     = useState<string | null>(null)
  const [isAwaitingFinalAnswer, setIsAwaitingFinalAnswer] = useState(false)

  const chatRef           = useRef<HTMLDivElement>(null)
  const inputRef          = useRef<HTMLTextAreaElement>(null)
  const silenceTimer      = useRef<any>(null)
  const messagesRef       = useRef<Message[]>([])
  const isLoadingRef      = useRef(false)
  const isEndedRef        = useRef(false)
  const isClosingRef      = useRef(false)
  const isRecordingRef    = useRef(false)
  const isTranscribingRef = useRef(false)
  const isPausedRef       = useRef(false)
  const isSpeakingRef     = useRef(false)
  const audioRef          = useRef<HTMLAudioElement | null>(null)
  const isMutedRef        = useRef(false)
  const audioReadyRef     = useRef(false)
  const mediaRecorderRef  = useRef<MediaRecorder | null>(null)
  const audioChunksRef    = useRef<Blob[]>([])

  // CLOSING FLOW FIX
  // Prevent duplicate closing timers and avoid cutting active speech unless forced.
  const closingTimerRef        = useRef<any>(null)
  const pendingClosingRef      = useRef(false)
  const pendingClosingMessage  = useRef<string | null>(null)
  const pendingClosingAudio    = useRef<string | null>(null)

  // FINAL ANSWER FLOW
  // Once Barbaros has asked the final assessment question, the page waits for
  // the candidate's answer. It does not jump to the report at 0:00.
  const finalQuestionAskedRef   = useRef(false)
  const awaitingFinalAnswerRef  = useRef(false)

  useEffect(() => { messagesRef.current       = messages       }, [messages])
  useEffect(() => { isLoadingRef.current      = isLoading      }, [isLoading])
  useEffect(() => { isEndedRef.current        = isEnded        }, [isEnded])
  useEffect(() => { isClosingRef.current      = isClosing      }, [isClosing])
  useEffect(() => { isRecordingRef.current    = isRecording    }, [isRecording])
  useEffect(() => { isTranscribingRef.current = isTranscribing }, [isTranscribing])
  useEffect(() => { isPausedRef.current       = isPaused       }, [isPaused])
  useEffect(() => { isSpeakingRef.current     = isSpeaking     }, [isSpeaking])

  useEffect(() => { setMounted(true) }, [])

  // CLOSING FLOW FIX
  // Cleanup audio and timers on unmount.
  useEffect(() => {
    return () => {
      if (closingTimerRef.current) clearTimeout(closingTimerRef.current)
      if (silenceTimer.current) clearTimeout(silenceTimer.current)

      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
        audioRef.current = null
      }
    }
  }, [])

  // CLOSING FLOW FIX
  // Local generic closing is used only for time-up or manual early ending.
  // Engine-based end uses the backend closing message with covered assessment areas.
  const genericClosingMessage = useCallback(() => {
    return CONFIG.language === 'ar'
      ? 'شكراً لك. بهذا نكون قد أنهينا مقابلة هذه الباقة. خلال الجلسة غطّينا ملاءمة الدور، اتساق السيرة، ارتباط الخبرة بمتطلبات الوظيفة، التواصل، ومستوى المسؤولية. سيتم تجهيز تقريرك الآن. ولتقييم أعمق عبر محاور أكثر وتفاصيل أوسع، يمكنك اختيار باقة أطول في المرات القادمة.'
      : 'Thank you. This completes the interview for your current package. Today we covered role fit, CV consistency, job requirement match, communication, and ownership. Your report is being prepared now. For deeper assessment across more areas and more detailed feedback, a longer package can provide broader coverage next time.'
  }, [CONFIG.language])

  const markFinalQuestionAsked = useCallback(() => {
    if (finalQuestionAskedRef.current) return

    finalQuestionAskedRef.current = true
    awaitingFinalAnswerRef.current = true
    setIsAwaitingFinalAnswer(true)
  }, [])

  // CLOSING FLOW FIX
  // Moves from the closing screen to the existing report generation flow.
  const finishClosing = useCallback(() => {
    if (closingTimerRef.current) {
      clearTimeout(closingTimerRef.current)
      closingTimerRef.current = null
    }

    setIsClosing(false)
    isClosingRef.current = false
    setIsEnded(true)
  }, [])

  // CLOSING FLOW FIX
  // Shows the farewell message, plays its audio if available, then moves to report generation.
  const beginClosing = useCallback((message: string, audioBase64?: string | null) => {
    if (isClosingRef.current || isEndedRef.current) return

    pendingClosingRef.current = false
    pendingClosingMessage.current = null
    pendingClosingAudio.current = null
    setPendingAudio(null)

    setIsClosing(true)
    isClosingRef.current = true

    setIsPaused(false)
    isPausedRef.current = false

    if (silenceTimer.current) clearTimeout(silenceTimer.current)

    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }

    setIsSpeaking(false)

    if (message?.trim()) {
      const closingMsg: Message = { role: 'assistant', content: message.trim() }

      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (last?.role === 'assistant' && last.content === closingMsg.content) return prev
        return [...prev, closingMsg]
      })
    }

    const done = () => finishClosing()

    if (closingTimerRef.current) clearTimeout(closingTimerRef.current)

    const fallbackMs = audioBase64 && !isMutedRef.current && audioReadyRef.current ? 12000 : 6000
    closingTimerRef.current = setTimeout(done, fallbackMs)

    if (audioBase64 && !isMutedRef.current && audioReadyRef.current) {
      try {
        const audio = new Audio(`data:audio/mpeg;base64,${audioBase64}`)
        audioRef.current = audio

        audio.onplay = () => setIsSpeaking(true)

        audio.onended = () => {
          setIsSpeaking(false)
          if (audioRef.current === audio) audioRef.current = null
          done()
        }

        audio.onerror = () => {
          setIsSpeaking(false)
          done()
        }

        audio.play().catch(() => {
          setIsSpeaking(false)
          done()
        })
      } catch {
        setIsSpeaking(false)
        done()
      }
    }
  }, [finishClosing])

  const closeAfterFinalAnswer = useCallback(() => {
    awaitingFinalAnswerRef.current = false
    setIsAwaitingFinalAnswer(false)
    beginClosing(genericClosingMessage(), null)
  }, [beginClosing, genericClosingMessage])

  // CLOSING FLOW FIX
  // Requests closing. If Barbaros is speaking, wait for audio to finish.
  // If forced, start immediately to avoid reaching 0:00 without farewell.
  const requestClosing = useCallback((message: string, audioBase64?: string | null, force = false) => {
    if (isClosingRef.current || isEndedRef.current) return

    pendingClosingRef.current = true
    pendingClosingMessage.current = message
    pendingClosingAudio.current = audioBase64 ?? null
    setPendingAudio(null)

    if (!force && isSpeakingRef.current) {
      return
    }

    const finalMessage = pendingClosingMessage.current || message
    const finalAudio = pendingClosingAudio.current

    pendingClosingRef.current = false
    pendingClosingMessage.current = null
    pendingClosingAudio.current = null

    beginClosing(finalMessage, finalAudio)
  }, [beginClosing])

  useEffect(() => {
    const id = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(id)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(id)
  }, [])

  // CLOSING FLOW FIX
  // Do not cut off the candidate at 0:00.
  // If the final assessment question has been asked, wait for the candidate's
  // answer, then close. If no final answer is pending and the timer reaches zero,
  // show the farewell and move to the report.
  useEffect(() => {
    if (isEndedRef.current || isClosingRef.current) return

    if (
      timeLeft <= CLOSING_FORCE_SECONDS &&
      !awaitingFinalAnswerRef.current &&
      !isLoading &&
      !isRecording &&
      !isTranscribing
    ) {
      requestClosing(genericClosingMessage(), null, true)
    }
  }, [
    timeLeft,
    isLoading,
    isRecording,
    isTranscribing,
    requestClosing,
    genericClosingMessage,
  ])

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  useEffect(() => {
    if (audioReady && pendingAudio && !pendingClosingRef.current && !isClosingRef.current) {
      playAudioDirect(pendingAudio)
      setPendingAudio(null)
    }
  }, [audioReady, pendingAudio])

  const playAudioDirect = (audioBase64: string) => {
    if (isMutedRef.current) return
    if (isClosingRef.current || pendingClosingRef.current) return

    try {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
        audioRef.current = null
      }

      const audio = new Audio(`data:audio/mpeg;base64,${audioBase64}`)
      audioRef.current = audio

      audio.onplay = () => { setIsSpeaking(true) }

      audio.onended = () => {
        setIsSpeaking(false)

        if (audioRef.current === audio) audioRef.current = null

        if (pendingClosingRef.current) {
          const finalMessage = pendingClosingMessage.current || genericClosingMessage()
          const finalAudio = pendingClosingAudio.current

          pendingClosingRef.current = false
          pendingClosingMessage.current = null
          pendingClosingAudio.current = null

          beginClosing(finalMessage, finalAudio)
          return
        }

        if (!isClosingRef.current) resetSilenceTimer()
      }

      audio.onerror = () => {
        setIsSpeaking(false)

        if (pendingClosingRef.current) {
          const finalMessage = pendingClosingMessage.current || genericClosingMessage()
          const finalAudio = pendingClosingAudio.current

          pendingClosingRef.current = false
          pendingClosingMessage.current = null
          pendingClosingAudio.current = null

          beginClosing(finalMessage, finalAudio)
        }
      }

      audio.play().catch(err => {
        setIsSpeaking(false)
        console.warn('Audio play failed:', err)

        if (pendingClosingRef.current) {
          const finalMessage = pendingClosingMessage.current || genericClosingMessage()
          const finalAudio = pendingClosingAudio.current

          pendingClosingRef.current = false
          pendingClosingMessage.current = null
          pendingClosingAudio.current = null

          beginClosing(finalMessage, finalAudio)
        }
      })
    } catch (err) {
      setIsSpeaking(false)
      console.warn('Audio error:', err)
    }
  }

  const playAudio = useCallback((audioBase64: string) => {
    if (isMutedRef.current) return
    if (isClosingRef.current || pendingClosingRef.current) return

    if (!audioReadyRef.current) {
      setPendingAudio(audioBase64)
      return
    }

    playAudioDirect(audioBase64)
  }, [])

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    setIsSpeaking(false)
  }

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
    if (next) stopAudio()
  }

  // SILENCE → PAUSE. No backend call. Saves credits during inactivity.
  const resetSilenceTimer = useCallback(() => {
    if (silenceTimer.current) clearTimeout(silenceTimer.current)

    silenceTimer.current = setTimeout(() => {
      if (
        !isLoadingRef.current &&
        !isEndedRef.current &&
        !isClosingRef.current &&
        !isRecordingRef.current &&
        !isTranscribingRef.current &&
        !isSpeakingRef.current
      ) {
        setIsPaused(true)
        isPausedRef.current = true
      }
    }, 45000)
  }, [])

  const startRecording = async () => {
    if (isLoading || isTranscribing || isEnded || isClosing) return

    try {
      handleFirstInteraction()
      setMicError(null)
      setIsPaused(false)
      isPausedRef.current = false

      if (silenceTimer.current) clearTimeout(silenceTimer.current)

      stopAudio()

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      const mediaRecorder = new MediaRecorder(stream, { mimeType })

      audioChunksRef.current = []

      mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      mediaRecorder.start()
      mediaRecorderRef.current = mediaRecorder
      setIsRecording(true)
    } catch (err: any) {
      const msg = err.name === 'NotAllowedError' ? 'Microphone access denied' : 'Could not access microphone'
      setMicError(msg)
      setShowTextInput(true)
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

    if (blob.size < 1000) {
      resetSilenceTimer()
      return
    }

    setIsTranscribing(true)

    try {
      const fd = new FormData()
      fd.append('audio', blob, 'recording.webm')
      fd.append('language', CONFIG.language)

      const res = await fetch('/api/transcribe', { method: 'POST', body: fd })
      const data = await res.json()
      const text = data.text?.trim()

      if (text) {
        const userMsg: Message = { role: 'user', content: text }
        const newMessages = [...messagesRef.current, userMsg]

        setMessages(newMessages)
        setInput('')

        if (awaitingFinalAnswerRef.current) {
          closeAfterFinalAnswer()
          return
        }

        await callAdam(newMessages)
      } else {
        resetSilenceTimer()
      }
    } catch (err) {
      console.error('Transcription error:', err)
      resetSilenceTimer()
    } finally {
      setIsTranscribing(false)
    }
  }

  const toggleRecording = () => {
    if (isLoading || isTranscribing || isEnded || isClosing) return

    if (isRecordingRef.current) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  const callAdam = async (msgs: Message[]) => {
    setIsLoading(true)
    setIsPaused(false)
    isPausedRef.current = false

    handleFirstInteraction()

    if (silenceTimer.current) clearTimeout(silenceTimer.current)

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

      const newMsg: Message = {
        role: 'assistant',
        content: data.content,
        score: data.score
      }

      setMessages(prev => [...prev, newMsg])

      if (
        !data.isEndOfSession &&
        !finalQuestionAskedRef.current &&
        timeLeft <= FINAL_QUESTION_WINDOW_SECONDS &&
        isQuestionLike(data.content)
      ) {
        markFinalQuestionAsked()
      }

      // Assessment focus: shown ONLY when the backend actually provides it.
      if (data.focus) setCurrentFocus(data.focus)

      if (data.score) setQuestionCount(prev => prev + 1)

      // CLOSING FLOW FIX
      // End-of-session response enters the farewell screen first.
      if (data.isEndOfSession) {
        requestClosing(data.content, data.audioBase64, false)
        return
      }

      // FINAL ANSWER FLOW
      // In the final window, keep the last question visible and wait for the
      // candidate's answer. Do not jump to the report before the answer.
      if (
        timeLeft <= CLOSING_REQUEST_SECONDS &&
        isQuestionLike(data.content) &&
        !data.isEndOfSession
      ) {
        markFinalQuestionAsked()
      }

      if (data.audioBase64) playAudio(data.audioBase64)

      resetSilenceTimer()
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }])
    } finally {
      setIsLoading(false)
    }
  }

  const sendMessage = async () => {
    if (!input.trim() || isLoading || isEnded || isClosing) return

    handleFirstInteraction()
    setIsPaused(false)
    isPausedRef.current = false

    if (silenceTimer.current) clearTimeout(silenceTimer.current)

    stopAudio()

    const userMsg: Message = { role: 'user', content: input.trim() }
    const newMessages = [...messagesRef.current, userMsg]

    setMessages(newMessages)
    setInput('')

    if (awaitingFinalAnswerRef.current) {
      closeAfterFinalAnswer()
      return
    }

    await callAdam(newMessages)
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const genSteps = CONFIG.language === 'ar'
    ? ['تحليل اتساق إجاباتك...', 'مراجعة العمق التخصصي...', 'رصد الأنماط السلوكية...', 'إعداد تقييم التوظيف...']
    : ['Analyzing answer consistency...', 'Reviewing domain depth...', 'Detecting behavioral patterns...', 'Generating hiring evaluation...']

  const goToReport = async () => {
    setGenError(null)
    setIsGenerating(true)
    setGenStep(0)

    if (silenceTimer.current) clearTimeout(silenceTimer.current)

    stopAudio()

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

  // Time-up or engine-signalled end now routes through isClosing first.
  // goToReport runs only after finishClosing sets isEnded.
  useEffect(() => {
    if (isEnded && !isGenerating && !genError) goToReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEnded])

  const started = messages.length > 0 || isLoading
  const lastQuestion = [...messages].reverse().find(m => m.role === 'assistant')?.content || ''

  // Presence state
  let stateLabel = L.ready
  let stateSub   = L.readySub
  let glow       = '#3A4252'
  let stateKey   = 'ready'

  if (isPaused) {
    stateLabel = L.paused
    stateSub = L.pausedSub
    glow = '#6B7280'
    stateKey = 'paused'
  } else if (isAwaitingFinalAnswer) {
    stateLabel = L.ready
    stateSub = CONFIG.language === 'ar'
      ? 'أجب عن السؤال الأخير، ثم سيتم تجهيز التقرير.'
      : 'Answer the final question, then your report will be prepared.'
    glow = '#3A4252'
    stateKey = 'ready'
  } else if (isClosing) {
    stateLabel = L.closing
    stateSub = L.closingSub
    glow = '#CC785C'
    stateKey = 'speaking'
  } else if (isSpeaking) {
    stateLabel = L.speaking
    stateSub = L.speakingSub
    glow = '#CC785C'
    stateKey = 'speaking'
  } else if (isLoading || isTranscribing) {
    stateLabel = L.evaluating
    stateSub = L.evaluatingSub
    glow = '#F59E0B'
    stateKey = 'evaluating'
  } else if (isRecording) {
    stateLabel = L.listening
    stateSub = L.listeningSub
    glow = '#8B96FF'
    stateKey = 'listening'
  }

  const animated = stateKey === 'speaking' || stateKey === 'evaluating' || stateKey === 'listening'

  if (!mounted) {
    return (
      <div style={{ fontFamily: 'system-ui, sans-serif', background: '#0B0D11', color: '#F0EDE8', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <div style={{ fontWeight: 900, fontSize: 22 }}>
          <span style={{ color: '#F0EDE8' }}>Barbar</span><span style={{ color: '#CC785C' }}>os</span>
        </div>
        <div style={{ fontSize: 12, color: 'rgba(240,237,232,0.4)' }}>Preparing your interview…</div>
      </div>
    )
  }

  // CLOSING FLOW FIX
  // This screen appears before report generation. It lets the candidate see and hear the farewell.
  if (isClosing) {
    const lastClosingMessage = [...messages].reverse().find(m => m.role === 'assistant')?.content || genericClosingMessage()

    return (
      <div style={{ fontFamily: 'system-ui, sans-serif', background: '#0B0D11', color: '#F0EDE8', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <div style={{ fontWeight: 900, fontSize: 20, marginBottom: 28 }}>
          <span style={{ color: '#F0EDE8' }}>Barbar</span><span style={{ color: '#CC785C' }}>os</span>
        </div>

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 28 }}>
          <div className="ring" style={{ borderColor: 'rgba(204,120,92,0.35)' }} />
          <div className="ring ring2" style={{ borderColor: 'rgba(204,120,92,0.22)' }} />
          <div className="orb breathe" style={{ boxShadow: '0 0 70px rgba(204,120,92,0.45), inset 0 0 44px rgba(204,120,92,0.14)', borderColor: 'rgba(204,120,92,0.55)' }}>
            <div style={{ fontWeight: 900, fontSize: 28 }}>
              <span style={{ color: '#F0EDE8' }}>B</span><span style={{ color: '#CC785C' }}>os</span>
            </div>
          </div>
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: '#CC785C', marginBottom: 8 }}>
          {L.closing}
        </div>

        <div style={{ fontSize: 11, color: 'rgba(240,237,232,0.4)', marginBottom: 22 }}>
          {L.closingSub}
        </div>

        <div style={{ maxWidth: 520, fontSize: 17, lineHeight: 1.7, fontWeight: 500, color: '#F0EDE8' }}>
          {lastClosingMessage}
        </div>

        <style>{`
          .orb {
            width: 150px; height: 150px; border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            background: radial-gradient(circle at 50% 40%, rgba(255,255,255,0.05), rgba(15,17,23,0.9));
            border: 1px solid; transition: box-shadow .4s, border-color .4s;
          }
          .breathe { animation: breathe 2.6s ease-in-out infinite; }
          .ring {
            position: absolute; width: 150px; height: 150px; border-radius: 50%;
            border: 1px solid; animation: ringPulse 2.2s ease-out infinite;
          }
          .ring2 { animation-delay: 1.1s; }
          @keyframes breathe { 0%,100% { transform: scale(1) } 50% { transform: scale(1.04) } }
          @keyframes ringPulse {
            0%   { transform: scale(1);   opacity: .7 }
            100% { transform: scale(1.7); opacity: 0 }
          }
        `}</style>
      </div>
    )
  }

  // Ended → Generating report
  if (isEnded) {
    return (
      <div style={{ fontFamily: 'system-ui, sans-serif', background: '#0B0D11', color: '#F0EDE8', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <div style={{ fontWeight: 900, fontSize: 20, marginBottom: 28 }}>
          <span style={{ color: '#F0EDE8' }}>Barbar</span><span style={{ color: '#CC785C' }}>os</span>
        </div>

        {genError ? (
          <>
            <div style={{ fontSize: 13, color: '#F87171', marginBottom: 18, maxWidth: 360 }}>{genError}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 260 }}>
              <button type="button" onClick={goToReport}
                style={{ padding: '12px 24px', background: '#CC785C', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                {L.retry}
              </button>

              <button type="button" onClick={() => { window.location.href = '/onboarding' }}
                style={{ padding: '11px 24px', background: 'transparent', border: '0.5px solid rgba(255,255,255,0.15)', borderRadius: 10, color: 'rgba(240,237,232,0.6)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {L.newInterview}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>{L.complete}</div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, margin: '8px 0 16px' }}>
              {[0,1,2].map(i => (
                <div key={i} className="bdot" style={{ animationDelay: `${i * 0.2}s` }} />
              ))}
            </div>

            <div style={{ fontSize: 14, color: '#F0EDE8', fontWeight: 600, minHeight: 20, transition: 'opacity .3s' }}>{genSteps[genStep]}</div>
            <div style={{ fontSize: 11, color: 'rgba(240,237,232,0.4)', marginTop: 6 }}>{L.generating}</div>
          </>
        )}

        <style>{`
          .bdot { width: 9px; height: 9px; background: #CC785C; border-radius: 50%; animation: pulse 1.2s infinite; }
          @keyframes pulse { 0%,100% { opacity: .3; transform: scale(.8) } 50% { opacity: 1; transform: scale(1.2) } }
        `}</style>
      </div>
    )
  }

  // Main Executive Interview Room
  return (
    <div
      onClick={handleFirstInteraction}
      style={{ fontFamily: 'system-ui, sans-serif', background: '#0B0D11', color: '#F0EDE8', minHeight: '100vh', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}
    >
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: '0.5px solid rgba(255,255,255,0.07)', background: 'rgba(15,17,23,0.6)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{CONFIG.jobTitle}</div>
          <div style={{ fontSize: 10, color: 'rgba(240,237,232,0.4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{CONFIG.institution}</div>
        </div>

        <div style={{ textAlign: 'center', flexShrink: 0, padding: '0 12px' }}>
          <div style={{ fontWeight: 900, fontSize: 15, letterSpacing: 0.3 }}>
            <span style={{ color: '#F0EDE8' }}>BARBAR</span><span style={{ color: '#CC785C' }}>OS</span>
          </div>
          <div style={{ fontSize: 9, color: 'rgba(240,237,232,0.45)', letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 1 }}>{L.sessionActive}</div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <span style={{ fontWeight: 900, fontSize: 16, color: timeLeft < 60 ? '#F87171' : '#F0EDE8' }}>{formatTime(timeLeft)}</span>
          <button type="button" onClick={toggleMute}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 9, color: 'rgba(240,237,232,0.5)', display: 'flex', alignItems: 'center', gap: 4, padding: 0, fontFamily: 'inherit' }}>
            {isMuted ? '🔇' : '🔊'} {isMuted ? L.audioMuted : L.audioOn}
          </button>
        </div>
      </div>

      {started && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 18px 0' }}>
          <button type="button" onClick={() => setShowTranscript(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(240,237,232,0.4)', fontSize: 11, fontFamily: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3 }}>
            {L.transcript}
          </button>
        </div>
      )}

      {/* Center: Barbaros presence */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 26, padding: '20px 24px' }}>
        {!started ? (
          <>
            <div className="orb" style={{ boxShadow: `0 0 60px ${glow}55, inset 0 0 40px ${glow}22`, borderColor: `${glow}66` }}>
              <div style={{ fontWeight: 900, fontSize: 26 }}>
                <span style={{ color: '#F0EDE8' }}>B</span><span style={{ color: '#CC785C' }}>os</span>
              </div>
            </div>

            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>{L.readyTitle}</div>
              <div style={{ fontSize: 12, color: 'rgba(240,237,232,0.5)' }}>{CONFIG.candidateName} · {CONFIG.jobTitle}</div>
            </div>

            <button type="button" onClick={() => callAdam([])}
              style={{ padding: '13px 36px', background: '#CC785C', border: 'none', borderRadius: 12, color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 6px 24px rgba(204,120,92,0.35)' }}>
              {L.begin}
            </button>
          </>
        ) : (
          <>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {animated && <div className="ring" style={{ borderColor: `${glow}55` }} />}
              {animated && <div className="ring ring2" style={{ borderColor: `${glow}33` }} />}
              <div className={animated ? 'orb breathe' : 'orb'} style={{ boxShadow: `0 0 70px ${glow}66, inset 0 0 44px ${glow}22`, borderColor: `${glow}77` }}>
                <div style={{ fontWeight: 900, fontSize: 28 }}>
                  <span style={{ color: '#F0EDE8' }}>B</span><span style={{ color: '#CC785C' }}>os</span>
                </div>
              </div>
            </div>

            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: glow === '#3A4252' ? 'rgba(240,237,232,0.65)' : glow, transition: 'color .3s' }}>{stateLabel}</div>
              <div style={{ fontSize: 11, color: 'rgba(240,237,232,0.4)', marginTop: 4 }}>{stateSub}</div>
            </div>

            {lastQuestion && (
              <div style={{ textAlign: 'center', maxWidth: 470, maxHeight: 170, overflowY: 'auto', fontSize: 17, lineHeight: 1.6, fontWeight: 500, color: '#F0EDE8', padding: '0 8px' }}>
                {lastQuestion}
              </div>
            )}

            {currentFocus && (
              <div style={{ textAlign: 'center', padding: '8px 16px', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 12, background: 'rgba(255,255,255,0.02)' }}>
                <div style={{ fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase', color: 'rgba(240,237,232,0.4)', marginBottom: 4 }}>{L.focusLabel}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#8B96FF' }}>{currentFocus}</div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom controls */}
      {started && (
        <div style={{ padding: '14px 18px 22px', borderTop: '0.5px solid rgba(255,255,255,0.05)' }}>
          {micError && (
            <div style={{ textAlign: 'center', marginBottom: 12 }}>
              <button type="button" onClick={() => setShowTextInput(true)}
                style={{ background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.25)', borderRadius: 8, color: '#F87171', fontSize: 11.5, padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit' }}>
                ⌨ {L.micFail}
              </button>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center' }}>
            <div />

            <button type="button" onClick={toggleRecording} disabled={isLoading || isTranscribing || isClosing}
              style={{ justifySelf: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: (isLoading || isTranscribing || isClosing) ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              <div style={{
                width: 76, height: 76, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30,
                background: isRecording ? '#DC2626' : '#CC785C',
                boxShadow: isRecording ? '0 0 28px rgba(220,38,38,0.65)' : '0 6px 22px rgba(204,120,92,0.4)',
                transition: 'all .15s',
                opacity: (isLoading || isTranscribing || isClosing) ? 0.4 : 1,
              }}>
                {isTranscribing ? '⏳' : isRecording ? '⏹' : '🎤'}
              </div>
              <span style={{ fontSize: 10, color: 'rgba(240,237,232,0.55)' }}>
                {isRecording ? (CONFIG.language === 'ar' ? 'إيقاف وإرسال' : 'Tap to send') : (CONFIG.language === 'ar' ? 'تحدّث' : 'Speak')}
              </span>
            </button>

            <div style={{ justifySelf: 'end' }}>
              <button type="button" onClick={() => setShowEndModal(true)}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(248,113,113,0.7)', fontFamily: 'inherit' }}>
                <div style={{ width: 46, height: 46, borderRadius: '50%', border: '0.5px solid rgba(248,113,113,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>⛔</div>
                <span style={{ fontSize: 10 }}>{L.end}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transcript panel */}
      {showTranscript && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(11,13,17,0.96)', display: 'flex', flexDirection: 'column', zIndex: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '0.5px solid rgba(255,255,255,0.07)' }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{L.transcriptTitle}</span>
            <button type="button" onClick={() => setShowTranscript(false)}
              style={{ background: 'none', border: '0.5px solid rgba(255,255,255,0.2)', borderRadius: 8, color: '#F0EDE8', fontSize: 12, padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit' }}>
              ✕ {L.close}
            </button>
          </div>

          <div ref={chatRef} style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {messages.map((msg, i) => {
              const label = msg.score?.score !== undefined ? scoreLabel(msg.score.score) : null

              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'assistant' ? 'flex-start' : 'flex-end', maxWidth: '88%', alignSelf: msg.role === 'assistant' ? 'flex-start' : 'flex-end' }}>
                  <div style={{ background: msg.role === 'assistant' ? '#1a1f2e' : '#1E3A8A', borderRadius: 10, padding: '10px 13px', fontSize: 13, lineHeight: 1.7 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, marginBottom: 4, textTransform: 'uppercase', color: msg.role === 'assistant' ? '#8B96FF' : 'rgba(255,255,255,0.5)' }}>
                      {msg.role === 'assistant'
                        ? <><span style={{ color: '#F0EDE8' }}>Barbar</span><span style={{ color: '#CC785C' }}>os</span></>
                        : CONFIG.candidateName}
                    </div>
                    {msg.content}
                    {label && (
                      <div style={{ marginTop: 6, padding: '2px 8px', background: 'rgba(255,255,255,0.04)', borderRadius: 5, fontSize: 10, color: label.color, display: 'inline-block' }}>● {label.text}</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Text input panel */}
      {showTextInput && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: '#0F1117', borderTop: '0.5px solid rgba(255,255,255,0.1)', padding: '14px 16px', zIndex: 25, boxShadow: '0 -10px 30px rgba(0,0,0,0.4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: 'rgba(240,237,232,0.5)' }}>{L.typeHere}</span>
            <button type="button" onClick={() => setShowTextInput(false)}
              style={{ background: 'none', border: 'none', color: 'rgba(240,237,232,0.5)', fontSize: 14, cursor: 'pointer' }}>✕</button>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
              placeholder={L.typeHere} disabled={isLoading || isClosing} rows={1}
              style={{ flex: 1, background: '#16181F', border: '0.5px solid rgba(255,255,255,0.08)', color: '#F0EDE8', fontFamily: 'inherit', fontSize: 13, padding: '10px 12px', borderRadius: 8, outline: 'none', resize: 'none' }} />

            <button type="button" onClick={sendMessage} disabled={isLoading || isClosing || !input.trim()}
              style={{ width: 46, background: (isLoading || isClosing || !input.trim()) ? '#1a1a22' : '#2563EB', border: 'none', borderRadius: 8, cursor: (isLoading || isClosing || !input.trim()) ? 'not-allowed' : 'pointer', color: '#fff', fontSize: 18, flexShrink: 0 }}>→</button>
          </div>
        </div>
      )}

      {/* End Interview modal */}
      {showEndModal && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 30, padding: 24 }}>
          <div style={{ background: '#12151C', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '26px 22px', maxWidth: 360, width: '100%', textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>{L.endTitle}</div>
            <div style={{ fontSize: 13, color: 'rgba(240,237,232,0.6)', lineHeight: 1.6, marginBottom: 22 }}>{L.endBody}</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button type="button" onClick={() => {
                setShowEndModal(false)
                requestClosing(genericClosingMessage(), null, true)
              }}
                style={{ padding: '12px 20px', background: '#CC785C', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                {L.endGenerate}
              </button>

              <button type="button" onClick={() => setShowEndModal(false)}
                style={{ padding: '11px 20px', background: 'transparent', border: '0.5px solid rgba(255,255,255,0.15)', borderRadius: 10, color: 'rgba(240,237,232,0.7)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {L.continueBtn}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .orb {
          width: 150px; height: 150px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          background: radial-gradient(circle at 50% 40%, rgba(255,255,255,0.05), rgba(15,17,23,0.9));
          border: 1px solid; transition: box-shadow .4s, border-color .4s;
        }
        .breathe { animation: breathe 2.6s ease-in-out infinite; }
        .ring {
          position: absolute; width: 150px; height: 150px; border-radius: 50%;
          border: 1px solid; animation: ringPulse 2.2s ease-out infinite;
        }
        .ring2 { animation-delay: 1.1s; }
        @keyframes breathe { 0%,100% { transform: scale(1) } 50% { transform: scale(1.04) } }
        @keyframes ringPulse {
          0%   { transform: scale(1);   opacity: .7 }
          100% { transform: scale(1.7); opacity: 0 }
        }
      `}</style>
    </div>
  )
}

export default function InterviewPage() {
  return <InterviewRoom />
}
