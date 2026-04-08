'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'

export type SplitPaneDirection = 'horizontal' | 'vertical'

interface SplitPaneProps {
  left: React.ReactNode
  right: React.ReactNode
  /** When vertical, left = top, right = bottom */
  direction?: SplitPaneDirection
  defaultLeftPercent?: number
  minLeftPercent?: number
  maxLeftPercent?: number
  className?: string
}

export function SplitPane({
  left,
  right,
  direction = 'horizontal',
  defaultLeftPercent = direction === 'horizontal' ? 35 : 50,
  minLeftPercent = direction === 'horizontal' ? 30 : 20,
  maxLeftPercent = direction === 'horizontal' ? 60 : 80,
  className,
}: SplitPaneProps) {
  const [leftPercent, setLeftPercent] = useState(defaultLeftPercent)
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return

      const containerRect = containerRef.current.getBoundingClientRect()
      const size = direction === 'horizontal' ? containerRect.width : containerRect.height
      const offset = direction === 'horizontal' ? e.clientX - containerRect.left : e.clientY - containerRect.top
      const newPercent = (offset / size) * 100

      if (newPercent >= minLeftPercent && newPercent <= maxLeftPercent) {
        setLeftPercent(newPercent)
      }
    },
    [isDragging, direction, minLeftPercent, maxLeftPercent]
  )

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  useEffect(() => {
    if (!isDragging) return
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  const isVertical = direction === 'vertical'

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex h-full w-full min-h-0 min-w-0',
        isVertical ? 'flex-col' : 'flex-row',
        className
      )}
      onMouseMove={isDragging ? (e) => handleMouseMove(e.nativeEvent) : undefined}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div
        className={cn(
          'shrink-0 overflow-hidden',
          isVertical ? 'border-b' : 'border-r'
        )}
        style={
          isVertical
            ? { height: `${leftPercent}%` }
            : { width: `${leftPercent}%` }
        }
      >
        {left}
      </div>

      <div
        className={cn(
          'shrink-0 bg-muted hover:bg-primary/50 transition-colors flex items-center justify-center group',
          isVertical ? 'h-1.5 cursor-row-resize' : 'w-1.5 cursor-col-resize',
          isDragging && 'bg-primary'
        )}
        onMouseDown={handleMouseDown}
      >
        <div
          className={cn(
            'bg-border group-hover:bg-primary/70 rounded-full transition-colors',
            isVertical ? 'h-0.5 w-8' : 'w-0.5 h-8'
          )}
        />
      </div>

      <div className="flex-1 min-w-0 min-h-0 overflow-auto">{right}</div>
    </div>
  )
}
