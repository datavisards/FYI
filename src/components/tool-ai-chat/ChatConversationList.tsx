'use client'

import { useMemo, useState } from 'react'
import { useChatStore, type Conversation } from '@/stores/chatStore'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { Plus, MessageSquare, MoreHorizontal, Pencil, Trash2, Trash } from 'lucide-react'
import { cn } from '@/lib/utils'

function groupByDate(conversations: Conversation[]) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const weekAgo = new Date(today.getTime() - 7 * 86400000)

  const groups: { label: string; items: Conversation[] }[] = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Previous 7 Days', items: [] },
    { label: 'Older', items: [] },
  ]

  for (const conv of conversations) {
    const d = new Date(conv.updatedAt)
    if (d >= today) groups[0].items.push(conv)
    else if (d >= yesterday) groups[1].items.push(conv)
    else if (d >= weekAgo) groups[2].items.push(conv)
    else groups[3].items.push(conv)
  }

  return groups.filter((g) => g.items.length > 0)
}

interface ChatConversationListProps {
  /** Called when user selects a conversation (e.g. to close a popover) */
  onSelectConversation?: (id: string) => void
  /** When provided, delete requests are sent here (so parent can show dialog outside popover) */
  onRequestDelete?: (id: string) => void
  className?: string
}

export function ChatConversationList({ onSelectConversation, onRequestDelete, className }: ChatConversationListProps) {
  const conversations = useChatStore((s) => s.conversations)
  const activeId = useChatStore((s) => s.activeConversationId)
  const createConversation = useChatStore((s) => s.createConversation)
  const setActive = useChatStore((s) => s.setActiveConversation)
  const deleteConv = useChatStore((s) => s.deleteConversation)
  const renameConv = useChatStore((s) => s.renameConversation)
  const clearAll = useChatStore((s) => s.clearAll)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [showClearAllDialog, setShowClearAllDialog] = useState(false)

  const handleRequestDelete = (id: string) => {
    if (onRequestDelete) {
      onRequestDelete(id)
    } else {
      setDeleteId(id)
    }
  }

  const groups = useMemo(() => groupByDate(conversations), [conversations])

  const startRename = (conv: Conversation) => {
    setEditingId(conv.id)
    setEditTitle(conv.title)
  }

  const commitRename = () => {
    if (editingId && editTitle.trim()) {
      renameConv(editingId, editTitle.trim())
    }
    setEditingId(null)
  }

  const handleSelect = (id: string) => {
    setActive(id)
    onSelectConversation?.(id)
  }

  const handleNewChat = () => {
    const id = createConversation()
    onSelectConversation?.(id)
  }

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="p-2 shrink-0">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2 text-xs"
          onClick={handleNewChat}
        >
          <Plus className="h-3.5 w-3.5" />
          New Chat
        </Button>
      </div>

      <div className="px-2 pb-2 space-y-3 overflow-auto min-h-0 flex-1">
        {groups.map((group) => (
          <div key={group.label}>
            <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              {group.label}
            </div>
            {group.items.map((conv) => (
              <div
                key={conv.id}
                className={cn(
                  'group flex items-center gap-1 rounded-md px-2 py-1.5 text-xs cursor-pointer transition-colors',
                  activeId === conv.id
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/50'
                )}
                onClick={() => handleSelect(conv.id)}
              >
                <MessageSquare className="h-3 w-3 shrink-0 text-muted-foreground" />
                {editingId === conv.id ? (
                  <input
                    className="flex-1 min-w-0 bg-transparent border-b border-primary outline-none text-xs"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename()
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="flex-1 min-w-0 text-xs leading-tight line-clamp-2">{conv.title}</span>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="opacity-0 group-hover:opacity-100 h-5 w-5 flex items-center justify-center rounded hover:bg-accent shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="h-3 w-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-36">
                    <DropdownMenuItem onClick={() => startRename(conv)}>
                      <Pencil className="h-3 w-3 mr-2" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => handleRequestDelete(conv.id)}
                    >
                      <Trash2 className="h-3 w-3 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        ))}

        {conversations.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-8">
            No conversations yet
          </div>
        )}
      </div>

      {/* Clear All button */}
      {conversations.length > 0 && (
        <div className="p-2 border-t shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center text-xs text-destructive hover:text-destructive hover:bg-destructive/10 gap-1"
            onClick={() => setShowClearAllDialog(true)}
          >
            <Trash className="h-3 w-3" />
            Clear All History
          </Button>
        </div>
      )}

      {/* Only render local delete dialog when not controlled by parent (e.g. in ChatSidebar) */}
      {!onRequestDelete && (
        <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
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
                onClick={() => {
                  if (deleteId) {
                    deleteConv(deleteId)
                  }
                  setDeleteId(null)
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Clear All History confirmation dialog */}
      <AlertDialog open={showClearAllDialog} onOpenChange={setShowClearAllDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all conversation history?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all {conversations.length} conversation{conversations.length !== 1 ? 's' : ''} and their messages. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                clearAll()
                setShowClearAllDialog(false)
              }}
            >
              Clear All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
