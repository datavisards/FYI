import type { ToolDefinition, ToolCall } from '@/lib/tools/registry'

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

export interface OpenRouterRequest {
  model: string
  messages: OpenRouterMessage[]
  stream?: boolean
  temperature?: number
  max_tokens?: number
  tools?: ToolDefinition[]
  tool_choice?: 'auto' | 'none' | 'required'
}

export interface OpenRouterResponse {
  id: string
  choices: {
    message: {
      role: string
      content: string | null
      tool_calls?: ToolCall[]
    }
    finish_reason: string
  }[]
  citations?: string[]
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export async function createCompletion(
  request: OpenRouterRequest
): Promise<OpenRouterResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set')

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ ...request, stream: false }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error?.message || error.message || 'API error')
  }

  return response.json()
}

export async function* createStreamingCompletion(
  request: OpenRouterRequest
): AsyncGenerator<string, void, unknown> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set')

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ ...request, stream: true }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error?.message || error.message || 'API error')
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    // Accumulate into buffer to handle lines split across chunk boundaries
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    // Keep the last (potentially incomplete) line in the buffer
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim()
        if (data === '[DONE]') return

        try {
          const parsed = JSON.parse(data)
          const content = parsed.choices?.[0]?.delta?.content
          if (content) yield content
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }

  // Flush any remaining buffered content
  if (buffer.startsWith('data: ')) {
    const data = buffer.slice(6).trim()
    if (data && data !== '[DONE]') {
      try {
        const parsed = JSON.parse(data)
        const content = parsed.choices?.[0]?.delta?.content
        if (content) yield content
      } catch {
        // Skip invalid JSON
      }
    }
  }
}
