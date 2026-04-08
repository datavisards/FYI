import { NextResponse } from 'next/server'
import {
  createCompletion,
  createStreamingCompletion,
  type OpenRouterMessage,
} from '@/lib/openrouter/client'
import { CHAT_MODEL, SEARCH_MODEL, TOOL_AGENT_MODEL } from '@/lib/openrouter/models'
import { buildSystemPrompt, buildUserPrompt, type PromptContext } from '@/lib/openrouter/prompts'
import { getToolDefinitions } from '@/lib/tools/registry'
import { registerSearchTool } from '@/lib/tools/searchTool'
import { registerPythonTool } from '@/lib/tools/pythonTool'
import { createSSEStream } from '@/lib/sse'
import { handleToolLoop } from '@/lib/agent/toolLoop'

// Register tools on module load
registerSearchTool()
registerPythonTool()

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

interface CSVDataForRequest {
  name: string
  headers: string[]
  rows: string[][]
}

export async function POST(request: Request) {
  try {
    const { query, context, history, model, articleContent, tools, csvData, continueMessages } =
      await request.json()

    // Continuation mode: skip prompt building, jump straight to tool loop
    if (continueMessages && Array.isArray(continueMessages)) {
      const parsedCsv: CSVDataForRequest[] = Array.isArray(csvData) ? csvData : []
      return handleToolLoop(continueMessages, tools, parsedCsv.length > 0 ? parsedCsv : undefined)
    }

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

    const parsedCsvData: CSVDataForRequest[] = Array.isArray(csvData) ? csvData : []
    const enabledTools: string[] = tools && Array.isArray(tools) ? tools : []

    // Build system prompt from context
    const promptCtx: PromptContext = {
      hasDataset: parsedCsvData.length > 0,
      hasWebSearch: enabledTools.includes('web_search'),
      hasArticle: !!articleContent,
      articleContent,
    }

    // Add dataset summary if datasets are loaded
    if (parsedCsvData.length > 0) {
      promptCtx.datasetSummary = parsedCsvData
        .map((d) =>
          `- "${d.name}" (${d.rows?.length ?? 0} rows): ${d.headers?.slice(0, 20).join(', ')}${d.headers?.length > 20 ? '...' : ''}`
        )
        .join('\n')
    }

    const systemPrompt = buildSystemPrompt(promptCtx)

    const messages: OpenRouterMessage[] = [
      { role: 'system', content: systemPrompt },
    ]

    // Add history if provided
    if (history && Array.isArray(history)) {
      for (const msg of history) {
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })
      }
    }

    messages.push({
      role: 'user',
      content: buildUserPrompt(query, context),
    })

    // Resolve tool definitions (if any enabled)
    const toolDefs = enabledTools.length > 0 ? getToolDefinitions(enabledTools) : undefined

    // Search-only via Perplexity (no tool-calling, returns citations natively)
    const isSearchOnly = enabledTools.length === 1 && enabledTools[0] === 'web_search'
    if (isSearchOnly && !parsedCsvData.length) {
      return createSSEStream(async (emit) => {
        const response = await createCompletion({
          model: SEARCH_MODEL,
          messages,
          temperature: 0.4,
          max_tokens: 2048,
        })

        const content = response.choices[0]?.message?.content || ''
        const citations = response.citations || []

        emit({ content, citations })
      })
    }

    // Tools available: use tool-capable model with tool_choice: 'auto'
    // The model decides whether to use tools based on the query
    if (toolDefs && toolDefs.length > 0) {
      return handleToolLoop(messages, enabledTools, parsedCsvData.length > 0 ? parsedCsvData : undefined)
    }

    // No tools: streaming chat
    return createSSEStream(async (emit) => {
      const generator = createStreamingCompletion({
        model: model || CHAT_MODEL,
        messages,
        temperature: 0.4,
        max_tokens: 2048,
      })

      for await (const chunk of generator) {
        emit({ content: chunk })
      }
    })
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}
