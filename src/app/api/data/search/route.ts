export { OPTIONS } from '@/lib/cors'

import { NextResponse } from 'next/server'
import { readAiConfig, resolveSearchModel, withAiConfig } from '@/lib/ai/config'
import { createCompletion } from '@/lib/openrouter/client'

const PROMPT = `You find the source datasets behind news articles.
Find publicly available datasets that the article's data claims could be checked against: the data it cites, or the closest official source.
Prefer direct links to CSV or TSV files, then pages that offer them for download. Only give addresses you found in your search. Never invent one.
Reply with only a JSON array of at most 6 objects like {"url": "...", "why": "one short sentence"}. Reply with [] if you find nothing.`

function parseResults(content: string): { url: string; why?: string }[] {
  const json = content.slice(content.indexOf('['), content.lastIndexOf(']') + 1)
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Returns addresses only. The browser fetches and checks each one before showing it. */
export async function POST(request: Request) {
  return withAiConfig(readAiConfig(request), () => handlePost(request))
}

async function handlePost(request: Request) {
  try {
    const { title, excerpt } = await request.json()
    if (typeof excerpt !== 'string' || !excerpt.trim()) {
      return NextResponse.json({ error: 'Article text is required' }, { status: 400 })
    }

    const model = resolveSearchModel()
    if (!model) {
      return NextResponse.json(
        { error: 'Your AI provider has no search-capable model.' },
        { status: 400 }
      )
    }

    const response = await createCompletion({
      model,
      messages: [
        { role: 'system', content: PROMPT },
        {
          role: 'user',
          content: `Title: ${String(title ?? '').slice(0, 300)}\n\nArticle:\n${excerpt.slice(0, 3000)}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 800,
    })

    const results = parseResults(response.choices[0]?.message?.content ?? '')
    // The model's sources are real pages even when its answer has no usable links.
    const cited = (response.citations ?? []).map((url) => ({ url }))
    return NextResponse.json({ results: [...results, ...cited] })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
