'use client'

import { ArrowLeft, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'


export type StepId = 'article' | 'data' | 'key'

export type StepList = readonly { id: StepId; label: string }[]

/** Callers running a shorter flow pass their own list, so the numbering matches. */
function Stepper({ current, steps }: { current: StepId; steps: StepList }) {
  const currentIndex = steps.findIndex((s) => s.id === current)

  return (
    <ol className="flex items-center gap-2">
      {steps.map((step, i) => {
        const done = i < currentIndex
        const active = i === currentIndex
        return (
          <li key={step.id} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium',
                done || active
                  ? 'bg-foreground text-background'
                  : 'border-border text-muted-foreground border'
              )}
              aria-hidden
            >
              {done ? <Check className="size-3" /> : i + 1}
            </span>
            <span
              className={cn(
                'text-xs font-medium whitespace-nowrap',
                active ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {step.label}
            </span>
            {i < steps.length - 1 && (
              <span className={cn('h-px flex-1', done ? 'bg-foreground/30' : 'bg-border')} aria-hidden />
            )}
          </li>
        )
      })}
    </ol>
  )
}

export function StepShell({
  current,
  steps,
  title,
  description,
  children,
  onBack,
  footer,
}: {
  current?: StepId
  /** The extension's setup flow. Without it the screen stands alone, with no stepper. */
  steps?: StepList
  title: string
  description?: string
  children: React.ReactNode
  onBack?: () => void
  footer: React.ReactNode
}) {
  return (
    <div className="flex h-full min-h-0 justify-center overflow-y-auto px-5 py-10 sm:px-8">
      <div className="flex w-full max-w-lg flex-col">
        {current && steps && <Stepper current={current} steps={steps} />}

        <div className={current && steps ? 'mt-8' : undefined}>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description && (
            <p className="text-muted-foreground mt-1 text-sm">{description}</p>
          )}
        </div>

        <div className="mt-6">{children}</div>

        <div className="border-border mt-8 flex items-center justify-between gap-3 border-t pt-5">
          {onBack ? (
            <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
              <ArrowLeft className="size-4" />
              Back
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">{footer}</div>
        </div>
      </div>
    </div>
  )
}
