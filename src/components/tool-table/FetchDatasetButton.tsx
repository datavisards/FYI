'use client'

import { useEffect, useState } from 'react'
import { Database, ExternalLink, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { isExtension } from '@/lib/apiClient'
import {
  discoverDatasets,
  type DatasetCandidate,
  type DatasetSource,
} from '@/lib/data/discoverDatasets'
import { useArticleStore } from '@/stores/articleStore'
import { useDataStore } from '@/stores/dataStore'
import { useHasApiKey } from '@/stores/settingsStore'

const SOURCE_LABEL: Record<DatasetSource, string> = {
  table: 'Table in the article',
  link: 'File linked from the article',
  cited: 'From a page the article links to',
  search: 'Found by web search',
}

function Candidate({
  candidate,
  checked,
  onToggle,
}: {
  candidate: DatasetCandidate
  checked: boolean
  onToggle: () => void
}) {
  const columns = candidate.headers.slice(0, 4)
  return (
    <div className="border-border rounded-lg border p-3">
      <label className="flex cursor-pointer items-start gap-2.5">
        <Checkbox checked={checked} onCheckedChange={onToggle} className="mt-0.5" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{candidate.name}</span>
          <span className="text-muted-foreground block text-xs">
            {SOURCE_LABEL[candidate.source]} · {candidate.rows.length.toLocaleString()} rows ·{' '}
            {candidate.headers.length} columns
          </span>
        </span>
      </label>
      {candidate.note && <p className="text-muted-foreground mt-1.5 text-xs">{candidate.note}</p>}
      <a
        href={candidate.url}
        target="_blank"
        rel="noreferrer"
        className="text-muted-foreground hover:text-foreground mt-1.5 flex items-center gap-1 text-xs underline-offset-2 hover:underline"
      >
        <ExternalLink className="size-3 shrink-0" />
        <span className="truncate">{candidate.url}</span>
      </a>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b">
              {columns.map((h, i) => (
                <th key={i} className="max-w-40 truncate py-1 pr-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            {candidate.rows.slice(0, 3).map((row, y) => (
              <tr key={y}>
                {columns.map((_, x) => (
                  <td key={x} className="max-w-40 truncate py-0.5 pr-3">
                    {row[x]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Searches the article's site, its links and the web, then lets the person pick what to add. */
export function FetchDatasetButton() {
  const article = useArticleStore((s) => s.getCurrentArticle())
  const addDatasets = useDataStore((s) => s.addDatasets)
  const canSearch = useHasApiKey()

  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [candidates, setCandidates] = useState<DatasetCandidate[]>([])
  const [notes, setNotes] = useState<string[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open || !article) return
    const controller = new AbortController()
    setSearching(true)
    setCandidates([])
    setNotes([])
    setSelected(new Set())

    discoverDatasets({
      article,
      canSearch,
      signal: controller.signal,
      onCandidate: (c) => setCandidates((list) => [...list, c]),
    })
      .then((result) => {
        if (!controller.signal.aborted) setNotes(result)
      })
      .catch(() => {
        if (!controller.signal.aborted) setNotes(['The search stopped unexpectedly.'])
      })
      .finally(() => {
        if (!controller.signal.aborted) setSearching(false)
      })
    return () => controller.abort()
    // Runs once per opening: a key added meanwhile applies to the next search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, article?.$id])

  // The extension reads pages itself and has no access to the website's fetch route.
  if (isExtension()) return null

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const addSelected = () => {
    const chosen = candidates.filter((c) => selected.has(c.id))
    const added = chosen.length === 1 ? 'Dataset added' : `${chosen.length} datasets added`
    try {
      addDatasets(chosen.map(({ name, headers, rows }) => ({ name, headers, rows })))
      toast.success(added)
    } catch {
      // Added in memory, but over the browser's storage limit, which throws on save.
      toast.warning(`${added}, but too large to keep after a reload.`)
    }
    setOpen(false)
  }

  return (
    <>
      <span title={article ? undefined : 'Choose an article first'} className="inline-flex">
        <Button
          variant="ghost"
          size="sm"
          disabled={!article}
          onClick={() => setOpen(true)}
          className="h-6 gap-1 px-2 text-xs"
        >
          <Database className="h-3 w-3" />
          Fetch dataset
        </Button>
      </span>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Fetch dataset</DialogTitle>
            <DialogDescription>
              Choose what to add. Check each source first: a dataset found here may not be the one
              behind the article&apos;s claims.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-24 flex-1 space-y-2 overflow-y-auto">
            {candidates.map((c) => (
              <Candidate
                key={c.id}
                candidate={c}
                checked={selected.has(c.id)}
                onToggle={() => toggle(c.id)}
              />
            ))}
            {searching && (
              <p className="text-muted-foreground flex items-center gap-2 py-2 text-sm">
                <Loader2 className="size-4 animate-spin" />
                Searching the article, its links and the web...
              </p>
            )}
            {!searching && candidates.length === 0 && (
              <p className="py-2 text-sm">No datasets found. You can still upload a CSV yourself.</p>
            )}
            {notes.map((note) => (
              <p key={note} className="text-muted-foreground text-xs">
                {note}
              </p>
            ))}
          </div>

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={selected.size === 0} onClick={addSelected}>
              {selected.size > 0 ? `Add ${selected.size} selected` : 'Add selected'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
