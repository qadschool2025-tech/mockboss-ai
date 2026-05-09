import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const audio = formData.get('audio') as Blob

    if (!audio) {
      return NextResponse.json({ success: false, error: 'No audio' }, { status: 400 })
    }

    const openaiForm = new FormData()
    openaiForm.append('file', audio, 'recording.webm')
    openaiForm.append('model', 'whisper-1')
    openaiForm.append('language', 'en')
    openaiForm.append('response_format', 'verbose_json')

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: openaiForm
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Whisper error:', response.status, err)
      return NextResponse.json({ success: false, error: err }, { status: 500 })
    }

    const data = await response.json()
    const text = data.text || ''
    const duration = data.duration || 0
    const wordCount = text.split(' ').filter(Boolean).length
    const wordsPerMinute = duration > 0 ? Math.round((wordCount / duration) * 60) : 120

    const analysis = {
      wordsPerMinute,
      duration: Math.round(duration),
      wordCount,
      confidence: wordsPerMinute > 100 && wordsPerMinute < 180 ? 'high' : wordsPerMinute < 80 ? 'low' : 'medium',
      hesitation: wordsPerMinute < 80 ? 'high' : wordsPerMinute < 110 ? 'medium' : 'low',
    }

    console.log('Whisper success:', text.substring(0, 50), '| WPM:', wordsPerMinute)

    return NextResponse.json({ success: true, text, analysis })

  } catch (err: any) {
    console.error('Transcribe exception:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
