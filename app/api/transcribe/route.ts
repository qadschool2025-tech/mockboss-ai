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
    openaiForm.append('model', 'gpt-4o-mini-transcribe')
    openaiForm.append('response_format', 'json')

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: openaiForm
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Transcribe error:', response.status, err)
      return NextResponse.json({ success: false, error: err }, { status: 500 })
    }

    const data = await response.json()
    const text = data.text || ''
    const wordCount = text.split(' ').filter(Boolean).length

    console.log('Transcribe success:', text.substring(0, 50))

    return NextResponse.json({
      success: true,
      text,
      analysis: {
        wordCount,
        confidence: 'high',
        hesitation: 'low',
        wordsPerMinute: 120,
        duration: 0
      }
    })

  } catch (err: any) {
    console.error('Transcribe exception:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
