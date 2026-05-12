import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function POST(req: NextRequest) {
  try {
    const { config, overallScore, criteria, strongestAnswer, weakestAnswer, hiringRisks, repeatedMistakes } = await req.json()

    const prompt = `You are a senior HR director writing a confidential recruiter evaluation note after an interview.

CANDIDATE PROFILE:
- Name: ${config.candidateName}
- Job Title: ${config.jobTitle}
- Institution: ${config.institution}
- Sector: ${config.sector}
- Experience: ${config.yearsExperience || config.experienceLevel}
- Country: ${config.country || 'Not specified'}

INTERVIEW SCORES:
- Overall: ${overallScore}/100
- Clarity: ${criteria.clarity}/100
- Confidence: ${criteria.confidence}/100
- Relevance: ${criteria.relevance}/100
- Technical Depth: ${criteria.technical_depth}/100
- Structure: ${criteria.structure}/100
- Communication: ${criteria.communication}/100
- Problem Solving: ${criteria.problem_solving}/100
- Leadership: ${criteria.leadership}/100

STRONGEST ANSWER (score: ${strongestAnswer.score}/100):
Question: "${strongestAnswer.question?.slice(0, 150)}"
Answer: "${strongestAnswer.answer?.slice(0, 200)}"

WEAKEST ANSWER (score: ${weakestAnswer.score}/100):
Question: "${weakestAnswer.question?.slice(0, 150)}"
Answer: "${weakestAnswer.answer?.slice(0, 200)}"

HIRING RISKS IDENTIFIED: ${hiringRisks.join(', ')}
REPEATED PATTERNS: ${repeatedMistakes.length ? repeatedMistakes.join(', ') : 'None'}

INSTRUCTIONS:
Write a 3-sentence recruiter evaluation note. 
- Sentence 1: Describe the candidate's overall presentation and strongest quality shown in THIS interview.
- Sentence 2: Name the specific weakness that most concerned you based on the actual scores above.
- Sentence 3: Give a clear hiring recommendation with one condition or next step.

Rules:
- Be specific to THIS candidate — use their name, job title, and sector
- Reference actual performance data, not generic statements
- Be direct and professional — this is a confidential internal note
- Do NOT use the word "candidate" — use their name
- Write in ${config.language === 'ar' ? 'Arabic' : 'English'}
- No quotation marks around the output
- Output the 3 sentences only, nothing else`

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }]
    })

    const evaluation = response.content[0].type === 'text' ? response.content[0].text.trim() : ''

    return NextResponse.json({ success: true, evaluation })

  } catch (error: any) {
    console.error('Recruiter eval error:', error.message)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
