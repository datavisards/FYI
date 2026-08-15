import type { StudyEvent } from '@/types/events'

/** Download arbitrary data as a JSON file. */
export function downloadAsJSON(data: unknown, filename: string) {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  triggerDownload(blob, filename)
}

/** Flatten events to CSV and download. */
export function downloadEventsAsCSV(events: StudyEvent[]) {
  if (events.length === 0) return
  const headers = ['eventId', 'sessionId', 'timestamp', 'type', 'claimId', 'payload']
  const rows = events.map((e) => {
    const eRec = e as unknown as Record<string, unknown>
    const { eventId, sessionId, timestamp, type, claimId: _cid, ...rest } = eRec
    const claimId = 'claimId' in e ? String((e as unknown as { claimId: string }).claimId) : ''
    return [
      String(eventId ?? ''),
      String(sessionId ?? ''),
      String(timestamp ?? ''),
      String(type ?? ''),
      claimId,
      JSON.stringify(rest),
    ].map(csvEscape).join(',')
  })
  const csv = [headers.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  triggerDownload(blob, `fyi-events-${Date.now()}.csv`)
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
