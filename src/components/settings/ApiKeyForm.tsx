'use client'

import { useState } from 'react'
import {
  Loader2,
  Check,
  AlertTriangle,
  ChevronRight,
  ExternalLink,
  HelpCircle,
  Info,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useSettingsStore } from '@/stores/settingsStore'
import { PROVIDERS, getProvider } from '@/lib/ai/providers'
import { apiFetch } from '@/lib/apiClient'
import { cn } from '@/lib/utils'


type TestState = { status: 'idle' | 'testing' | 'ok' | 'fail'; message?: string }

/** Label with its explanation behind an info button. */
function FieldLabel({
  htmlFor,
  hint,
  children,
}: {
  htmlFor: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-1">
      <Label htmlFor={htmlFor}>{children}</Label>
      {hint && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`About ${String(children).trim()}`}
              className="text-muted-foreground/60 hover:text-foreground focus-visible:ring-ring rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <Info className="size-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="start" className="w-72 text-xs leading-relaxed">
            {hint}
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}

/** Sentinel for the picker's escape hatch, distinct from any real model id. */
const OTHER = '__other__'

/** 'varies' is a real state: some providers' tool support depends on the deployment. */
function Capability({
  state,
  label,
  title,
}: {
  state: 'yes' | 'no' | 'varies' | 'unknown'
  label: string
  title: string
}) {
  const Icon = state === 'yes' ? Check : state === 'no' ? X : HelpCircle
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
        state === 'yes'
          ? 'border-green-600/30 bg-green-600/10 text-green-700 dark:text-green-400'
          : state === 'no'
            ? 'border-border text-muted-foreground'
            : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
      )}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      {label}
      {state === 'varies' && <span className="opacity-70">varies</span>}
      {state === 'unknown' && <span className="opacity-70">unverified</span>}
    </span>
  )
}

/** Seed a draft from what is saved. Exported so callers can reseed on open. */
export function draftFromSaved(saved: {
  providerId: string
  baseUrl: string
  apiKey: string
  model: string
  searchModel: string
}) {
  return {
    providerId: saved.providerId,
    baseUrl: saved.baseUrl,
    apiKey: saved.apiKey,
    /* Route defaults are OpenRouter ids, so blank breaks other providers. */
    model: saved.model || (getProvider(saved.providerId)?.models[0]?.id ?? ''),
    searchModel: saved.searchModel || (getProvider(saved.providerId)?.searchModel ?? ''),
  }
}

export interface ApiKeyFormContext {
  /** The fields themselves, for the caller to place. */
  fields: React.ReactNode
  /** Persist the draft to the store. Returns the key that was saved. */
  commit: () => string
  /** True when the draft has a non-empty key. */
  hasKey: boolean
  /** Reset the store and the draft. Null when nothing is saved to clear. */
  clear: (() => void) | null
}

export interface ApiKeyFormProps {
  /** Renders the layout, receiving the fields and the actions. */
  children: (ctx: ApiKeyFormContext) => React.ReactNode
  /** Seed counter: change it to reseed the draft from the store. */
  seed?: number
}

