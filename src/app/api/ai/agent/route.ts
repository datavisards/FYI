export { OPTIONS } from '@/lib/cors'

import { NextResponse } from 'next/server'
import { CHAT_MODEL } from '@/lib/openrouter/models'
import { createPlan, executeStep, synthesize } from '@/lib/agent/agentRunner'
import { registerSearchTool } from '@/lib/tools/searchTool'
import { createSSEStream } from '@/lib/sse'
import { readAiConfig, withAiConfig } from '@/lib/ai/config'

// Register tools
registerSearchTool()

export async function POST(request: Request) {
  return withAiConfig(readAiConfig(request), () => handlePost(request))
}

async function handlePost(request: Request) {
  try {
    const { question } = await request.json()

    if (!question) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 })
    }

    const model = CHAT_MODEL

    return createSSEStream(async (emit) => {
      // Phase 1: Planning
      emit({ type: 'status', message: 'Planning research steps...' })

      const steps = await createPlan(question, model)

      emit({ type: 'plan', steps })

      // Phase 2: Execution
      for (const step of steps) {
        step.status = 'running'
        emit({ type: 'step_start', stepId: step.id, description: step.description })

        try {
          const result = await executeStep(step)
          step.result = result
          step.status = 'done'
        } catch (err) {
          step.result = `Error: ${(err as Error).message}`
          step.status = 'error'
        }

        emit({
          type: 'step_result',
          stepId: step.id,
          status: step.status,
          result: (step.result || '').slice(0, 1000),
        })
      }

      // Phase 3: Synthesis
      emit({ type: 'status', message: 'Synthesizing findings...' })

      const report = await synthesize(question, steps, model)

      // Stream synthesis in chunks for progressive rendering
      const chunkSize = 100
      for (let i = 0; i < report.length; i += chunkSize) {
        emit({ type: 'synthesis_chunk', content: report.slice(i, i + chunkSize) })
      }

      // Collect sources from search results
      const sources: string[] = []
      for (const step of steps) {
        if (step.result) {
          const urlMatches = step.result.match(/https?:\/\/[^\s\]]+/g)
          if (urlMatches) sources.push(...urlMatches)
        }
      }

      emit({ type: 'complete', sources: [...new Set(sources)] })
    })
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}
