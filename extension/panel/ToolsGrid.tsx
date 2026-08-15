import { ClaimInvestigationPanel, ClaimToolbar } from '@/components/claim'
import { SplitPane } from '@/components/layout/SplitPane'
import { ToolTable } from '@/components/tool-table'
import { ChatLayout } from '@/components/tool-ai-chat/ChatLayout'
import { AutoCheckPanel } from '@/components/tool-ai-chat/AutoCheckPanel'
import type { Article } from '@/types'

import { VisBuilderFrame } from './VisBuilderFrame'

/**
 * The investigation workspace: claim controls above, the four tools below.
 *
 * `hidden` rather than unmounted when something covers it. The chart builder
 * is an iframe with its own state and the split panes hold drag positions,
 * both of which a remount would throw away.
 */
export function ToolsGrid({ article, hidden, onOpenClaimsList }: {
  article: Article
  hidden: boolean
  onOpenClaimsList: () => void
}) {
  return (
    <div className={`flex-1 min-h-0 flex flex-col ${hidden ? 'hidden' : ''}`}>
      <ClaimToolbar
        articleContent={article.title + '\n\n' + article.content}
        existingClaims={article.claims || []}
        onOpenClaimsList={onOpenClaimsList}
      />
      <ClaimInvestigationPanel existingClaims={article.claims || []} />
      <div className="flex-1 min-h-0">
        <SplitPane
          direction="horizontal"
          left={
            <div className="h-full flex flex-col min-h-0">
              <AutoCheckPanel />
              <div className="flex-1 min-h-0">
                <ChatLayout />
              </div>
            </div>
          }
          right={
            <SplitPane
              direction="vertical"
              left={<ToolTable />}
              right={<VisBuilderFrame />}
              defaultLeftPercent={40}
              minLeftPercent={25}
              maxLeftPercent={75}
            />
          }
          defaultLeftPercent={25}
          minLeftPercent={25}
          maxLeftPercent={60}
        />
      </div>
    </div>
  )
}
