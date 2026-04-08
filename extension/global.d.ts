/// <reference types="chrome" />

declare const chrome: typeof import('chrome');

// CSS Custom Highlight API (Chrome 105+)
declare class Highlight {
  constructor(...ranges: AbstractRange[])
  add(range: AbstractRange): void
  delete(range: AbstractRange): boolean
  has(range: AbstractRange): boolean
  clear(): void
  readonly size: number
  priority: number
}

interface HighlightRegistry {
  set(name: string, highlight: Highlight): void
  get(name: string): Highlight | undefined
  has(name: string): boolean
  delete(name: string): boolean
  clear(): void
  readonly size: number
}

interface CSS {
  highlights: HighlightRegistry
}
