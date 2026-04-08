export interface ModelInfo {
  id: string
  name: string
  provider: string
  description: string
  recommended?: boolean
  tier: 'budget' | 'standard' | 'premium'
  contextWindow: number
  strengths: string[]
}

export const AVAILABLE_MODELS: ModelInfo[] = [
  {
    id: 'meta-llama/llama-3.3-70b-instruct',
    name: 'Llama 3.3 70B',
    provider: 'OpenRouter',
    description: 'Fast 70B model – great speed and quality',
    recommended: true,
    tier: 'standard',
    contextWindow: 131072,
    strengths: ['speed', 'open-source', 'cost-effective'],
  },
  {
    id: 'meta-llama/llama-3.1-8b-instruct',
    name: 'Llama 3.1 8B',
    provider: 'OpenRouter',
    description: 'Very fast small model – charts and simple tasks',
    tier: 'budget',
    contextWindow: 131072,
    strengths: ['speed', 'cost-effective'],
  },
  {
    id: 'openai/gpt-oss-120b',
    name: 'GPT-OSS 120B',
    provider: 'OpenRouter',
    description: 'Open-weight 120B – capable tool-calling agent',
    tier: 'premium',
    contextWindow: 131072,
    strengths: ['tool-calling', 'reasoning', 'general'],
  },
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    provider: 'OpenRouter',
    description: 'Most capable OpenAI model for complex reasoning',
    tier: 'premium',
    contextWindow: 128000,
    strengths: ['reasoning', 'tool-calling', 'general'],
  },
  {
    id: 'perplexity/sonar',
    name: 'Perplexity Sonar',
    provider: 'OpenRouter',
    description: 'Web search with real-time citations',
    tier: 'standard',
    contextWindow: 127072,
    strengths: ['web-search', 'citations', 'real-time'],
  },
  {
    id: 'perplexity/sonar-pro',
    name: 'Perplexity Sonar Pro',
    provider: 'OpenRouter',
    description: 'Advanced web search with deeper reasoning',
    tier: 'premium',
    contextWindow: 127072,
    strengths: ['web-search', 'citations', 'reasoning'],
  },
  {
    id: 'google/gemini-2.5-flash-lite-preview-09-2025',
    name: 'Gemini 2.5 Flash Lite',
    provider: 'OpenRouter',
    description: 'Fast Gemini model for claim detection',
    tier: 'budget',
    contextWindow: 1048576,
    strengths: ['speed', 'classification', 'cost-effective'],
  },
]

export const TOOL_AGENT_MODEL = 'openai/gpt-4.1'
export const CHAT_MODEL = 'openai/gpt-4.1'
export const SEARCH_MODEL = 'perplexity/sonar'

export type TaskType = 'chat' | 'chart' | 'detect-claims'

export const DEFAULT_MODELS: Record<TaskType, string> = {
  chat: 'openai/gpt-4.1',
  chart: 'openai/gpt-4.1',
  'detect-claims': 'openai/gpt-4.1',
}
