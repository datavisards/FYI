import React from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { Toaster } from '@/components/ui/sonner'
import { ExtensionPanel } from '../panel/ExtensionPanel'
import '@/app/globals.css'

// Font size control (Ctrl/Cmd +/-/0) — browser native zoom doesn't work in side panels
const FONT_SIZE_KEY = 'ext-font-size'
const DEFAULT_FS = 16
const MIN_FS = 10
const MAX_FS = 24

function applyFontSize(px: number) {
  document.documentElement.style.fontSize = `${px}px`
  localStorage.setItem(FONT_SIZE_KEY, String(px))
}

const saved = parseFloat(localStorage.getItem(FONT_SIZE_KEY) ?? String(DEFAULT_FS))
applyFontSize(Math.min(MAX_FS, Math.max(MIN_FS, isNaN(saved) ? DEFAULT_FS : saved)))

document.addEventListener('keydown', (e) => {
  if (!e.ctrlKey && !e.metaKey) return
  const cur = parseFloat(document.documentElement.style.fontSize) || DEFAULT_FS
  if (e.key === '-' || e.key === '_') { e.preventDefault(); applyFontSize(Math.max(MIN_FS, cur - 1)) }
  else if (e.key === '=' || e.key === '+') { e.preventDefault(); applyFontSize(Math.min(MAX_FS, cur + 1)) }
  else if (e.key === '0') { e.preventDefault(); applyFontSize(DEFAULT_FS) }
})

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
  <React.StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <ExtensionPanel />
      <Toaster />
    </ThemeProvider>
  </React.StrictMode>
)
