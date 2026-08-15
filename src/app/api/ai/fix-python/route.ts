export { OPTIONS } from '@/lib/cors'

import { NextResponse } from 'next/server'
import { createCompletion } from '@/lib/openrouter/client'
import { readAiConfig, withAiConfig } from '@/lib/ai/config'
import { CHAT_MODEL } from '@/lib/openrouter/models'

const SYSTEM_PROMPT = `You are a Python code fixer. The user ran Python code in a browser-based Pyodide environment and it failed.

Fix the code so it runs correctly. Key rules:
- The available DataFrames are PRE-LOADED as snake_case variables (e.g. "CO2 Emissions Data" â†’ co2_emissions_data). Do NOT use pd.read_csv() â€” the data is already in memory.
- Available libraries: pandas (pd), numpy (np), and standard Python.
- Use print() for output.

Return ONLY the corrected Python code. No explanation, no markdown fences, no comments about what you changed.`

interface FixRequest {
  code: string
  error: string
  datasetInfo: { name: string; columns: string[] }[]
}

export async function POST(request: Request) {
  return withAiConfig(readAiConfig(request), () => handlePost(request))
}

async function handlePost(request: Request) {
  try {
    const { code, error, datasetInfo } = (await request.json()) as FixRequest

    if (!code || !error) {
      return NextResponse.json({ error: 'code and error are required' }, { status: 400 })
    }

    const datasetContext = datasetInfo?.length
      ? `\n\nAvailable DataFrames:\n${datasetInfo.map((d) => `- ${d.name} (columns: ${d.columns.join(', ')})`).join('\n')}`
      : ''

    const response = await createCompletion({
      model: CHAT_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT + datasetContext },
        {
          role: 'user',
          content: `This code failed:\n\`\`\`python\n${code}\n\`\`\`\n\nError:\n${error}\n\nReturn only the fixed Python code.`,
        },
      ],
      temperature: 0,
      max_tokens: 2048,
    })

    let fixedCode = response.choices[0]?.message?.content?.trim() || ''

    // Strip markdown fences if the model wrapped them
    fixedCode = fixedCode.replace(/^```(?:python)?\n?/, '').replace(/\n?```$/, '')

    return NextResponse.json({ code: fixedCode })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
