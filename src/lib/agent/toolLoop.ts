import { createCompletion, type OpenRouterMessage } from '@/lib/openrouter/client'
import { TOOL_AGENT_MODEL } from '@/lib/openrouter/models'
import { getToolDefinitions, getToolExecutorWithContext } from '@/lib/tools/registry'
import { isPythonDeferredResult, parsePythonDeferredResult } from '@/lib/tools/pythonTool'
import { createSSEStream } from '@/lib/sse'

const MAX_TOOL_ROUNDS = 5
const MAX_SSE_RESULT_LENGTH = 500

export function handleToolLoop(
  initialMessages: OpenRouterMessage[],
  tools: string[] | undefined,
  csvData?: { name: string; headers: string[]; rows: string[][] }[]
): Response {
  const enabledTools: string[] = tools && Array.isArray(tools) ? tools : []
  const toolDefs = enabledTools.length > 0 ? getToolDefinitions(enabledTools) : undefined
  const toolContext: Record<string, unknown> = csvData ? { csvData } : {}

  return createSSEStream(
    async (emit) => {
      let currentMessages = [...initialMessages]
      let rounds = 0
      const collectedSources: string[] = []
      let finalContent = ''

      // Tool-calling loop
      while (rounds < MAX_TOOL_ROUNDS) {
        const response = await createCompletion({
          model: TOOL_AGENT_MODEL,
          messages: currentMessages,
          temperature: 0.4,
          max_tokens: 2048,
          tools: toolDefs,
          tool_choice: 'auto',
        })

        const choice = response.choices[0]
        const assistantMsg = choice.message

        // If no tool calls, we have the final response
        if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
          finalContent = assistantMsg.content || ''
          break
        }

        // Execute tool calls
        currentMessages.push({
          role: 'assistant',
          content: assistantMsg.content,
          tool_calls: assistantMsg.tool_calls,
        })

        // Track which tool calls are deferred python
        const deferredPython: { tool_call_id: string; code: string; description: string }[] = []

        for (const toolCall of assistantMsg.tool_calls) {
          const toolName = toolCall.function.name
          const toolArgs = JSON.parse(toolCall.function.arguments || '{}')

          // Notify client about tool execution
          emit({ type: 'tool_call', name: toolName, args: toolArgs })

          const executor = getToolExecutorWithContext(toolName, toolContext)
          let result: string
          if (executor) {
            result = await executor(toolArgs)
          } else {
            result = `Tool "${toolName}" not found`
          }

          // Check if this is a deferred Python execution
          if (isPythonDeferredResult(result)) {
            const parsed = parsePythonDeferredResult(result)
            if (parsed) {
              emit({
                type: 'python_needed',
                code: parsed.code,
                description: parsed.description,
                tool_call_id: toolCall.id,
              })
              deferredPython.push({
                tool_call_id: toolCall.id,
                code: parsed.code,
                description: parsed.description,
              })
              // Do NOT add a tool result message — the client will provide the real output
              continue
            }
          }

          // Collect sources from search results
          if (toolName === 'web_search') {
            const urlMatches = result.match(/https?:\/\/[^\s\])"',]+/g)
            if (urlMatches) collectedSources.push(...urlMatches)
          }

          // Notify client about tool result
          emit({ type: 'tool_result', name: toolName, result: result.slice(0, MAX_SSE_RESULT_LENGTH) })

          currentMessages.push({
            role: 'tool',
            content: result,
            tool_call_id: toolCall.id,
          })
        }

        // If any tool calls were deferred to client-side Python, pause and let client continue
        if (deferredPython.length > 0) {
          emit({
            type: 'awaiting_python',
            pendingMessages: currentMessages,
            deferredPython,
          })
          // Return early — createSSEStream's finally will send [DONE] and close the stream
          return
        }

        rounds++
      }

      // If no content was produced (loop exhausted or model returned empty/null), force a final synthesis
      if (!finalContent) {
        const finalResponse = await createCompletion({
          model: TOOL_AGENT_MODEL,
          messages: currentMessages,
          temperature: 0.4,
          max_tokens: 2048,
        })
        finalContent = finalResponse.choices[0]?.message?.content || ''
      }

      // Send final response
      const uniqueSources = [...new Set(collectedSources)]
      emit({
        content: finalContent,
        citations: uniqueSources.length > 0 ? uniqueSources : undefined,
      })
    },
    { 'Access-Control-Allow-Origin': '*' }
  )
}
