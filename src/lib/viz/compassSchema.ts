import { Schema, build as buildSchema } from 'compassql/build/src/schema'

const schemaCache = new Map<string, Schema>()

/**
 * Build (and cache) a CompassQL Schema from raw row data.
 * CompassQL expects actual data so it can compute field stats and types,
 * similar to how Voyager 2 does it.
 */
export function getCompassSchema(datasetName: string, rows: Array<Record<string, unknown>>): Schema {
  const key = datasetName
  const cached = schemaCache.get(key)
  if (cached) return cached

  const schema = buildSchema(rows as any[])
  schemaCache.set(key, schema)
  return schema
}

