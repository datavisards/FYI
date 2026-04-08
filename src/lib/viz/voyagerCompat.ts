import { recommend } from 'compassql/build/src/recommend'
import { fromSpec as specQueryFromSpec } from 'compassql/build/src/query/spec'
import type { Schema } from 'compassql/build/src/schema'
import type { BuilderSpec, BuilderChannel, FieldEncoding, DataRow } from '@/lib/viz/specModel'
import type { InferredField } from '@/lib/viz/fieldInference'

const AUTO_MARK_ENUM = ['bar', 'line', 'point', 'area', 'tick', 'rect', 'rule'] as const

function buildEncodingQuery(channel: BuilderChannel, enc: FieldEncoding) {
  const q: any = {
    channel,
    field: enc.field,
    type: enc.kind === 'quantitative' ? 'quantitative' : enc.kind === 'temporal' ? 'temporal' : 'nominal',
  }
  if (enc.aggregate) q.aggregate = enc.aggregate
  if (enc.bin) q.bin = true
  if (enc.timeUnit) q.timeUnit = enc.timeUnit
  return q
}

export function buildCompassSpecQuery(builder: BuilderSpec): any {
  const encodings: any[] = []
  for (const [channel, enc] of Object.entries(builder.encodings) as Array<[BuilderChannel, FieldEncoding]>) {
    if (!enc) continue
    encodings.push(buildEncodingQuery(channel, enc))
  }

  const base: any = {
    mark:
      builder.mark === 'auto'
        ? { enum: [...AUTO_MARK_ENUM] }
        : builder.mark,
    encodings,
  }

  return specQueryFromSpec(base)
}

export function getVoyagerRecommendedSpec(args: {
  builder: BuilderSpec
  data: DataRow[]
  inferredFields: InferredField[]
  schema: Schema
}): Record<string, unknown> | null {
  const { builder, schema } = args
  const specQuery = buildCompassSpecQuery(builder)

  const result = recommend(specQuery as any, schema as any)
  const group = (result as any)?.result

  if (!group || !group.items || group.items.length === 0) return null

  const top = group.items[0]
  if (!top) return null

  const vlSpec = typeof (top as any).toSpec === 'function' ? (top as any).toSpec() : (top as any).spec
  return vlSpec as Record<string, unknown>
}

