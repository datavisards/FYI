chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id, windowId: tab.windowId })
})

/**
 * Where to deliver a message aimed at a page.
 *
 * Highlights carry the tab they belong to, since their text offsets only make
 * sense on that page. Messages about whatever the reader is looking at now,
 * such as extraction, fall back to the active tab.
 */
function resolveTabId(payload: unknown): Promise<number | null> {
  const named = (payload as { tabId?: number } | undefined)?.tabId
  if (typeof named === 'number') return Promise.resolve(named)
  return chrome.tabs
    .query({ active: true, currentWindow: true })
    .then(([tab]) => tab?.id ?? null)
    .catch(() => null)
}

chrome.runtime.onMessage.addListener(
  (
    message: { type: string; payload?: unknown },
    _sender,
    sendResponse: (response?: unknown) => void
  ) => {
    if (message.type === 'GET_ARTICLE') {
      chrome.tabs
        .query({ active: true, currentWindow: true })
        .then(([tab]) => {
          if (tab?.id == null) {
            sendResponse({ error: 'No active tab' })
            return
          }
          chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_ARTICLE' })
            .then(sendResponse)
            .catch((err) => sendResponse({ error: String(err) }))
        })
        .catch((err) => sendResponse({ error: String(err) }))
      return true
    }
    if (message.type === 'HIGHLIGHT_CLAIMS') {
      resolveTabId(message.payload)
        .then((tabId) => {
          if (tabId == null) {
            sendResponse({ error: 'No target tab' })
            return
          }
          chrome.tabs
            .sendMessage(tabId, { type: 'HIGHLIGHT_CLAIMS', payload: message.payload })
            .then(sendResponse)
            .catch((err) => sendResponse({ error: String(err) }))
        })
        .catch((err) => sendResponse({ error: String(err) }))
      return true
    }
    if (message.type === 'CLAIM_CLICKED' && message.payload) {
      const { claimId } = message.payload as { claimId: string }
      chrome.storage.session.set({ lastClickedClaimId: claimId, lastClickedClaimTs: Date.now() }).then(() => sendResponse(undefined))
      return true
    }
    if (message.type === 'ADD_MANUAL_CLAIM' && message.payload) {
      chrome.storage.session
        .set({ pendingManualClaim: message.payload })
        .then(() => sendResponse(undefined))
      return true
    }
    if (message.type === 'DISMISS_CLAIM' && message.payload) {
      const payload = message.payload as { claimId: string }
      chrome.storage.session
        .set({ pendingDismissClaim: { ...payload, ts: Date.now() } })
        .then(() => sendResponse(undefined))
      return true
    }
    if (message.type === 'CLEAR_HIGHLIGHTS') {
      resolveTabId(message.payload)
        .then((tabId) => {
          if (tabId == null) return sendResponse(undefined)
          chrome.tabs.sendMessage(tabId, { type: 'CLEAR_HIGHLIGHTS' }).then(sendResponse).catch(() => sendResponse(undefined))
        })
        .catch(() => sendResponse(undefined))
      return true
    }
    sendResponse(undefined)
  }
)
