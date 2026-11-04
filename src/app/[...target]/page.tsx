import { notFound, redirect } from 'next/navigation'

import { parseTargetUrl } from '@/lib/article/targetUrl'

/**
 * The address prefix: putting our domain in front of an article's address, as in
 * /https://site.com/story, opens that article in the app. Other unknown paths
 * stay 404s. Real routes and public files take precedence over this catch-all.
 */
export default async function ArticlePrefixPage({
  params,
  searchParams,
}: {
  params: Promise<{ target: string[] }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { target } = await params

  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const v of [value ?? ''].flat()) query.append(key, v)
  }
  const queryString = query.toString()

  // Next hands over segments still encoded, so `https:` arrives as `https%3A`.
  // The rest stays encoded: it is part of the address we are about to request.
  const [first, ...rest] = target
  const path = [first.replace(/%3A/gi, ':'), ...rest].join('/')

  const url = parseTargetUrl(path + (queryString ? `?${queryString}` : ''))
  if (!url) notFound()
  redirect(`/app?url=${encodeURIComponent(url)}`)
}
