'use client'

import { useState } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { ChatPanel } from './ChatPanel'
import { ChatConversationList } from './ChatConversationList'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Plus, List, MessageSquare, ChevronDown, Bot } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function ChatLayout() {
  const [allChatsOpen, setAllChatsOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const conversations = useChatStore((s) => s.conversations)
  const activeId = useChatStore((s) => s.activeConversationId)
  const setActive = useChatStore((s) => s.setActiveConversation)
  const deleteConversation = useChatStore((s) => s.deleteConversation)
  const createConversation = useChatStore((s) => s.createConversation)

  // Show max 3 tabs, rest go to dropdown
  // Always ensure active tab is visible
  const MAX_VISIBLE_TABS = 3
  const activeIndex = conversations.findIndex((c) => c.id === activeId)
  
  let visibleTabs: typeof conversations
  let hiddenTabs: typeof conversations
  
  if (conversations.length <= MAX_VISIBLE_TABS) {
    // All tabs fit, show all
    visibleTabs = conversations
    hiddenTabs = []
  } else if (activeIndex < MAX_VISIBLE_TABS) {
    // Active tab is in first 3, show first 3
    visibleTabs = conversations.slice(0, MAX_VISIBLE_TABS)
    hiddenTabs = conversations.slice(MAX_VISIBLE_TABS)
  } else {
    // Active tab is beyond first 3, show it with 2 adjacent tabs
    const start = Math.max(0, activeIndex - 1)
    visibleTabs = conversations.slice(start, start + MAX_VISIBLE_TABS)
    hiddenTabs = [
      ...conversations.slice(0, start),
      ...conversations.slice(start + MAX_VISIBLE_TABS),
    ]
  }
  
  const hasHiddenTabs = hiddenTabs.length > 0

  const handleNewChat = () => {
    createConversation()
  }

  const handleSelectFromList = () => {
    setAllChatsOpen(false)
  }

  const handleConfirmDelete = () => {
    if (pendingDeleteId) {
      deleteConversation(pendingDeleteId)
      setPendingDeleteId(null)
    }
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Title + tab bar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b shrink-0 bg-muted/30">
        <div className="flex items-center gap-1.5 shrink-0 pr-1.5 border-r mr-0.5">
          <Bot className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground">AI Chat</span>
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-0.5">
          {visibleTabs.map((conv) => (
            <button
              key={conv.id}
              type="button"
              onClick={() => setActive(conv.id)}
              className={cn(
                'min-w-0 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors overflow-hidden',
                activeId === conv.id
                  ? 'bg-background shadow-sm border text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/80'
              )}
              title={conv.title}
            >
              <MessageSquare className="h-3 w-3 shrink-0" />
              <span className="truncate min-w-0">{conv.title}</span>
            </button>
          ))}
          {hasHiddenTabs && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'shrink-0 flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                    hiddenTabs.some((c) => c.id === activeId)
                      ? 'bg-background shadow-sm border text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/80'
                  )}
                  title={`${hiddenTabs.length} more chats`}
                >
                  <ChevronDown className="h-3 w-3" />
                  <span className="text-[10px]">{hiddenTabs.length}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {hiddenTabs.map((conv) => (
                  <DropdownMenuItem
                    key={conv.id}
                    onClick={() => setActive(conv.id)}
                    className={cn(
                      'flex items-center gap-2 cursor-pointer',
                      activeId === conv.id && 'bg-muted'
                    )}
                  >
                    <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate flex-1">{conv.title}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0 border-l pl-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleNewChat}
            title="New chat"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Popover open={allChatsOpen} onOpenChange={setAllChatsOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title="All chats"
              >
                <List className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-0" sideOffset={6}>
              <ScrollArea className="max-h-[70vh]">
                <ChatConversationList
                  onSelectConversation={handleSelectFromList}
                  onRequestDelete={(id) => setPendingDeleteId(id)}
                />
              </ScrollArea>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Delete confirmation — rendered outside popover so it stays open when dialog opens */}
      <AlertDialog open={pendingDeleteId !== null} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this conversation? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleConfirmDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Chat panel */}
      <div className="flex-1 min-h-0">
        <ChatPanel
          conversationId={activeId}
          showSearchToggle
          showToolToggles
        />
      </div>
    </div>
  )
}
