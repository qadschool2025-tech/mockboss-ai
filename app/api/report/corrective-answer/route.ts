import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!
})

export async function POST(req: NextRequest) {
  try {
    const { question, userAnswer, jobTitle, sector, score, language } = await req.json()

    if (!question || !userAnswer) {
      return NextResponse.json({ correctiveAnswer: null })
    }

    if (score && score >= 75) {
      return NextResponse.json({
        correctiveAnswer: language === 'ar'
          ? '✅ إجابة قوية — لا تحتاج تصحيحاً.'
          : '✅ Strong answer — no correction needed.'
      })
    }

    const isAr = language === 'ar'

    const systemPrompt = isAr
      ? `أنت مدرب مقابلات خبير. مهمتك تقديم تغذية راجعة مباشرة وإجابة تصحيحية قوية.
قواعد صارمة:
1. اشرح في جملة واحدة لماذا كانت الإجابة ضعيفة
2. قدّم إجابة تصحيحية قوية مناسبة للوظيفة والقطاع
3. لا تتجاوز 100 كلمة إجمالاً
4. كن مباشراً وواقعياً — لا مجاملة
5. استخدم أسلوب STAR إذا كان السؤال سلوكياً
6. اذكر أرقاماً ونتائج قابلة للقياس
7. طابق مستوى الخبرة المطلوبة للوظيفة
8. أجب بالعربية فقط`
      : `You are a senior hiring coach. Your task is to give direct feedback and a strong corrective answer.
Strict rules:
1. One sentence explaining why the answer was weak
2. Provide a strong corrective answer suited to the job and sector
3. Keep total under 100 words
4. Be direct and realistic — no flattery
5. Use STAR format if behavioral question
6. Include numbers and measurable outcomes
7. Match the candidate seniority level
8. Respond in English only`

    const userPrompt = isAr
      ? `الوظيفة: ${jobTitle}
القطاع: ${sector}
السؤال: ${question}
إجابة المرشح: ${userAnswer}
الدرجة: ${score}/100

قدّم:
1. سبب الضعف (جملة واحدة)
2. إجابة تصحيحية أقوى`
      : `Job Title: ${jobTitle}
Sector: ${sector}
Question: ${question}
Candidate Answer: ${userAnswer}
Score: ${score}/100

Provide:
1. Why it was weak (one sentence)
2. A stronger corrective answer`

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    })

    const correctiveAnswer = response.content[0].type === 'text'
      ? response.content[0].text.trim()
      : null

    return NextResponse.json({ correctiveAnswer })

  } catch (err: any) {
    console.error('Corrective answer error:', err.message)
    return NextResponse.json({ correctiveAnswer: null }, { status: 500 })
  }
}
