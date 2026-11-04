'use client'

import { useState } from 'react'
import { AlignLeft, ArrowRight, Table2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { StepShell } from '@/components/onboarding/StepShell'
import { parseTargetUrl } from '@/lib/article/targetUrl'
import { cn } from '@/lib/utils'


export interface SampleArticle {
  id: string
  title: string
    /** Keep in step with the CSV; the real count is read on the next step. */
  datasetLabel: string
  lengthLabel: string
  data: unknown
  dataset: { name: string; path: string }
}

const WEB_ADDRESS = 'web-address'
const PASTE = 'paste'

function Option({
  selected,
  onSelect,
  children,
}: {
  selected: boolean
  onSelect: () => void
  children: React.ReactNode
}) {
  return (
    <div
      onClick={onSelect}
      className={cn(
        'cursor-pointer rounded-lg border p-4 transition-colors',
        selected
          ? 'border-foreground/40 bg-accent/40 ring-foreground/10 ring-2'
          : 'border-border bg-card hover:border-foreground/25'
      )}
    >
      {children}
    </div>
  )
}

function Dot({ selected }: { selected: boolean }) {
  return (
    <span
      className={cn(
        'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border',
        selected ? 'border-foreground' : 'border-muted-foreground/40'
      )}
      aria-hidden
    >
      {selected && <span className="bg-foreground size-2 rounded-full" />}
    </span>
  )
}

export function ArticleStep({
  samples,
  onUseSample,
  onUseText,
  onUseUrl,
  importError,
  onBack,
}: {
  samples: SampleArticle[]
  onUseSample: (sample: SampleArticle) => void
  onUseText: (text: string) => void
  /** Receives an address that has passed parseTargetUrl. */
  onUseUrl: (url: string) => void
  /** Why an article from a web address did not load. */
  importError?: { message: string; url: string | null } | null
  /** Returns to the article already open, if there is one. */
  onBack?: () => void
}) {
  // After a failed load the notice points at the paste box, and this screen has
  // just remounted, so the address is restored from the error.
  const [selected, setSelected] = useState<string | null>(importError ? PASTE : WEB_ADDRESS)
  const [address, setAddress] = useState(importError?.url ?? '')
  const [text, setText] = useState('')

  const target = parseTargetUrl(address)
  const addressReady = selected === WEB_ADDRESS && target !== null
  const pasteReady = selected === PASTE && text.trim().length > 0
  const sample = samples.find((s) => s.id === selected)
  const canContinue = Boolean(sample) || pasteReady || addressReady

  const commit = () => {
    if (sample) return onUseSample(sample)
    if (pasteReady) return onUseText(text.trim())
    if (addressReady) return onUseUrl(target!)
  }

  return (
    <StepShell
      title="Choose an article"
      description="FYI checks the data claims in a piece of writing against a dataset."
      onBack={onBack}
      footer={
        <Button size="sm" onClick={commit} disabled={!canContinue} className="gap-1.5">
          Start investigating
          <ArrowRight className="size-4" />
        </Button>
      }
    >
      <div className="space-y-3">
        {importError && (
          <div role="alert" className="border-destructive/40 rounded-lg border p-4 text-sm">
            <p className="font-medium">{importError.message}</p>
            <p className="text-muted-foreground mt-1">
              {importError.url ? (
                <>
                  Copy the text from{' '}
                  <a
                    href={importError.url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2"
                  >
                    the original page
                  </a>{' '}
                  and paste it below.
                </>
              ) : (
                'Paste the article text below instead.'
              )}
            </p>
          </div>
        )}
        <Option selected={selected === WEB_ADDRESS} onSelect={() => setSelected(WEB_ADDRESS)}>
          <div className="flex items-start gap-3">
            <Dot selected={selected === WEB_ADDRESS} />
            <div className="min-w-0 flex-1">
              <label htmlFor="article-address" className="text-sm leading-snug font-medium">
                Open from webpage
              </label>
              <Input
                id="article-address"
                type="url"
                inputMode="url"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onFocus={() => setSelected(WEB_ADDRESS)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commit()
                }}
                placeholder="https://site.com/article"
                aria-invalid={address.trim() !== '' && target === null}
                className="mt-2"
              />
              <p className="text-muted-foreground mt-1.5 text-xs">
                {address.trim() !== '' && target === null
                  ? 'Enter a public web address, like https://site.com/article.'
                  : 'Some sites block automatic reading. If so, paste the text instead.'}
              </p>
            </div>
          </div>
        </Option>

        {samples.map((s) => (
          <Option key={s.id} selected={selected === s.id} onSelect={() => setSelected(s.id)}>
            <div className="flex items-start gap-3">
              <Dot selected={selected === s.id} />
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug font-medium">{s.title}</p>
                <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className="inline-flex items-center gap-1.5">
                    <Table2 className="size-3 shrink-0" />
                    {s.datasetLabel}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <AlignLeft className="size-3 shrink-0" />
                    {s.lengthLabel}
                  </span>
                </div>
              </div>
            </div>
          </Option>
        ))}

        <Option selected={selected === PASTE} onSelect={() => setSelected(PASTE)}>
          <div className="flex items-start gap-3">
            <Dot selected={selected === PASTE} />
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug font-medium">Paste your own</p>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onFocus={() => setSelected(PASTE)}
                placeholder="Paste an article or a paragraph here."
                className="mt-2 min-h-24 resize-none border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
              />
            </div>
          </div>
        </Option>
      </div>
    </StepShell>
  )
}
