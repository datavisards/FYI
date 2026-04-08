'use client'

import { SplitPane } from './SplitPane'

export interface ResizableGridProps {
  /** Top row (full width), e.g. data table */
  top: React.ReactNode
  /** Bottom-left cell, e.g. AI chat */
  bottomLeft: React.ReactNode
  /** Bottom-right cell, e.g. Create vis */
  bottomRight: React.ReactNode
  /** Default height of top row in percent (0-100). Default 50. */
  defaultTopPercent?: number
  /** Min height of top row in percent. Default 25. */
  minTopPercent?: number
  /** Max height of top row in percent. Default 75. */
  maxTopPercent?: number
  /** Default width of bottom-left in percent of bottom row (0-100). Default 50. */
  defaultBottomLeftPercent?: number
  /** Min width of bottom-left in percent. Default 30. */
  minBottomLeftPercent?: number
  /** Max width of bottom-left in percent. Default 70. */
  maxBottomLeftPercent?: number
  className?: string
}

/**
 * Resizable grid: one full-width top row and one bottom row split into left and right.
 * Users can resize: (1) top vs bottom, (2) bottom-left vs bottom-right.
 */
export function ResizableGrid({
  top,
  bottomLeft,
  bottomRight,
  defaultTopPercent = 50,
  minTopPercent = 25,
  maxTopPercent = 75,
  defaultBottomLeftPercent = 50,
  minBottomLeftPercent = 30,
  maxBottomLeftPercent = 70,
  className,
}: ResizableGridProps) {
  const bottomRow = (
    <SplitPane
      direction="horizontal"
      left={bottomLeft}
      right={bottomRight}
      defaultLeftPercent={defaultBottomLeftPercent}
      minLeftPercent={minBottomLeftPercent}
      maxLeftPercent={maxBottomLeftPercent}
    />
  )

  return (
    <div className={className ?? 'h-full w-full flex flex-col min-h-0'}>
      <SplitPane
        direction="vertical"
        left={top}
        right={bottomRow}
        defaultLeftPercent={defaultTopPercent}
        minLeftPercent={minTopPercent}
        maxLeftPercent={maxTopPercent}
      />
    </div>
  )
}
