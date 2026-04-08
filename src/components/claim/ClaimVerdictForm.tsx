'use client'

import { memo, useState, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { CheckCircle, AlertTriangle, HelpCircle, Gavel, Edit2, MessageSquare, Info, GripVertical, ChevronUp, ChevronDown } from 'lucide-react'
import { TOOL_CONFIGS } from '@/stores/explorationStore'
import type { ToolType, Verdict } from '@/types'

// --- Shared sub-components ---

function LikertScale({
  value,
  max,
  onChange,
  color,
  lowLabel,
  highLabel,
}: {
  value: number | null
  max: number
  onChange: (val: number) => void
  color: string
  lowLabel: string
  highLabel: string
}) {
  const [hovered, setHovered] = useState<number | null>(null)
  const displayed = hovered ?? value ?? 0

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        {Array.from({ length: max }, (_, i) => i + 1).map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => onChange(level)}
            onMouseEnter={() => setHovered(level)}
            onMouseLeave={() => setHovered(null)}
            className="flex-1 flex items-center justify-center py-1 cursor-pointer"
            aria-label={`Set to ${level}`}
          >
            <div
              className={cn(
                'w-8 h-8 rounded-md flex items-center justify-center text-sm font-medium transition-colors',
                level <= displayed
                  ? `${color} text-white`
                  : 'bg-muted text-muted-foreground border border-border'
              )}
            >
              {level}
            </div>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] text-muted-foreground">{lowLabel}</span>
        <span className="text-[10px] text-muted-foreground">{highLabel}</span>
      </div>
    </div>
  )
}

const verdictOptions: Array<{
  value: Verdict
  label: string
  description: string
  icon: React.ReactNode
  color: string
  bgColor: string
  borderColor: string
}> = [
  {
    value: 'verified',
    label: 'Verified',
    description: 'Accurate and supported by evidence',
    icon: <CheckCircle className="h-5 w-5" />,
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'hover:bg-green-50 dark:hover:bg-green-950/20 data-[state=checked]:bg-green-50 dark:data-[state=checked]:bg-green-950/30',
    borderColor: 'data-[state=checked]:border-green-500 dark:data-[state=checked]:border-green-400',
  },
  {
    value: 'misleading',
    label: 'Misleading',
    description: 'Partially true or misrepresents facts',
    icon: <AlertTriangle className="h-5 w-5" />,
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'hover:bg-amber-50 dark:hover:bg-amber-950/20 data-[state=checked]:bg-amber-50 dark:data-[state=checked]:bg-amber-950/30',
    borderColor: 'data-[state=checked]:border-amber-500 dark:data-[state=checked]:border-amber-400',
  },
  {
    value: 'unverifiable',
    label: 'Unverifiable',
    description: 'Cannot determine with available info',
    icon: <HelpCircle className="h-5 w-5" />,
    color: 'text-indigo-600 dark:text-indigo-400',
    bgColor: 'hover:bg-indigo-50 dark:hover:bg-indigo-950/20 data-[state=checked]:bg-indigo-50 dark:data-[state=checked]:bg-indigo-950/30',
    borderColor: 'data-[state=checked]:border-indigo-500 dark:data-[state=checked]:border-indigo-400',
  },
]

// --- Verdict data shape ---

interface VerdictData {
  verdict: Verdict
  confidence: 1 | 2 | 3 | 4 | 5 | 6 | 7
  mostHelpfulTool: ToolType
  helpfulTools?: ToolType[]
  severity?: number
  reasoning?: string
  reasoningType?: 'correction' | 'explanation'
  correctionTarget?: string
  correctionText?: string
  explanationText?: string
}

interface ClaimVerdictFormProps {
  claimText: string
  open: boolean
  onClose: () => void
  onSubmit: (data: VerdictData) => void
  usedTools?: ToolType[]
  existingVerdict?: VerdictData
}

// --- Main form ---

