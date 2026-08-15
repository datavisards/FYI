export { OPTIONS } from '@/lib/cors'

import { NextResponse } from 'next/server'
import { createCompletion } from '@/lib/openrouter/client'
import { readAiConfig, withAiConfig } from '@/lib/ai/config'
import { DEFAULT_MODELS } from '@/lib/openrouter/models'
import { findClaimOffsets } from '@/lib/claims/parseClaimResponse'

/**
 * Claim Detection Prompt
 * Two-phase approach: LLM classifies each sentence, code finds offsets in article.
 */
const CLAIM_DETECTION_SYSTEM = `You are an expert fact-checking assistant specializing in identifying data claims in text.
A DATA CLAIM is a sentence or clause that uses natural language to assert a specific
fact or insight derived from quantitative, structured data. It must satisfy ALL of the
following criteria:

  1. QUANTITATIVE: It references a numeric value, statistic, percentage, count,
     rank, rate, or measurable quantity.
  2. STRUCTURED: The asserted fact could be verified against a data table or dataset
     (e.g., a spreadsheet of figures, a database of records).
  3. ASSERTIVE: It presents the numeric fact as true, not as a question, prediction,
     or hypothetical.
  4. SPECIFIC: It refers to a defined entity, time period, or subspace
     (explicit or recoverable from context).

Do NOT classify the following as data claims:
  - Qualitative opinions or judgments ("The economy is doing badly.")
  - Vague comparisons without quantification ("Sales are higher than last year.")
  - Predictions or forecasts ("Prices are expected to rise.")
  - Methodology descriptions ("The data was collected via survey.")
  - Emotional or rhetorical statements ("This is an outrage!")`

const CLAIM_DETECTION_USER = `TASK:
Given the following article text, identify every sentence (or self-contained clause)
that is a data claim. Process each sentence independently. For each sentence, reason
step by step, then output a JSON array.

REASONING STEPS for each sentence:
  (a) Does it contain a numeric value, statistic, or quantitative expression?
  (b) Could the asserted figure be verified against a structured dataset?
  (c) Is it stated as a fact (not an opinion, prediction, or question)?
  (d) Is the subject/scope specific enough to be checkable?
  â†’ If yes to all four: classify as a data claim.

OUTPUT FORMAT:
Return a JSON array of objects. Each object must have:
  - "sentence": the original sentence (verbatim)
  - "is_data_claim": true or false
  - "reasoning": one-sentence explanation of your decision
  - "data_fact_hint": (only if is_data_claim = true) the type of data fact being
    asserted. Choose from: [value, proportion, trend, extreme, rank, association,
    difference, categorization, distribution, outlier]

---

FEW-SHOT EXAMPLES:

Sentence: "In 2022, the average house price in the UK fell by 1.1% year-on-year."
â†’ { "is_data_claim": true, "reasoning": "Asserts a specific quantitative change (1.1%) for a defined measure (house price), entity (UK), and time (2022), verifiable against housing data.", "data_fact_hint": "trend" }

Sentence: "Christopher Nolan is widely regarded as one of the greatest directors of his generation."
â†’ { "is_data_claim": false, "reasoning": "This is a qualitative opinion with no numeric assertion and cannot be verified against a dataset." }

Sentence: "Oppenheimer's worldwide gross accounts for approximately 20% of Christopher Nolan's total box office earnings."
â†’ { "is_data_claim": true, "reasoning": "Asserts a proportion (20%) of a quantitative measure (gross) for specific entities, verifiable against box office data.", "data_fact_hint": "proportion" }

Sentence: "The unemployment rate fell between April 2020 and March 2023."
â†’ { "is_data_claim": true, "reasoning": "Asserts a directional change (trend) in a defined measure over a specific timeframe, verifiable against employment datasets.", "data_fact_hint": "trend" }

Sentence: "Trae Young ranked 4th in three-point attempts among point guards who played more than 60 games in 2023."
â†’ { "is_data_claim": true, "reasoning": "Asserts a specific rank for a named entity within a defined subspace, verifiable against NBA statistics.", "data_fact_hint": "rank" }

Sentence: "Prices are expected to stabilize by the end of the year."
â†’ { "is_data_claim": false, "reasoning": "This is a prediction, not an assertion of an existing quantitative fact verifiable against current data." }

---

Now process the following article:

{{ARTICLE_TEXT}}`

export async function POST(request: Request) {
  return withAiConfig(readAiConfig(request), () => handlePost(request))
}

async function handlePost(request: Request) {
  try {
    const { content, existingClaims } = await request.json()

    if (!content) {
      return NextResponse.json(
        { error: 'Article content is required' },
        { status: 400 }
      )
    }

    // If we already have pre-marked claims (exploration mode), just return them
    if (existingClaims && Array.isArray(existingClaims) && existingClaims.length > 0) {
      return NextResponse.json({ claims: existingClaims })
    }

    // Use LLM to detect claims
    const result = await createCompletion({
      model: DEFAULT_MODELS['detect-claims'],
      messages: [
        {
          role: 'system',
          content: CLAIM_DETECTION_SYSTEM,
        },
        {
          role: 'user',
          content: CLAIM_DETECTION_USER.replace('{{ARTICLE_TEXT}}', content),
        },
      ],
      temperature: 0.2,
      max_tokens: 8192,
    })

    const response = result.choices[0]?.message?.content || ''

    // Parse the JSON response
    let claims: Array<{
      id: string
      text: string
      startOffset: number
      endOffset: number
      data_fact_hint?: string
    }> = []
    try {
      // Extract the JSON array robustly: find the first '[' and its matching ']'.
      // This handles models that output reasoning prose before/after the array,
      // as well as markdown code fences.
      const arrayStart = response.indexOf('[')
      const arrayEnd = response.lastIndexOf(']')
      if (arrayStart === -1 || arrayEnd === -1 || arrayEnd < arrayStart) {
        throw new Error('No JSON array found in response')
      }
      const jsonStr = response.slice(arrayStart, arrayEnd + 1)

      const rawClaims = JSON.parse(jsonStr) as Array<{
        sentence: string
        is_data_claim: boolean
        reasoning: string
        data_fact_hint?: string
      }>

      // Phase 2: Filter to data claims only, then calculate offsets
      const matchedClaims: typeof claims = []
      const unmatchedClaims: string[] = []

      for (const rawClaim of rawClaims) {
        if (!rawClaim.is_data_claim) continue

        const match = findClaimOffsets(content, rawClaim.sentence)

        if (match) {
          matchedClaims.push({
            id: `claim-${matchedClaims.length + 1}`,
            text: match.actualText,
            startOffset: match.start,
            endOffset: match.end,
            ...(rawClaim.data_fact_hint ? { data_fact_hint: rawClaim.data_fact_hint } : {}),
          })
        } else {
          unmatchedClaims.push(rawClaim.sentence)
        }
      }

      claims = matchedClaims
    } catch (parseError) {
      console.error('Failed to parse LLM response:', parseError)
      return NextResponse.json(
        { error: 'Failed to parse claim detection response', raw: response },
        { status: 500 }
      )
    }

    return NextResponse.json({ claims })
  } catch (error) {
    console.error('Claim detection error:', error)
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}
