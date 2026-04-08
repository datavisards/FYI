'use client'

import { Table2 } from 'lucide-react'
import { useExplorationStore } from '@/stores/explorationStore'
import { useDataStore } from '@/stores/dataStore'
import type { CsvRowRef } from '@/stores/chatStore'

interface CSVSourceChipsProps {
  datasets: string[]
  csvRowRefs?: CsvRowRef[]
}

export function CSVSourceChips({ datasets, csvRowRefs }: CSVSourceChipsProps) {
  const setActiveToolTab = useExplorationStore((s) => s.setActiveToolTab)
  const setHighlightedRows = useDataStore((s) => s.setHighlightedRows)

  const unique = [...new Set(datasets)]

  return (
    <div className="mt-2 pt-2 border-t border-dashed">
      <p className="text-[10px] font-medium text-muted-foreground mb-1.5">
        Data Sources
      </p>
      <div className="flex flex-wrap gap-1.5">
        {unique.map((name, i) => {
          const ref = csvRowRefs?.find((r) => r.dataset === name)
          const rowCount = ref?.rows.length
          return (
            <button
              key={i}
              onClick={() => {
                if (ref) {
                  setHighlightedRows({ dataset: ref.dataset, rows: ref.rows })
                } else {
                  setHighlightedRows(null)
                }
                setActiveToolTab('inspect-table')
              }}
              className="inline-flex items-center gap-1 rounded-full border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 text-[11px] text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors cursor-pointer"
              title={ref ? `View ${rowCount} source rows from "${name}"` : `View "${name}" in data table`}
            >
              <Table2 className="w-3 h-3" />
              {name}
              {rowCount != null && (
                <span className="text-emerald-500 dark:text-emerald-400">({rowCount} rows)</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
