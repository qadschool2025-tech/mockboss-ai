import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createHash } from 'crypto'
import type { ParsedCv } from '@/lib/barbaros/types'

export const runtime = 'nodejs'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

type SupportedCvFileKind = 'text' | 'pdf' | 'docx'

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

const SUPPORTED_FILE_TYPES = new Set([
  'text/plain',
  'application/pdf',
  DOCX_MIME,
])

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file' }, { status: 400 })
    }

    const fileKind = getSupportedFileKind(file)

    if (!fileKind) {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
    }

    let text = ''

    if (fileKind === 'text') {
      text = await file.text()
    } else {
      text = await extractTextFromDocument(file, fileKind)
    }

    const trimmedText = text.slice(0, 4000)
    const sourceTextHash = createHash('sha256').update(trimmedText).digest('hex')

    if (!trimmedText.trim()) {
      const parsedCv = buildFallbackParsedCv(
        trimmedText,
        file.name,
        sourceTextHash,
        ''
      )

      return NextResponse.json({
        text: trimmedText,
        cvSummary: parsedCv.summary ?? '',
        parsedCv,
      })
    }

    try {
      const parsedCv = await extractParsedCv(
        trimmedText,
        file.name,
        sourceTextHash
      )

      return NextResponse.json({
        text: trimmedText,
        cvSummary: parsedCv.summary ?? buildFallbackSummary(trimmedText),
        parsedCv,
      })
    } catch (parseErr: any) {
      console.error('parse-cv structured parse failed:', parseErr.message)

      const parsedCv = buildFallbackParsedCv(
        trimmedText,
        file.name,
        sourceTextHash,
        buildFallbackSummary(trimmedText)
      )

      return NextResponse.json({
        text: trimmedText,
        cvSummary: parsedCv.summary ?? '',
        parsedCv,
      })
    }
  } catch (err: any) {
    console.error('parse-cv error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

function getSupportedFileKind(file: File): SupportedCvFileKind | null {
  const name = file.name.toLowerCase().trim()

  if (SUPPORTED_FILE_TYPES.has(file.type)) {
    if (file.type === 'text/plain') return 'text'
    if (file.type === 'application/pdf') return 'pdf'
    if (file.type === DOCX_MIME) return 'docx'
  }

  if (name.endsWith('.txt')) return 'text'
  if (name.endsWith('.pdf')) return 'pdf'
  if (name.endsWith('.docx')) return 'docx'

  return null
}

async function extractTextFromDocument(
  file: File,
  fileKind: Exclude<SupportedCvFileKind, 'text'>
): Promise<string> {
  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')

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
              media_type:
                fileKind === 'pdf'
                  ? 'application/pdf'
                  : DOCX_MIME,
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

  return collectTextBlocks(response)
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

  const parsedCv: ParsedCv = {
    candidateName: asString(parsed.candidateName),
    headline: asString(parsed.headline),
    currentTitle: asString(parsed.currentTitle),
    currentCompany: asString(parsed.currentCompany),
    totalYearsExperience: asString(parsed.totalYearsExperience),
    summary: asString(parsed.summary) ?? buildFallbackSummary(text),
    roles: asTypedArray<NonNullable<ParsedCv['roles']>[number]>(parsed.roles),
    education: asTypedArray<NonNullable<ParsedCv['education']>[number]>(parsed.education),
    projects: asTypedArray<NonNullable<ParsedCv['projects']>[number]>(parsed.projects),
    skills: asStringArray(parsed.skills),
    certifications: asStringArray(parsed.certifications),
    languages: asStringArray(parsed.languages),
    achievements: asStringArray(parsed.achievements),
    rawText: text,
    sourceFileName,
    sourceTextHash,
    parsedAt: Date.now(),
  }

  return parsedCv
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

  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('No valid JSON object found in CV parser response')
  }

  return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1))
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

function asTypedArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map(item => item.trim())
    : []
}
