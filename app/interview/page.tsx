'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

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

export default function InterviewPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sessionStartTime] = useState(Date.now())
  const [timeLeft, setTimeLeft] = useState(15 * 60)
  const [overallScore, setOverallScore] = useState<number | null>(null)
  const [questionCount, setQuestionCount] = useState(1)
  const [isEnded, setIsEnded] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [audioReady, setAudioReady] = useState(false)
  const [pendingAudio, setPendingAudio] = useState<string | null>(null)
  const [micError, setMicError] = useState<string | null>(null)

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
      // لا ترسل صمت إذا كان المستخدم يسجل أو يتحول
      if (!isLoadingRef.current && !isEndedRef.current && !isRecordingRef.current && !isTranscribingRef.current) {
        const silenceMsg: Message = { role: 'user', content: '[Candidate is silent]' }
        const newMsgs = [...messagesRef.current, silenceMsg]
        setMessages(newMsgs)
        callAdam(newMsgs)
      }
    }, 30000)
  }, [])

  const startRecording = async () => {
    if (isLoading ||
