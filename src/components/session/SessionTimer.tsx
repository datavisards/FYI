'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Timer, AlertTriangle, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useExplorationStore } from '@/stores/explorationStore'
import { eventLogger } from '@/lib/tracking/eventLogger'

const SESSION_DURATION_MS = 30 * 60 * 1000 // 30 minutes

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function SessionTimer() {
  const [started, setStarted] = useState(false)
  const [remaining, setRemaining] = useState(SESSION_DURATION_MS)
  const startedAt = useRef<number | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const notified15 = useRef(false)
  const notified5 = useRef(false)
  const notifiedEnd = useRef(false)

  const handleStart = useCallback(() => {
    startedAt.current = Date.now()
    setStarted(true)
    notified15.current = false
    notified5.current = false
    notifiedEnd.current = false
    toast.success('Timer started — 30 minutes', { duration: 3000 })
    eventLogger.log({ type: 'timer_started', durationMs: SESSION_DURATION_MS })
  }, [])

  const checkNotifications = useCallback((ms: number) => {
    const minutesLeft = ms / 60000

    if (minutesLeft <= 15 && !notified15.current) {
      notified15.current = true
      toast.info('15 minutes remaining', {
        icon: <Timer className="h-4 w-4" />,
        duration: 5000,
      })
    }

    if (minutesLeft <= 5 && !notified5.current) {
      notified5.current = true
      toast.warning('5 minutes remaining', {
        icon: <AlertTriangle className="h-4 w-4" />,
        duration: 8000,
      })
    }

    if (ms <= 0 && !notifiedEnd.current) {
      notifiedEnd.current = true
      toast.error('Time is up!', { duration: 10000 })
      eventLogger.log({ type: 'timer_expired' })
    }
  }, [])

  useEffect(() => {
    if (!started || !startedAt.current) return

    const tick = () => {
      const elapsed = Date.now() - startedAt.current!
      const r = Math.max(0, SESSION_DURATION_MS - elapsed)
      setRemaining(r)
      checkNotifications(r)
      if (r <= 0 && intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }

    tick()
    intervalRef.current = setInterval(tick, 1000)
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [started, checkNotifications])

  const minutes = remaining / 60000
  const isUrgent = started && minutes <= 5
  const isWarning = started && minutes <= 15 && !isUrgent
  const isExpired = started && remaining <= 0

  if (!started) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-xs"
        onClick={handleStart}
      >
        <Play className="h-3 w-3" />
        Start Timer
      </Button>
    )
  }

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 text-xs font-mono px-2 py-1 rounded transition-colors',
        isExpired
          ? 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400'
          : isUrgent
            ? 'bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 animate-pulse'
            : isWarning
              ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400'
              : 'text-muted-foreground'
      )}
    >
      <Timer className="h-3.5 w-3.5" />
      <span>{isExpired ? '00:00' : formatTime(remaining)}</span>
    </div>
  )
}
