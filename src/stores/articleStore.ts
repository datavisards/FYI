import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { safeStorage } from './safeStorage'
import type { Article, Claim } from '@/types'

interface ArticleState {
  articles: Article[]
  currentArticleId: string | null
  setCurrentArticleId: (id: string | null) => void
  selectedClaim: Claim | null
  highlightedClaimId: string | null
  scrollPosition: number
  setArticles: (articles: Article[]) => void
  getCurrentArticle: () => Article | null
  setSelectedClaim: (claim: Claim | null) => void
  setHighlightedClaimId: (id: string | null) => void
  setScrollPosition: (position: number) => void
}

/**
 * Persisted so a reload can restore the article the session, claims and
 * datasets all refer to.
 *
 * Only the article set survives; selectedClaim, highlightedClaimId and
 * scrollPosition are view state and are deliberately left out of `partialize`.
 */
export const useArticleStore = create<ArticleState>()(
  persist(
    (set, get) => ({
      articles: [],
      currentArticleId: null,
      setCurrentArticleId: (id) => set({ currentArticleId: id }),
      selectedClaim: null,
      highlightedClaimId: null,
      scrollPosition: 0,
      setArticles: (articles) => set({
        articles,
        currentArticleId: articles.length > 0 ? articles[0].$id : null
      }),
      getCurrentArticle: () => {
        const { articles, currentArticleId } = get()
        return articles.find(a => a.$id === currentArticleId) || null
      },
      setSelectedClaim: (claim) => set({ selectedClaim: claim }),
      setHighlightedClaimId: (id) => set({ highlightedClaimId: id }),
      setScrollPosition: (position) => set({ scrollPosition: position }),
    }),
    {
      name: 'fyi-article-data',
      storage: safeStorage,
      partialize: (state) => ({
        articles: state.articles,
        currentArticleId: state.currentArticleId,
      }),
    }
  )
)
