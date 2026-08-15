/**
 * Agent runner — orchestrates multi-step research with planning, tool execution,
 * and synthesis. Used by the agent API endpoint.
 */
import { createCompletion, type OpenRouterMessage } from '@/lib/openrouter/client'
import { getToolExecutor } from '@/lib/tools/registry'

export interface AgentStep {
  id: string
  description: string
  tool?: string
  query?: string
  status: 'pending' | 'running' | 'done' | 'error'
  result?: string
}

export interface AgentPlan {
  question: string
  steps: AgentStep[]
}

const PLANNING_PROMPT = `You are a research planning assistant. Given a research question, create a concise plan of 3-6 steps to thoroughly investigate it.

For each step, specify:
- description: What this step does
- tool: Which tool to use (web_search or none for reasoning)
- query: The specific query/action for the tool

Return ONLY valid JSON in this format:
{
  "steps": [
    { "description": "...", "tool": "web_search", "query": "..." },
    { "description": "...", "tool": "web_search", "query": "..." },
    { "description": "...", "tool": "none", "query": "" }
  ]
}`

export async function createPlan(
  question: string,
  model: string
): Promise<AgentStep[]> {
  const response = await createCompletion({
    model,
    messages: [
      { role: 'system', content: PLANNING_PROMPT },
      { role: 'user', content: question },
    ],
    temperature: 0.3,
    max_tokens: 1024,
  })

  const content = response.choices[0]?.message?.content || '{}'

  // Extract JSON from response (might be wrapped in markdown code blocks)
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return [
      {
        id: 'step-1',
        description: 'Research the topic',
        tool: 'web_search',
        query: question,
        status: 'pending',
      },
    ]
  }

  try {
    const parsed = JSON.parse(jsonMatch[0])
    const steps = (parsed.steps || []).map(
      (s: { description: string; tool?: string; query?: string }, i: number) => ({
        id: `step-${i + 1}`,
        description: s.description,
        tool: s.tool === 'none' ? undefined : s.tool,
        query: s.query || '',
        status: 'pending' as const,
      })
    )
    return steps.length > 0 ? steps : [{ id: 'step-1', description: 'Research the topic', status: 'pending' }]
  } catch {
    return [{ id: 'step-1', description: 'Research the topic', tool: 'web_search', query: question, status: 'pending' }]
  }
}

export async function executeStep(step: AgentStep): Promise<string> {
  if (!step.tool || !step.query) {
    return `Reasoning step: ${step.description}`
  }

  const executor = getToolExecutor(step.tool)
  if (!executor) {
    return `Tool "${step.tool}" not available`
  }

  // Map tool query to appropriate args
  const args: Record<string, unknown> = { query: step.query }

  return executor(args)
}

export async function synthesize(
  question: string,
  steps: AgentStep[],
  model: string
): Promise<string> {
  const findings = steps
    .filter((s) => s.result)
    .map((s) => `## ${s.description}\n${s.result}`)
    .join('\n\n')

  const messages: OpenRouterMessage[] = [
    {
      role: 'system',
      content: `You are a research analyst. Synthesize the findings below into a comprehensive, well-structured report that directly answers the research question. Include citations where available. Be thorough but concise.`,
    },
    {
      role: 'user',
      content: `Research Question: ${question}\n\n--- RESEARCH FINDINGS ---\n\n${findings}\n\n--- END FINDINGS ---\n\nPlease synthesize these findings into a comprehensive report.`,
    },
  ]

  const response = await createCompletion({
    model,
    messages,
    temperature: 0.5,
    max_tokens: 4096,
  })

  return response.choices[0]?.message?.content || 'Unable to synthesize findings.'
}
