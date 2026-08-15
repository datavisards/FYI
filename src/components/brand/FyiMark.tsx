import { cn } from '@/lib/utils'

/**
 * The FYI wordmark.
 *
 * Inlined rather than loaded from public/fyi-mark.svg: an <img> renders SVG
 * without interactivity, and an <object> is its own browsing context, where
 * prefers-color-scheme reports the OS instead of the app's theme.
 *
 * Geometry matches public/fyi-mark.svg. The rule is four dashes with
 * gap = 0.6 x dash, fitted so both ends land flush; change one, change both.
 */

const WORD_PATH =
  'M7.31 0.00V-72.75H53.89V-61.77H20.35V-39.93H50.64V-29.09H20.35V0.00Z M85.60 0.00V-28.17L58.72 ' +
  '-72.75H73.95L86.95 -49.81Q89.02 -46.21 90.62 -42.78Q92.23 -39.35 93.94 -34.41H90.52Q92.19 ' +
  '-39.41 93.78 -42.87Q95.37 -46.33 97.33 -49.81L110.05 -72.75H125.21L98.61 -28.17V0.00Z ' +
  'M145.48 -72.75V0.00H132.44V-72.75Z'

/** Left edge of each dash across the 138.17 ink width. */
const DASH_X = [20.64, 58.76, 96.87, 134.99]

const RULE_Y = 83.6
const RULE_H = 13
const DASH_W = 23.82

export function FyiMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="20.64 0 138.17 96.60"
      role="img"
      aria-label="FYI"
      className={cn('group h-3.5 w-auto shrink-0 select-none', className)}
    >
      <title>Fact-check Your Information</title>

      <path className="fill-foreground" transform="translate(13.33 72.75)" d={WORD_PATH} />

      <g className="fill-muted-foreground/50 transition-opacity duration-200 group-hover:opacity-0">
        {DASH_X.map((x) => (
          <rect key={x} x={x} y={RULE_Y} width={DASH_W} height={RULE_H} rx="2" />
        ))}
      </g>

      {/* Crossfaded rather than filling the gaps: rounded dashes pinch at the joins. */}
      <rect
        className="fill-green-500 opacity-0 transition-opacity duration-200 group-hover:opacity-100 dark:fill-green-400"
        x="20.64"
        y={RULE_Y}
        width="138.17"
        height={RULE_H}
        rx="2"
      />
    </svg>
  )
}