export const ClaimVerdictForm = memo(function ClaimVerdictForm({
  claimText,
  open,
  onClose,
  onSubmit,
  usedTools = [],
  existingVerdict,
}: ClaimVerdictFormProps) {
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [confidence, setConfidence] = useState<number | null>(null)
  const [severity, setSeverity] = useState<number | null>(null)
  const [rankedTools, setRankedTools] = useState<ToolType[]>([])
  const [correctionTarget, setCorrectionTarget] = useState('')
  const [correctionReplacement, setCorrectionReplacement] = useState('')
  const [explanation, setExplanation] = useState('')

  // Reset form when dialog opens
  useEffect(() => {
    if (!open) return
    setVerdict(existingVerdict?.verdict ?? null)
    setConfidence(existingVerdict?.confidence ?? null)
    setSeverity(existingVerdict?.severity ?? null)
    setRankedTools(existingVerdict?.helpfulTools ?? (existingVerdict?.mostHelpfulTool ? [existingVerdict.mostHelpfulTool] : []))
    setCorrectionTarget(existingVerdict?.correctionTarget ?? claimText)
    setCorrectionReplacement(existingVerdict?.correctionText ?? claimText)
    setExplanation(existingVerdict?.explanationText ?? '')
  }, [open, existingVerdict, claimText])

  const toggleTool = useCallback((toolId: ToolType) => {
    setRankedTools(prev => {
      if (prev.includes(toolId)) {
        return prev.filter(t => t !== toolId)
      }
      return [...prev, toolId]
    })
  }, [])

  const moveToolUp = useCallback((toolId: ToolType) => {
    setRankedTools(prev => {
      const idx = prev.indexOf(toolId)
      if (idx <= 0) return prev
      const next = [...prev]
      ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
      return next
    })
  }, [])

  const moveToolDown = useCallback((toolId: ToolType) => {
    setRankedTools(prev => {
      const idx = prev.indexOf(toolId)
      if (idx < 0 || idx >= prev.length - 1) return prev
      const next = [...prev]
      ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
      return next
    })
  }, [])

  const isMisleading = verdict === 'misleading'
  const hasValidCorrection = correctionTarget.trim() && correctionReplacement.trim() && correctionTarget.trim() !== correctionReplacement.trim()
  const hasExplanation = explanation.trim().length > 0
  const misleadingNeedsAtLeastOne = isMisleading && (hasValidCorrection || hasExplanation)
  const needsExplanationOnly = verdict === 'unverifiable'
  const needsSeverity = verdict === 'misleading' || verdict === 'unverifiable'

  const isValid =
    verdict !== null &&
    confidence !== null &&
    rankedTools.length > 0 &&
    (!needsSeverity || severity !== null) &&
    (verdict !== 'misleading' || misleadingNeedsAtLeastOne) &&
    (!needsExplanationOnly || explanation.trim())

  const handleSubmit = useCallback(() => {
    if (!isValid || !verdict || confidence === null) return

    const tools = rankedTools
    const correctionPart = hasValidCorrection ? `${correctionTarget.trim()} → ${correctionReplacement.trim()}` : undefined
    const explanationPart = hasExplanation ? explanation.trim() : undefined
    const reasoning = [correctionPart, explanationPart].filter(Boolean).join(' | ') || undefined

    onSubmit({
      verdict,
      confidence: confidence as 1 | 2 | 3 | 4 | 5 | 6 | 7,
      mostHelpfulTool: tools[0]!,
      helpfulTools: tools,
      severity: needsSeverity ? severity ?? undefined : undefined,
      reasoning,
      reasoningType: verdict === 'misleading'
        ? (hasValidCorrection && hasExplanation ? 'explanation' : hasValidCorrection ? 'correction' : 'explanation')
        : verdict === 'unverifiable' ? 'explanation' : undefined,
      correctionTarget: hasValidCorrection ? correctionTarget.trim() : undefined,
      correctionText: hasValidCorrection ? correctionReplacement.trim() : undefined,
      explanationText: (isMisleading && hasExplanation) || verdict === 'unverifiable' ? explanationPart : undefined,
    })
  }, [isValid, verdict, confidence, severity, rankedTools, correctionTarget, correctionReplacement, explanation, hasValidCorrection, hasExplanation, isMisleading, needsSeverity, onSubmit])

  const toolsToShow = usedTools.length > 0
    ? TOOL_CONFIGS.filter((t) => usedTools.includes(t.id))
    : TOOL_CONFIGS

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Gavel className="h-4 w-4 text-primary" />
            <span>Submit verdict</span>
          </DialogTitle>
          <DialogDescription asChild>
            <p className="border-l-2 border-primary/40 pl-2 text-sm leading-relaxed mt-2 line-clamp-3">
              {claimText}
            </p>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Verdict selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              Verdict <span className="text-destructive">*</span>
            </Label>
            <RadioGroup
              value={verdict ?? ''}
              onValueChange={(v) => setVerdict(v as Verdict)}
              className="grid grid-cols-3 gap-2"
            >
              {verdictOptions.map((opt) => (
                <div key={opt.value} className="relative">
                  <RadioGroupItem value={opt.value} id={`v-${opt.value}`} className="peer sr-only" />
                  <Label
                    htmlFor={`v-${opt.value}`}
                    className={cn(
                      'flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 cursor-pointer transition-colors',
                      opt.bgColor, opt.borderColor
                    )}
                    data-state={verdict === opt.value ? 'checked' : 'unchecked'}
                  >
                    <span className={opt.color}>{opt.icon}</span>
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="text-[10px] text-muted-foreground text-center leading-tight">{opt.description}</p>
                    {verdict === opt.value && (
                      <div className="absolute top-1.5 right-1.5">
                        <CheckCircle className="h-3.5 w-3.5 text-primary" />
                      </div>
                    )}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Helpful Tools — Ranked */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              Helpful Tools <span className="text-destructive">*</span>
            </Label>
            <p className="text-[11px] text-muted-foreground">
              Select the tools that helped, then rank them (most helpful first).
            </p>

            {/* Unselected tools */}
            <div className="grid grid-cols-2 gap-2">
              {toolsToShow.filter((t) => !rankedTools.includes(t.id)).map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => toggleTool(tool.id)}
                  className="flex items-center gap-2 p-2 rounded-lg border-2 border-dashed border-border bg-background hover:bg-muted/50 transition-colors text-sm text-left"
                >
                  <span className="text-muted-foreground font-medium">{tool.name}</span>
                </button>
              ))}
            </div>

            {/* Ranked list */}
            {rankedTools.length > 0 && (
              <div className="space-y-1.5 mt-2">
                {rankedTools.map((toolId, idx) => {
                  const tool = TOOL_CONFIGS.find((t) => t.id === toolId)
                  if (!tool) return null
                  return (
                    <div
                      key={toolId}
                      className="flex items-center gap-2 p-2 rounded-lg border-2 border-primary bg-primary/5 transition-colors"
                    >
                      <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold shrink-0">
                        {idx + 1}
                      </span>
                      <span className="flex-1 text-sm font-medium">{tool.name}</span>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => moveToolUp(toolId)}
                          disabled={idx === 0}
                          className="p-0.5 rounded hover:bg-muted disabled:opacity-30"
                          aria-label="Move up"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveToolDown(toolId)}
                          disabled={idx === rankedTools.length - 1}
                          className="p-0.5 rounded hover:bg-muted disabled:opacity-30"
                          aria-label="Move down"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleTool(toolId)}
                          className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive ml-1"
                          aria-label="Remove"
                        >
                          <span className="text-xs font-medium">&times;</span>
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Ratings section — Confidence + Severity stacked */}
          <div className="space-y-3 rounded-lg border p-3 bg-muted/20">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                  Confidence <span className="text-destructive">*</span>
                </Label>
                {confidence && (
                  <span className="text-[11px] text-muted-foreground">{confidence}/7</span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                How certain you are about this verdict (1 = low, 7 = high).
              </p>
              <LikertScale
                value={confidence}
                max={7}
                onChange={setConfidence}
                color="bg-blue-500"
                lowLabel="Low"
                highLabel="High"
              />
            </div>

            {needsSeverity && (
              <div className="space-y-1 pt-2 border-t border-border/50">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">
                    Severity <span className="text-destructive">*</span>
                  </Label>
                  {severity && (
                    <span className="text-[11px] text-muted-foreground">{severity}/7</span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  How much does this claim impact the validity of the article? (1 = low, 7 = high)
                </p>
                <LikertScale
                  value={severity}
                  max={7}
                  onChange={setSeverity}
                  color="bg-amber-500"
                  lowLabel="Minimal"
                  highLabel="Critical"
                />
              </div>
            )}
          </div>

          {/* Reasoning (misleading / unverifiable) */}
          {(verdict === 'misleading' || verdict === 'unverifiable') && (
            <div className="space-y-3 rounded-lg border p-3 bg-muted/20">
              {verdict === 'misleading' && (
                <>
                  <div className="flex items-start gap-2 rounded-md bg-muted/50 px-2.5 py-2">
                    <Info className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
                    <p className="text-xs text-muted-foreground leading-snug">
                      Add a correction and/or an explanation.
                    </p>
                  </div>

                  <div className="space-y-3 pt-1">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Edit2 className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                        <Label className="text-sm font-medium">
                          Correction
                        </Label>
                      </div>
                      <div className="space-y-1.5 pl-5">
                        <p className="text-[11px] text-muted-foreground">Original</p>
                        <Textarea
                          value={correctionTarget}
                          readOnly
                          rows={2}
                          className="resize-none text-sm bg-muted/50 cursor-default"
                        />
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground text-[11px]">Corrected</span>
                        </div>
                        <Textarea
                          value={correctionReplacement}
                          onChange={(e) => setCorrectionReplacement(e.target.value)}
                          placeholder="Corrected version"
                          rows={2}
                          className="resize-none text-sm"
                        />
                      </div>
                    </div>

                    <div className="border-t border-border/50 pt-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                        <Label className="text-sm font-medium">
                          Explanation
                        </Label>
                      </div>
                      <div className="pl-5">
                        <Textarea
                          value={explanation}
                          onChange={(e) => setExplanation(e.target.value)}
                          placeholder="Explain why this claim is misleading..."
                          rows={3}
                          className="resize-none text-sm"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}

              {verdict === 'unverifiable' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    <Label className="text-sm font-medium">
                      Explanation <span className="text-destructive">*</span>
                    </Label>
                  </div>
                  <div className="pl-5">
                    <Textarea
                      value={explanation}
                      onChange={(e) => setExplanation(e.target.value)}
                      placeholder="Explain why this claim cannot be verified..."
                      rows={3}
                      className="resize-none text-sm"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} size="sm">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid} size="sm">
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})
