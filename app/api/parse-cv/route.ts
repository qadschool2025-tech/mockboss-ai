import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createHash } from 'crypto'
import type { ParsedCv } from '@/lib/barbaros/types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const SUPPORTED_FILE_TYPES = new Set([
  'text/plain',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

    if (!SUPPORTED_FILE_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
    }

    let text = ''

    if (file.type === 'text/plain') {
      text = await file.text()
    } else {
      const bytes = await file.arrayBuffer()
      const base64 = Buffer.from(bytes).toString('base64')
      const isPdf = file.type === 'application/pdf'

      const response = await client.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 1500,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: isPdf
                    ? 'application/pdf'
                    : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                  data: base64,
                },
              } as any,
              {
                type: 'text',
                text: 'Extract all text from this CV. Return ONLY the raw text, no commentary.',
              },
            ],
          },
        ],
      })

      text = collectTextBlocks(response)
    }

    const trimmedText = text.slice(0, 4000)
    const sourceTextHash = createHash('sha256').update(trimmedText).digest('hex')
    const fallbackSummary = buildFallbackSummary(trimmedText)

    if (!trimmedText.trim()) {
      return NextResponse.json({
        text: trimmedText,
        cvSummary: fallbackSummary,
        parsedCv: buildFallbackParsedCv(trimmedText, file.name, sourceTextHash, fallbackSummary),
      })
    }

    try {
      const parsedCv = await extractParsedCv(trimmedText, file.name, sourceTextHash)

      return NextResponse.json({
        text: trimmedText,
        cvSummary: parsedCv.summary || fallbackSummary,
        parsedCv,
      })
    } catch (parseErr: any) {
      console.error('parse-cv structured parse failed:', parseErr.message)

      return NextResponse.json({
        text: trimmedText,
        cvSummary: fallbackSummary,
        parsedCv: buildFallbackParsedCv(trimmedText, file.name, sourceTextHash, fallbackSummary),
      })
    }
  } catch (err: any) {
    console.error('parse-cv error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

async function extractParsedCv(
  text: string,
  sourceFileName: string,
  sourceTextHash: string
): Promise<ParsedCv> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1500,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Extract structured CV data from the raw CV text below.

Return STRICT JSON only. No markdown. No commentary.

Use this exact JSON shape:
{
  "candidateName": "string if found",
  "headline": "string if found",
  "currentTitle": "string if found",
  "currentCompany": "string if found",
  "totalYearsExperience": "string if obvious",
  "summary": "2-4 sentence concise CV summary",
  "roles": [
    {
      "title": "string",
      "company": "string",
      "location": "string",
      "startDate": "string",
      "endDate": "string",
      "isCurrent": true,
      "responsibilities": ["string"],
      "achievements": ["string"],
      "technologies": ["string"]
    }
  ],
  "education": [
    {
      "degree": "string",
      "field": "string",
      "institution": "string",
      "location": "string",
      "startDate": "string",
      "endDate": "string",
      "graduationYear": "string"
    }
  ],
  "projects": [
    {
      "name": "string",
      "role": "string",
      "description": "string",
      "outcomes": ["string"],
      "technologies": ["string"]
    }
  ],
  "skills": ["string"],
  "certifications": ["string"],
  "languages": ["string"],
  "achievements": ["string"]
}

Rules:
- Include only information supported by the CV text.
- Do not invent missing fields.
- Use empty arrays when a section is absent.
- Detect obvious timeline gaps of one year or more only if clear, and mention them inside summary.
- Keep the summary concise.
- Return valid JSON only.

CV text:
${text}`,
          },
        ],
      },
    ],
  })

  const raw = collectTextBlocks(response)
  const parsed = safeJsonParse(raw)

  return {
    candidateName: asString(parsed.candidateName),
    headline: asString(parsed.headline),
    currentTitle: asString(parsed.currentTitle),
    currentCompany: asString(parsed.currentCompany),
    totalYearsExperience: asString(parsed.totalYearsExperience),
    summary: asString(parsed.summary) || buildFallbackSummary(text),
    roles: asArray(parsed.roles),
    education: asArray(parsed.education),
    projects: asArray(parsed.projects),
    skills: asStringArray(parsed.skills),
    certifications: asStringArray(parsed.certifications),
    languages: asStringArray(parsed.languages),
    achievements: asStringArray(parsed.achievements),
    rawText: text,
    sourceFileName,
    sourceTextHash,
    parsedAt: Date.now(),
  }
}

function collectTextBlocks(response: any): string {
  return Array.isArray(response?.content)
    ? response.content
        .filter((block: any) => block?.type === 'text' && typeof block.text === 'string')
        .map((block: any) => block.text)
        .join('\n')
        .trim()
    : ''
}

function safeJsonParse(raw: string): any {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim()

  return JSON.parse(cleaned)
}

function buildFallbackParsedCv(
  text: string,
  sourceFileName: string,
  sourceTextHash: string,
  summary: string
): ParsedCv {
  return {
    summary,
    rawText: text,
    sourceFileName,
    sourceTextHash,
    parsedAt: Date.now(),
  }
}

function buildFallbackSummary(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  return clean.slice(0, 700)
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function asArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? value : []
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map(item => item.trim())
    : []
}
