/**
 * Tool registry — type definitions and registration for LLM tool-calling.
 */

export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  description: string
  enum?: string[]
  items?: { type: string }
  required?: boolean
}

export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, ToolParameter>
      required: string[]
    }
  }
}

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface ToolResult {
  tool_call_id: string
  role: 'tool'
  content: string
}

export interface ToolContext {
  [key: string]: unknown
}

export type ToolExecutor = (args: Record<string, unknown>, context?: ToolContext) => Promise<string>

// Global registry
const toolRegistry = new Map<string, { definition: ToolDefinition; executor: ToolExecutor }>()

export function registerTool(
  definition: ToolDefinition,
  executor: ToolExecutor
) {
  toolRegistry.set(definition.function.name, { definition, executor })
}

export function getToolDefinitions(names?: string[]): ToolDefinition[] {
  if (!names) return Array.from(toolRegistry.values()).map((t) => t.definition)
  return names
    .map((n) => toolRegistry.get(n)?.definition)
    .filter((d): d is ToolDefinition => d != null)
}

export function getToolExecutor(name: string): ToolExecutor | undefined {
  return toolRegistry.get(name)?.executor
}

export function getToolExecutorWithContext(name: string, context: ToolContext): ((args: Record<string, unknown>) => Promise<string>) | undefined {
  const executor = toolRegistry.get(name)?.executor
  if (!executor) return undefined
  return (args) => executor(args, context)
}

export function getAllToolNames(): string[] {
  return Array.from(toolRegistry.keys())
}
