import type { Article } from '@/types'

/** Shorter than this is a teaser, an error page, or a page built by JavaScript. */
const MIN_ARTICLE_CHARS = 200

const BLOCKS = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, pre'

/** Article text with paragraph breaks, which is what ArticleViewer splits on. */
function toPlainText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const clean = (text: string | null) => (text ?? '').replace(/\s+/g, ' ').trim()

  const paragraphs = Array.from(doc.body.querySelectorAll(BLOCKS))
    .filter((el) => !el.querySelector(BLOCKS))
    .map((el) => clean(el.textContent))
    .filter(Boolean)
    .join('\n\n')

  // Sites that lay text out in bare divs have few or no block elements.
  const all = clean(doc.body.textContent)
  return paragraphs.length >= all.length / 2 ? paragraphs : all
}

/** `url` must already have passed parseTargetUrl. Throws a message fit to show. */
export async function importArticle(url: string, signal: AbortSignal): Promise<Article> {
  const res = await fetch(`/api/article?url=${encodeURIComponent(url)}`, { signal })
  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.html) throw new Error(body?.error ?? 'FYI could not load that page.')

  const { Readability } = await import('@mozilla/readability')
  const doc = new DOMParser().parseFromString(body.html, 'text/html')
  const parsed = new Readability(doc).parse()
  const content = parsed?.content ? toPlainText(parsed.content) : ''
  if (content.length < MIN_ARTICLE_CHARS) {
    throw new Error('FYI could not find the article text on that page.')
  }

  const host = new URL(url).hostname.replace(/^www\./, '')
  return {
    $id: `url-${Date.now()}`,
    title: parsed?.title?.trim() || host,
    source: parsed?.siteName?.trim() || host,
    content,
    claims: [],
    metadata: {
      url,
      author: parsed?.byline?.trim() || undefined,
      publishedDate: parsed?.publishedTime ?? undefined,
    },
  }
}
