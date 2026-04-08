import type { FieldKind, InferredField } from './fieldInference'
import { getCompassSchema } from '@/lib/viz/compassSchema'
import { getVoyagerRecommendedSpec } from '@/lib/viz/voyagerCompat'

export type BuilderChannel = 'x' | 'y' | 'color' | 'size' | 'shape' | 'detail' | 'text'
export type BuilderMark = 'auto' | 'bar' | 'line' | 'point' | 'area' | 'tick' | 'rect' | 'rule' | 'text'

export type AggregateOp = 'count' | 'sum' | 'mean' | 'median' | 'min' | 'max'
export type TimeUnit =
  | 'year'
  | 'yearmonth'
  | 'yearmonthdate'
  | 'month'
  | 'date'
  | 'day'

export interface FieldEncoding {
  field: string
  kind: FieldKind
  aggregate?: AggregateOp
  bin?: boolean
  timeUnit?: TimeUnit
}

export type BuilderFilterKind = 'nominal' | 'quantitative'

export interface NominalBuilderFilter {
  id: string
  field: string
  kind: 'nominal'
  /** Selected values for this field. */
  include: string[]
}

export interface QuantitativeBuilderFilter {
  id: string
  field: string
  kind: 'quantitative'
  /** Inclusive lower bound (if undefined, unbounded). */
  min?: number
  /** Inclusive upper bound (if undefined, unbounded). */
  max?: number
}

export type BuilderFilter = NominalBuilderFilter | QuantitativeBuilderFilter

export interface BuilderSpec {
  datasetName: string | null
  mark: BuilderMark
  encodings: Partial<Record<BuilderChannel, FieldEncoding>>
  filters?: BuilderFilter[]
}

export type DataRow = Record<string, string | number>

function kindToVegaType(kind: FieldKind): 'quantitative' | 'nominal' | 'temporal' {
  return kind
}

function filterToTransform(f: BuilderFilter): { filter: unknown } | null {
  if (!f.field) return null

  if (f.kind === 'nominal') {
    const values = f.include ?? []
    if (values.length === 0) {
      // No values selected – treat as filtering out all rows.
      return { filter: 'false' }
    }
    return {
      filter: {
        field: f.field,
        oneOf: values,
      },
    }
  }

  // Quantitative range filter.
  const parts: string[] = []
  const escapedField = f.field.replace(/"/g, '\\"')

  if (typeof f.min === 'number') {
    parts.push(`datum["${escapedField}"] >= ${f.min}`)
  }
  if (typeof f.max === 'number') {
    parts.push(`datum["${escapedField}"] <= ${f.max}`)
  }

  if (parts.length === 0) return null

  return { filter: parts.join(' && ') }
}

function toEncoding(enc: FieldEncoding): Record<string, unknown> {
  const out: Record<string, unknown> = {
    field: enc.field,
    type: kindToVegaType(enc.kind),
  }
  if (enc.aggregate) out.aggregate = enc.aggregate
  if (enc.bin) out.bin = true
  if (enc.timeUnit) out.timeUnit = enc.timeUnit
  return out
}

function withFallbackAggregates(
  spec: BuilderSpec,
  fieldsByName: Map<string, InferredField>
): BuilderSpec {
  const enc = { ...spec.encodings }

  // If only one axis is set, create a basic count chart.
  if (enc.x && !enc.y) {
    enc.y = { field: '*', kind: 'quantitative', aggregate: 'count' }
  } else if (enc.y && !enc.x) {
    enc.x = { field: '*', kind: 'quantitative', aggregate: 'count' }
  }

  // Keep encoding kinds consistent with current inference when available.
  for (const ch of Object.keys(enc) as Array<keyof typeof enc>) {
    const e = enc[ch]
    if (!e) continue
    if (e.field === '*') continue
    const inferred = fieldsByName.get(e.field)
    if (inferred) enc[ch] = { ...e, kind: inferred.kind }
  }

  return { ...spec, encodings: enc }
}

export function toVegaLiteSpec(args: {
  builder: BuilderSpec
  data: DataRow[]
  inferredFields: InferredField[]
}): Record<string, unknown> | null {
  const { builder, data, inferredFields } = args

  const fieldsByName = new Map(inferredFields.map((f) => [f.name, f]))
  const normalized = withFallbackAggregates(builder, fieldsByName)

  const hasAnyEncoding = Object.values(normalized.encodings).some(Boolean)
  if (!hasAnyEncoding) return null

   // Use CompassQL/Voyager logic when mark is auto
  if (normalized.mark === 'auto' && normalized.datasetName) {
    try {
      const schema = getCompassSchema(normalized.datasetName, data as Array<Record<string, unknown>>)
      const spec = getVoyagerRecommendedSpec({
        builder: normalized,
        data,
        inferredFields,
        schema,
      })
      if (spec) return spec
    } catch {
      // fall through to simple path on error
    }
  }

  const encoding: Record<string, unknown> = {}
  for (const [ch, e] of Object.entries(normalized.encodings) as Array<[BuilderChannel, FieldEncoding]>) {
    if (!e) continue
    encoding[ch] = toEncoding(e)
  }

  // When we fall back to a simple spec (i.e. Compass/Voyager did not
  // produce a recommendation), never pass the special 'auto' marker
  // through to Vega-Lite as this is not a valid mark and can cause
  // runtime errors inside the Vega stack.
  const concreteMark: Exclude<BuilderMark, 'auto'> =
    normalized.mark === 'auto' ? 'bar' : normalized.mark

  const filters = normalized.filters ?? []
  const transforms = filters
    .map((f) => filterToTransform(f))
    .filter((t): t is { filter: unknown } => t !== null)

  const spec: Record<string, unknown> = {
    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
    data: { values: data },
    mark: concreteMark,
    encoding,
  }

  if (transforms.length > 0) {
    spec.transform = transforms
  }

  return spec
}

