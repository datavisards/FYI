export interface Dataset {
  name: string
  headers: string[]
  rows: string[][]
}

export type ConfidenceLevel = 'strong' | 'moderate' | 'weak'