export function ApiKeyForm({ children, seed = 0 }: ApiKeyFormProps) {
  const saved = useSettingsStore()

  // Local draft, so abandoning the form leaves the stored settings alone.
  const [draft, setDraft] = useState(() => draftFromSaved(saved))
  const [seededAt, setSeededAt] = useState(seed)
  const [test, setTest] = useState<TestState>({ status: 'idle' })
  /** True when the model is typed by hand rather than picked. */
  const [custom, setCustom] = useState(false)
  const [advanced, setAdvanced] = useState(false)

  /* In an effect this ran after paint, flashing the previous draft. */
  if (seed !== seededAt) {
    setSeededAt(seed)
    setDraft(draftFromSaved(saved))
    setTest({ status: 'idle' })
  }

  const { providerId, baseUrl, apiKey, model, searchModel } = draft
  const set = (next: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...next }))

  const provider = getProvider(providerId)
  const isCustom = providerId === 'custom'
  const effectiveBaseUrl = isCustom ? baseUrl : (provider?.baseUrl ?? '')

  /** The picked model's declared capabilities, or null when typed by hand. */
  const selectedModel = provider?.models.find((m) => m.id === model) ?? null

  const onProviderChange = (id: string) => {
    const next = getProvider(id)
    setTest({ status: 'idle' })
    setCustom(next?.models.length === 0)
    set({
      providerId: id,
      baseUrl: id === 'custom' ? '' : (next?.baseUrl ?? ''),
      // Model ids do not carry across providers.
      model: next?.models[0]?.id ?? '',
      searchModel: next?.searchModel ?? '',
    })
  }

  /** Goes through our own route, so it exercises headers, CORS and provider. */
  const runTest = async () => {
    if (!apiKey.trim()) {
      setTest({ status: 'fail', message: 'Enter a key first.' })
      return
    }
    setTest({ status: 'testing' })
    try {
      const res = await apiFetch('/api/ai/title', {
        method: 'POST',
        headers: {
          'x-fyi-api-key': apiKey.trim(),
          ...(effectiveBaseUrl ? { 'x-fyi-api-base': effectiveBaseUrl.trim() } : {}),
          ...(model.trim() ? { 'x-fyi-model': model.trim() } : {}),
          ...(searchModel.trim() ? { 'x-fyi-search-model': searchModel.trim() } : {}),
        },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Say ok.' }] }),
      })
      if (res.ok) {
        setTest({ status: 'ok', message: 'Connected.' })
        return
      }
      const body = await res.json().catch(() => ({}))
      setTest({ status: 'fail', message: body.error || `Request failed (${res.status}).` })
    } catch (err) {
      setTest({ status: 'fail', message: (err as Error).message })
    }
  }

  const commit = () => {
    const key = apiKey.trim()
    saved.setSettings({
      providerId,
      baseUrl: effectiveBaseUrl.trim(),
      apiKey: key,
      model: model.trim(),
      searchModel: searchModel.trim(),
    })
    return key
  }

  const clear = () => {
    saved.clear()
    setDraft(draftFromSaved({ ...saved, providerId: 'openrouter', baseUrl: '', apiKey: '', model: '', searchModel: '' }))
    setTest({ status: 'idle' })
  }

  const fields = (
    <div className="space-y-4">
        <div className="space-y-2">
          <FieldLabel htmlFor="provider" hint={provider?.note}>
            Provider
          </FieldLabel>
          <Select value={providerId} onValueChange={onProviderChange}>
            <SelectTrigger id="provider" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROVIDERS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isCustom && (
          <div className="space-y-2">
            <FieldLabel
              htmlFor="baseUrl"
              hint="Must implement POST /chat/completions in OpenAI format."
            >
              Base URL
            </FieldLabel>
            <Input
              id="baseUrl"
              value={baseUrl}
              onChange={(e) => set({ baseUrl: e.target.value })}
              placeholder="https://your-endpoint/v1"
              spellCheck={false}
            />
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <FieldLabel
              // No hint: the step's own description already says the key stays
              // in this browser and is sent per request.
              htmlFor="apiKey"
            >
              API key
            </FieldLabel>
            {provider?.keyUrl && (
              <a
                href={provider.keyUrl}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs transition-colors"
              >
                Get a key
                <ExternalLink className="size-3" />
              </a>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={(e) => {
                set({ apiKey: e.target.value })
                setTest({ status: 'idle' })
              }}
              placeholder={providerId === 'ollama' ? 'ollama' : 'sk-...'}
              autoComplete="off"
              spellCheck={false}
              className="flex-1"
            />
            <Button
              variant="outline"
              onClick={runTest}
              disabled={test.status === 'testing'}
              className="h-9 shrink-0"
            >
              {test.status === 'testing' && <Loader2 className="size-4 animate-spin" />}
              Test
            </Button>
          </div>

          {test.status !== 'idle' && test.status !== 'testing' && (
            <p
              className={cn(
                'flex items-start gap-1.5 text-xs leading-relaxed',
                test.status === 'ok' ? 'text-green-700 dark:text-green-400' : 'text-destructive'
              )}
            >
              {test.status === 'ok' ? (
                <Check className="mt-0.5 size-3.5 shrink-0" />
              ) : (
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              )}
              {test.message}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
          <span className="text-muted-foreground">Using</span>
          <span className="font-medium">{selectedModel?.label ?? model.trim() ?? ''}</span>
          <Capability
            state={selectedModel ? selectedModel.tools : model.trim() ? 'unknown' : 'no'}
            label="Tool calling"
            title="Auto Check, the Python tool and the agent need it. Chat does not."
          />
          <Capability
            state={searchModel.trim() ? 'yes' : 'no'}
            label="Web search"
            title={
              searchModel.trim()
                ? `Runs on ${searchModel.trim()}`
                : 'No search model set, so search is off'
            }
          />
        </div>

        <Collapsible open={advanced} onOpenChange={setAdvanced}>
          <CollapsibleTrigger className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs font-medium transition-colors">
            <ChevronRight
              className={cn('size-3.5 transition-transform', advanced && 'rotate-90')}
              aria-hidden
            />
            Advanced
          </CollapsibleTrigger>

          <CollapsibleContent className="space-y-4 pt-4">
            <div className="space-y-2">
              <FieldLabel htmlFor="model">Model</FieldLabel>
              <Select
                value={custom ? OTHER : model}
                onValueChange={(v) => {
                  if (v === OTHER) {
                    setCustom(true)
                    set({ model: '' })
                    return
                  }
                  setCustom(false)
                  set({ model: v })
                }}
              >
                <SelectTrigger id="model" className="w-full">
                  <SelectValue placeholder="Choose a model" />
                </SelectTrigger>
                <SelectContent>
                  {(provider?.models ?? []).map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                  <SelectItem value={OTHER}>Other...</SelectItem>
                </SelectContent>
              </Select>

              {custom && (
                <Input
                  value={model}
                  onChange={(e) => set({ model: e.target.value })}
                  placeholder={provider?.exampleModel ?? 'model-id'}
                  spellCheck={false}
                  autoFocus
                />
              )}
            </div>

            <div className="space-y-2">
              <FieldLabel htmlFor="searchModel">Web search model</FieldLabel>
              <Input
                id="searchModel"
                value={searchModel}
                onChange={(e) => set({ searchModel: e.target.value })}
                placeholder="None for this provider"
                spellCheck={false}
              />
              <p className="text-muted-foreground text-xs">
                The model used for web search. Leave blank to turn search off.
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
  )

  return (
    <>
      {children({
        fields,
        commit,
        hasKey: apiKey.trim().length > 0,
        clear: saved.apiKey ? clear : null,
      })}
    </>
  )
}
