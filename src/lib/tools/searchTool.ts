/**
 * Web search tool — uses Groq Compound (web search).
 */
import { registerTool, type ToolDefinition } from './registry'
import { createCompletion } from '@/lib/openrouter/client'
import { SEARCH_MODEL } from '@/lib/openrouter/models'

const definition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'web_search',
    description:
      'Search the web for current information, facts, statistics, or news. Returns relevant results with source citations. Use this when you need up-to-date information or to verify claims.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query',
        },
      },
      required: ['query'],
    },
  },
}

async function execute(args: Record<string, unknown>): Promise<string> {
  const query = String(args.query || '')
  if (!query) return 'Error: No search query provided'

  try {
    const response = await createCompletion({
      model: SEARCH_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are a research assistant. Provide concise, factual answers with specific data points. Always cite your sources.',
        },
        { role: 'user', content: query },
      ],
      temperature: 0.3,
      max_tokens: 1024,
    })

    const content = response.choices[0]?.message?.content || 'No results found.'
    const citations = response.citations || []

    // Format result with citations
    let result = content
    if (citations.length > 0) {
      result += '\n\nSources:\n' + citations.map((url, i) => `[${i + 1}] ${url}`).join('\n')
    }

    return result
  } catch (error) {
    return `Search error: ${(error as Error).message}`
  }
}

export function registerSearchTool() {
  registerTool(definition, execute)
}
