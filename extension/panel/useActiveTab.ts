import { useEffect, useState } from 'react'

export interface ActiveTab {
  id: number | null
  url: string
  title: string
}

/** Identity of a page, ignoring the hash so in-page anchors still match. */
export function pageKey(url: string | undefined): string {
  if (!url) return ''
  try {
    const parsed = new URL(url)
    parsed.hash = ''
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return url
  }
}

export function samePage(a: string | undefined, b: string | undefined): boolean {
  const left = pageKey(a)
  return left !== '' && left === pageKey(b)
}

/**
 * The tab the user is currently looking at.
 *
 * The side panel is one document shared by every tab in its window, so this is
 * how it knows which page it is in front of. Reading `url` and `title` needs
 * the `<all_urls>` host permission.
 */
export function useActiveTab(): ActiveTab {
  const [tab, setTab] = useState<ActiveTab>({ id: null, url: '', title: '' })

  useEffect(() => {
    let cancelled = false

    const read = () => {
      chrome.tabs
        .query({ active: true, currentWindow: true })
        .then(([found]) => {
          if (cancelled) return
          setTab({
            id: found?.id ?? null,
            url: found?.url ?? '',
            title: found?.title ?? '',
          })
        })
        .catch(() => {})
    }

    read()

    const onActivated = () => read()
    const onUpdated = (
      _tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
      updated: chrome.tabs.Tab
    ) => {
      if (!updated.active) return
      if (changeInfo.url || changeInfo.title || changeInfo.status === 'complete') read()
    }

    chrome.tabs.onActivated.addListener(onActivated)
    chrome.tabs.onUpdated.addListener(onUpdated)
    return () => {
      cancelled = true
      chrome.tabs.onActivated.removeListener(onActivated)
      chrome.tabs.onUpdated.removeListener(onUpdated)
    }
  }, [])

  return tab
}
