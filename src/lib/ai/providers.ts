/**
 * Provider presets for bring-your-own-key.
 *
 * Every entry here speaks the OpenAI chat-completions wire format, which is the
 * only format this app knows how to send (see src/lib/openrouter/client.ts).
 * That is why the list is long but the adapter is one line: for these
 * providers, switching is nothing more than a different base URL and key.
 *
 * Deliberately NOT here, because they are not OpenAI-compatible and would each
 * need a real adapter:
 *
 *   - Anthropic native. Different endpoint (/v1/messages), different auth
 *     header (x-api-key), different tool-call and streaming schemas. Use
 *     Claude through OpenRouter instead, which works today.
 *   - Azure OpenAI. Deployment-based URL path plus an api-version query
 *     parameter and an api-key header.
 *   - AWS Bedrock and Google Vertex. Request signing (SigV4 / OAuth) rather
 *     than a bearer token, which a user-supplied key cannot express.
 */

/**
 * A model the picker offers. Every id here is one this repo already uses; do
 * not add ids from memory, since a model the provider does not serve is worse
 * than free text.
 */
export interface ModelOption {
  id: string
  label: string
    /** Tool calling, needed by Auto Check, the Python tool and the agent. */
  tools: 'yes' | 'no' | 'varies'
  /** Searches the web and returns citations. */
  search: boolean
}

export interface ProviderPreset {
  id: string
  label: string
  /** Base URL. '/chat/completions' is appended to this. */
  baseUrl: string
  /** Where the user gets a key. Empty for local providers that need none. */
  keyUrl: string
  /** Shown as the model-field placeholder, so people know the id format. */
  exampleModel: string
    /** Per-model capability lives on `models`, which is what the form shows. */
  toolCalling: 'yes' | 'varies'
    /** Empty means the provider has none, and the web_search tool is withheld. */
  searchModel: string
  /** Offered in the model picker, most generally useful first. */
  models: ModelOption[]
  note?: string
}

export const PROVIDERS: ProviderPreset[] = [
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyUrl: 'https://openrouter.ai/keys',
    exampleModel: 'openai/gpt-4.1',
    toolCalling: 'yes',
    searchModel: 'perplexity/sonar',
    models: [
      { id: 'openai/gpt-4.1', label: 'GPT-4.1', tools: 'yes', search: false },
      { id: 'openai/gpt-4o', label: 'GPT-4o', tools: 'yes', search: false },
      { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B', tools: 'yes', search: false },
      { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B', tools: 'varies', search: false },
      { id: 'perplexity/sonar', label: 'Perplexity Sonar', tools: 'no', search: true },
    ],
    note: 'Recommended. One key reaches models from OpenAI, Anthropic, Google, Meta and others, and web search works.',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    keyUrl: 'https://platform.openai.com/api-keys',
    exampleModel: 'gpt-4.1',
    toolCalling: 'yes',
    searchModel: 'gpt-4o-search-preview',
    models: [
      { id: 'gpt-4.1', label: 'GPT-4.1', tools: 'yes', search: false },
      { id: 'gpt-4o-search-preview', label: 'GPT-4o Search', tools: 'no', search: true },
    ],
  },
  {
    id: 'perplexity',
    label: 'Perplexity',
    baseUrl: 'https://api.perplexity.ai',
    keyUrl: 'https://www.perplexity.ai/settings/api',
    exampleModel: 'sonar-pro',
    toolCalling: 'varies',
    searchModel: 'sonar',
    models: [
      { id: 'sonar-pro', label: 'Sonar Pro', tools: 'varies', search: true },
      { id: 'sonar', label: 'Sonar', tools: 'varies', search: true },
    ],
    note: 'Every Perplexity model searches the web natively, so search works well here. Tool calling is limited, so Auto Check and the Python tool may not.',
  },
  {
    id: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyUrl: 'https://console.groq.com/keys',
    exampleModel: 'llama-3.3-70b-versatile',
    toolCalling: 'yes',
    searchModel: 'groq/compound',
    models: [
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', tools: 'yes', search: false },
      { id: 'groq/compound', label: 'Groq Compound', tools: 'no', search: true },
    ],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    exampleModel: 'deepseek-chat',
    toolCalling: 'yes',
    searchModel: '',
    models: [{ id: 'deepseek-chat', label: 'DeepSeek Chat', tools: 'yes', search: false }],
  },
  {
    id: 'mistral',
    label: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    keyUrl: 'https://console.mistral.ai/api-keys',
    exampleModel: 'mistral-large-latest',
    toolCalling: 'yes',
    searchModel: '',
    models: [{ id: 'mistral-large-latest', label: 'Mistral Large', tools: 'yes', search: false }],
  },
  {
    id: 'xai',
    label: 'xAI',
    baseUrl: 'https://api.x.ai/v1',
    keyUrl: 'https://console.x.ai',
    exampleModel: 'grok-4',
    toolCalling: 'yes',
    searchModel: '',
    models: [{ id: 'grok-4', label: 'Grok 4', tools: 'yes', search: false }],
    note: 'Grok can search the web, but only through xAI’s search_parameters extension, which this app does not send.',
  },
  {
    id: 'together',
    label: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    keyUrl: 'https://api.together.xyz/settings/api-keys',
    exampleModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    toolCalling: 'varies',
    searchModel: '',
    models: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', label: 'Llama 3.3 70B Turbo', tools: 'varies', search: false },
    ],
  },
  {
    id: 'fireworks',
    label: 'Fireworks',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    keyUrl: 'https://fireworks.ai/account/api-keys',
    exampleModel: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
    toolCalling: 'varies',
    searchModel: '',
    models: [
      { id: 'accounts/fireworks/models/llama-v3p3-70b-instruct', label: 'Llama 3.3 70B', tools: 'varies', search: false },
    ],
  },
  {
    id: 'cerebras',
    label: 'Cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    keyUrl: 'https://cloud.cerebras.ai',
    exampleModel: 'llama-3.3-70b',
    toolCalling: 'varies',
    searchModel: '',
    models: [{ id: 'llama-3.3-70b', label: 'Llama 3.3 70B', tools: 'varies', search: false }],
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keyUrl: 'https://aistudio.google.com/apikey',
    exampleModel: 'gemini-2.5-flash',
    toolCalling: 'varies',
    searchModel: '',
    models: [{ id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', tools: 'varies', search: false }],
    note: 'Uses Google’s OpenAI-compatible endpoint. Search grounding is only in the native Gemini API, so search is unavailable here.',
  },
  {
    id: 'ollama',
    label: 'Ollama (local)',
    baseUrl: 'http://localhost:11434/v1',
    keyUrl: '',
    exampleModel: 'llama3.3',
    toolCalling: 'varies',
    searchModel: '',
    models: [{ id: 'llama3.3', label: 'Llama 3.3', tools: 'varies', search: false }],
    note: 'Only works when you are running FYI on the same machine. The hosted app runs on Cloudflare and cannot reach your localhost.',
  },
  {
    id: 'custom',
    label: 'Other (OpenAI-compatible)',
    baseUrl: '',
    keyUrl: '',
    exampleModel: 'model-id',
    toolCalling: 'varies',
    searchModel: '',
    models: [],
    note: 'Any endpoint that implements POST /chat/completions in OpenAI format.',
  },
]

export function getProvider(id: string): ProviderPreset | undefined {
  return PROVIDERS.find((p) => p.id === id)
}
