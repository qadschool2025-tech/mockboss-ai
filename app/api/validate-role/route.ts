import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are a strict input validator for a job-interview platform. Your only task is to decide whether the text the user sends is a plausible job title, role, or occupation.

Answer with EXACTLY one word — VALID or INVALID — and nothing else.

Answer VALID if the text could plausibly describe ANY job, role, or occupation a human might hold, in any language. This includes:
- Standard titles (Data Analyst, Teacher, Nurse, Accountant)
- Rare, informal, or manual roles (window cleaner, substitute player, night guard, street vendor)
- Modern or newly coined roles (content creator, drone pilot, prompt engineer, growth hacker)
- Titles written in Arabic or any other language (منظف شبابيك، لاعب احتياط، صانع محتوى، طيّار درون)

Answer INVALID only if the text is clearly NOT an occupation, such as:
- Random characters or keyboard mashing (asdfghjk, qweqwe, zxcvbn, asdfghjkasdfg)
- Repeated or meaningless character strings
- Pure numbers or symbols with no occupational meaning

When uncertain, lean toward VALID. Output only the single word VALID or INVALID.`

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const jobTitle = typeof body?.jobTitle === 'string' ? body.jobTitle.trim() : ''

    // Format guard — handled redundantly here in case the client guard is bypassed
    if (!jobTitle || jobTitle.length < 2 || jobTitle.length > 80) {
      return NextResponse.json({ valid: false })
    }

    const completion = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 10,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: jobTitle }],
    })

    const text = completion.content
      .filter(b => b.type === 'text')
      .map(b => (b as any).text)
      .join('')
      .replace(/[^A-Za-z]/g, '')
      .toUpperCase()

    // "INVALID" must not be read as valid — check it first
    const valid = !text.startsWith('INVALID') && text.startsWith('VALID')

    return NextResponse.json({ valid })
  } catch {
    // Fail-open: never block a real user because of a network or API error
    return NextResponse.json({ valid: true })
  }
}
