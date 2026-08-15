export { OPTIONS } from '@/lib/cors'

import { NextResponse } from 'next/server'
import { createCompletion } from '@/lib/openrouter/client'
import { readAiConfig, withAiConfig } from '@/lib/ai/config'
import { DEFAULT_MODELS } from '@/lib/openrouter/models'

export async function POST(request: Request) {
  return withAiConfig(readAiConfig(request), () => handlePost(request))
}

async function handlePost(request: Request) {
  try {
    const { messages } = await request.json()

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Messages are required' }, { status: 400 })
    }

    // Take only the first exchange (user + assistant) for title generation
    const excerpt = messages
      .slice(0, 4)
      .map((m: { role: string; content: string }) => `${m.role}: ${m.content.slice(0, 200)}`)
      .join('\n')

    const response = await createCompletion({
      model: DEFAULT_MODELS.chart,
      messages: [
        {
          role: 'system',
          content:
            "Generate a short title (3-6 words) summarizing the user's question or topic. Return ONLY the title, no quotes, no explanation.",
        },
        {
          role: 'user',
          content: excerpt,
        },
      ],
      temperature: 0.5,
      max_tokens: 30,
    })

    const title = response.choices[0]?.message?.content?.trim() || 'New Chat'

    return NextResponse.json({ title })
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}
