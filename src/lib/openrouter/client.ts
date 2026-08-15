import type { ToolDefinition, ToolCall } from '@/lib/tools/registry'
import { resolveAiConfig, type AiConfig } from '@/lib/ai/config'
import { SEARCH_MODEL } from '@/lib/openrouter/models'

/** A request already aimed at a search model keeps it, or it stops citing. */
function applyModelOverride(model: string, config: AiConfig): string {
  if (!config.model) return model
  if (model === SEARCH_MODEL) return model
  if (config.searchModel && model === config.searchModel) return model
  return config.model
}

/** Providers echo keys back in errors; strip them before they reach the UI. */
function redact(message: string, apiKey: string): string {
  let out = message
  if (apiKey) out = out.split(apiKey).join('[redacted]')
  // Catch partially-echoed or differently-formatted keys too.
  return out.replace(/\b(sk|gsk|xai|key)-[A-Za-z0-9_-]{4,}/gi, '[redacted]')
}

async function errorFrom(response: Response, apiKey: string): Promise<Error> {
  const body = await response.json().catch(() => ({}))
  const raw = body.error?.message || body.message || `API error (${response.status})`
  return new Error(redact(String(raw), apiKey))
}

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
  const config = resolveAiConfig()
  const { baseUrl, apiKey } = config

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      ...request,
      model: applyModelOverride(request.model, config),
      stream: false,
    }),
  })

  if (!response.ok) {
    throw await errorFrom(response, apiKey)
  }

  return response.json()
}

/**
 * Config is resolved here, synchronously. An async generator's body does not
 * run until the first next(), by which point the request-scoped store is gone,
 * so resolving inside would silently fall back to the server key.
 */
export function createStreamingCompletion(
  request: OpenRouterRequest
): AsyncGenerator<string, void, unknown> {
  return streamCompletion(request, resolveAiConfig())
}

async function* streamCompletion(
  request: OpenRouterRequest,
  config: AiConfig
): AsyncGenerator<string, void, unknown> {
  const { baseUrl, apiKey } = config

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      ...request,
      model: applyModelOverride(request.model, config),
      stream: true,
    }),
  })

  if (!response.ok) {
    throw await errorFrom(response, apiKey)
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
