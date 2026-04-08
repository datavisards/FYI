'use client'

import { ScrollArea } from '@/components/ui/scroll-area'
import { ChatConversationList } from './ChatConversationList'

export function ChatSidebar() {
  return (
    <div className="h-full flex flex-col bg-muted/30">
      <ScrollArea className="flex-1 min-h-0">
        <ChatConversationList className="min-h-0" />
      </ScrollArea>
    </div>
  )
}
