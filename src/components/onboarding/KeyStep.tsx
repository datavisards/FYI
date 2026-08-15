'use client'

import { ArrowRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ApiKeyForm } from '@/components/settings/ApiKeyForm'
import { StepShell, type StepList } from '@/components/onboarding/StepShell'

export function KeyStep({
  onBack,
  onStart,
  steps,
}: {
  onBack: () => void
  onStart: () => void
  /** Omit for the full flow. */
  steps?: StepList
}) {
  return (
    <ApiKeyForm>
      {({ fields, commit, hasKey }) => (
        <StepShell
          current="key"
          steps={steps}
          title="Connect a model"
          description="Your key stays in this browser and is sent per request, never stored on the server."
          onBack={onBack}
          footer={
            <>
              {!hasKey && (
                <Button variant="ghost" size="sm" onClick={onStart}>
                  Skip
                </Button>
              )}
              <Button
                size="sm"
                disabled={!hasKey}
                onClick={() => {
                  commit()
                  onStart()
                }}
                className="gap-1.5"
              >
                Start investigating
                <ArrowRight className="size-4" />
              </Button>
            </>
          }
        >
          {fields}
        </StepShell>
      )}
    </ApiKeyForm>
  )
}
