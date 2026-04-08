import type { Claim } from '@/types'

const VALID_CATEGORIES = ['statistic', 'causal', 'trend', 'comparison'] as const

/**
 * Find the start and end offsets of a claim text within the article content.
 * Returns the offsets and the actual text from the content (which may differ
 * slightly from the LLM's claim text due to whitespace normalization).
 */
export function findClaimOffsets(
  content: string,
  claimText: string
): { start: number; end: number; actualText: string } | null {
  // Helper to validate and return result with bounds checking
  const validateResult = (
    start: number,
    end: number
  ): { start: number; end: number; actualText: string } | null => {
    // Bounds checking
    if (start < 0 || end > content.length || start >= end) {
      return null
    }
    const actualText = content.substring(start, end)
    // Sanity check: the extracted text should be non-empty
    if (actualText.trim().length === 0) {
      return null
    }
    return { start, end, actualText }
  }

  // Strategy 1: Exact match (preferred - fastest and most accurate)
  const exactIndex = content.indexOf(claimText)
  if (exactIndex !== -1) {
    return validateResult(exactIndex, exactIndex + claimText.length)
  }

  // Strategy 2: Case-insensitive match
  const lowerContent = content.toLowerCase()
  const lowerClaim = claimText.toLowerCase()
  const caseInsensitiveIndex = lowerContent.indexOf(lowerClaim)
  if (caseInsensitiveIndex !== -1) {
    return validateResult(
      caseInsensitiveIndex,
      caseInsensitiveIndex + claimText.length
    )
  }

  // Strategy 3: Normalize whitespace and try again
  // Build a mapping from normalized positions back to original positions
  const normalizedContent = content.replace(/\s+/g, ' ')
  const normalizedClaim = claimText.replace(/\s+/g, ' ')

  const normalizedIndex = normalizedContent.indexOf(normalizedClaim)
  if (normalizedIndex !== -1) {
    // Map back to original positions
    let originalStart = 0
    let normalizedPos = 0

    // Find start position
    while (normalizedPos < normalizedIndex && originalStart < content.length) {
      if (/\s/.test(content[originalStart])) {
        // Skip extra whitespace in original
        while (
          originalStart < content.length - 1 &&
          /\s/.test(content[originalStart + 1])
        ) {
          originalStart++
        }
      }
      originalStart++
      normalizedPos++
    }

    // Find end position
    let originalEnd = originalStart
    let claimPos = 0
    while (claimPos < normalizedClaim.length && originalEnd < content.length) {
      if (/\s/.test(content[originalEnd])) {
        // Skip extra whitespace in original
        while (
          originalEnd < content.length - 1 &&
          /\s/.test(content[originalEnd + 1])
        ) {
          originalEnd++
        }
      }
      originalEnd++
      claimPos++
    }

    return validateResult(originalStart, originalEnd)
  }

  // No match found - don't use fuzzy substring matching as it can cause
  // incorrect highlights that extend beyond the actual text
  return null
}

/**
 * Parse LLM response for claim detection with category support.
 * Validates categories and computes offsets for each claim.
 *
 * @param rawResponse - JSON string from LLM containing array of {text, category}
 * @param content - Full article content to match claims against
 * @returns Array of Claim objects with validated categories and offsets
 */
export function parseClaimResponse(rawResponse: string, content: string): Claim[] {
  // Extract JSON from the response (handle potential markdown code blocks)
  let jsonStr = rawResponse.trim()
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.slice(7)
  } else if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.slice(3)
  }
  if (jsonStr.endsWith('```')) {
    jsonStr = jsonStr.slice(0, -3)
  }
  jsonStr = jsonStr.trim()

  const rawClaims = JSON.parse(jsonStr) as Array<{ text: string; category?: string }>

  // Phase 2: Calculate offsets and validate categories for each claim
  const matchedClaims: Claim[] = []

  for (const rawClaim of rawClaims) {
    const match = findClaimOffsets(content, rawClaim.text)

    if (match) {
      // Validate category - set to undefined if invalid or missing
      const category = rawClaim.category && VALID_CATEGORIES.includes(rawClaim.category as typeof VALID_CATEGORIES[number])
        ? (rawClaim.category as 'statistic' | 'causal' | 'trend' | 'comparison')
        : undefined

      matchedClaims.push({
        id: `claim-${matchedClaims.length + 1}`,
        text: match.actualText,
        startOffset: match.start,
        endOffset: match.end,
        category,
      })
    }
  }

  return matchedClaims
}
