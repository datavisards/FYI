import { create } from 'zustand'
import type { Article, Claim } from '@/types'

interface ArticleState {
  // Multi-article support
  articles: Article[]
  currentArticleId: string | null
  // Existing state
  setCurrentArticleId: (id: string | null) => void
  selectedClaim: Claim | null
  highlightedClaimId: string | null
  scrollPosition: number
  // Multi-article actions
  setArticles: (articles: Article[]) => void
  getCurrentArticle: () => Article | null
  // Existing actions
  setSelectedClaim: (claim: Claim | null) => void
  setHighlightedClaimId: (id: string | null) => void
  setScrollPosition: (position: number) => void
}

export const useArticleStore = create<ArticleState>((set, get) => ({
  // Multi-article state
  articles: [],
  currentArticleId: null,
  // Existing state
  setCurrentArticleId: (id) => set({ currentArticleId: id }),
  selectedClaim: null,
  highlightedClaimId: null,
  scrollPosition: 0,
  // Multi-article actions
  setArticles: (articles) => set({
    articles,
    currentArticleId: articles.length > 0 ? articles[0].$id : null
  }),
  getCurrentArticle: () => {
    const { articles, currentArticleId } = get()
    return articles.find(a => a.$id === currentArticleId) || null
  },
  // Existing actions
  setSelectedClaim: (claim) => set({ selectedClaim: claim }),
  setHighlightedClaimId: (id) => set({ highlightedClaimId: id }),
  setScrollPosition: (position) => set({ scrollPosition: position }),
}))
