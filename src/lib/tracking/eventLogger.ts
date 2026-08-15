// src/lib/tracking/eventLogger.ts
import { nanoid } from 'nanoid'
// NOTE: circular reference is safe — only accessed inside function bodies, never at module init
 
import { useExplorationStore } from '@/stores/explorationStore'
import type { StudyEvent, StudyEventPayload } from '@/types/events'

class EventLogger {
  private sessionId: string | null = null

  setSession(sessionId: string): void {
    this.sessionId = sessionId
  }

  log(event: StudyEventPayload): void {
    const fullEvent = {
      ...event,
      eventId: `evt-${Date.now()}-${nanoid(6)}`,
      sessionId: this.sessionId ?? 'unknown',
      timestamp: new Date().toISOString(),
    } as StudyEvent
    useExplorationStore.getState().addEvent(fullEvent)
  }

  getEvents(): StudyEvent[] {
    return useExplorationStore.getState().events
  }

  reset(): void {
    this.sessionId = null
    // events cleared via explorationStore.clearAll()
  }
}

export const eventLogger = new EventLogger()
