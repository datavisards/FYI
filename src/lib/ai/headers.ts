/**
 * Header names for bring-your-own-key credentials, shared by client and server.
 *
 * Keep this module import-free: its server-side counterpart, ai/config.ts, uses
 * node:async_hooks, which cannot be bundled for the browser.
 */
export const AI_HEADERS = {
  key: 'x-fyi-api-key',
  baseUrl: 'x-fyi-api-base',
  model: 'x-fyi-model',
  searchModel: 'x-fyi-search-model',
} as const

/** Sent on every response so the browser will allow these on a cross-origin call. */
export const AI_HEADER_LIST = Object.values(AI_HEADERS).join(', ')
