import type { Claim } from '@/types'

/**
 * Extract the minimal diff between two strings by trimming their common prefix and suffix.
 * Useful for showing only the changed portion when a user enters a full corrected sentence.
 *
 * Returns the narrowed old/new portions, or the originals if the diff spans most of the string.
 */
export function extractCorrectionDiff(
  target: string,
  replacement: string
): { oldPart: string; newPart: string } {
  let prefixLen = 0
  const minLen = Math.min(target.length, replacement.length)
  while (prefixLen < minLen && target[prefixLen] === replacement[prefixLen]) {
    prefixLen++
  }

  let suffixLen = 0
  while (
    suffixLen < minLen - prefixLen &&
    target[target.length - 1 - suffixLen] === replacement[replacement.length - 1 - suffixLen]
  ) {
    suffixLen++
  }

  const oldMiddle = target.slice(prefixLen, target.length - suffixLen).trim()
  const newMiddle = replacement.slice(prefixLen, replacement.length - suffixLen).trim()

  // Only use narrowed diff if it's substantially shorter than the full string
  if (oldMiddle.length < target.length * 0.8 && oldMiddle.length > 0 && newMiddle.length > 0) {
    return { oldPart: oldMiddle, newPart: newMiddle }
  }
  return { oldPart: target, newPart: replacement }
}

/**
 * Check if two offset ranges overlap.
 */
function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart
}

/**
 * Merges claims from multiple sources with overlap detection and dismissal filtering.
 *
 * Rules:
 * 1. User claims always win over AI claims at the same region
 * 2. Dismissed AI claims are excluded
 * 3. AI claims that overlap any user claim are suppressed
 *
 * @param articleClaims - Claims from the article data
 * @param aiDetectedClaims - Claims detected by AI
 * @param userManualClaims - Claims manually marked by the user
 * @param dismissedClaimIds - IDs of AI claims the user dismissed
 * @returns Merged and sorted array of claims
 */
export function getOrderedClaims(
  articleClaims: Claim[] = [],
  aiDetectedClaims: Claim[] = [],
  userManualClaims: Array<{ id: string; text: string; startOffset: number; endOffset: number; category?: string }> = [],
  dismissedClaimIds: string[] = []
): Claim[] {
  const dismissedSet = new Set(dismissedClaimIds)

  // Build user claims list first (they always win over AI).
  // Dismissed user claims are excluded from the merged list just like dismissed AI claims.
  const userClaims: Claim[] = userManualClaims
    .filter((claim) => !dismissedSet.has(claim.id))
    .map((claim) => ({
      id: claim.id,
      text: claim.text,
      startOffset: claim.startOffset,
      endOffset: claim.endOffset,
      category: claim.category as Claim['category'],
      source: 'user' as const,
    }))

  // Filter AI claims: skip dismissed, skip overlapping with user claims
  const filteredAiClaims: Claim[] = aiDetectedClaims.filter((ai) => {
    if (dismissedSet.has(ai.id)) return false
    const overlapsUser = userClaims.some((uc) =>
      rangesOverlap(uc.startOffset, uc.endOffset, ai.startOffset, ai.endOffset)
    )
    return !overlapsUser
  }).map((claim) => ({ ...claim, source: 'ai' as const }))

  // Merge: article claims, then filtered AI, then user claims (user wins by ID)
  const byId = new Map<string, Claim>()
  articleClaims.forEach((claim) => byId.set(claim.id, claim))
  filteredAiClaims.forEach((claim) => byId.set(claim.id, claim))
  userClaims.forEach((claim) => byId.set(claim.id, claim))

  // Sort by startOffset (position in article), then by text
  return Array.from(byId.values()).sort((a, b) => {
    if (a.startOffset !== undefined && b.startOffset !== undefined) {
      return a.startOffset - b.startOffset
    }
    return a.text.localeCompare(b.text)
  })
}
