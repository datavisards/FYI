'use client'

import React from 'react'

import { useExplorationStore } from '@/stores/explorationStore'
import { useDataStore } from '@/stores/dataStore'
import { CSVUploadButton } from '@/components/tool-table/CSVUploadButton'
import { ChartArea } from 'lucide-react'
import { eventLogger } from '@/lib/tracking/eventLogger'
import { VizBuilder } from '@/components/tool-vis-builder/VizBuilder'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface CsvDataSource {
  name: string
  headers: string[]
  rows: string[][]
}

interface ToolVisBuilderProps {
  /** Layout mode:
   * - 'sandbox': full viewport (used in extension iframe)
   * - 'panel': fill parent container (used in app layout)
   */
  mode?: 'sandbox' | 'panel'
  /** Width in px for the Field List column (default: 180) */
  fieldListWidth?: number
  /** Show text labels next to toolbar icons (default: true) */
  showToolbarText?: boolean
}

export function ToolVisBuilder({
  mode = 'panel',
  fieldListWidth: _fieldListWidth = 180,
  showToolbarText: _showToolbarText = true,
}: ToolVisBuilderProps) {
  const activeClaim = useExplorationStore((s) => s.activeClaim)
  const pageTableData = useDataStore((s) => s.pageTableData)
  const selectedVisDataset = useDataStore((s) => s.selectedVisDataset)
  const setSelectedVisDataset = useDataStore((s) => s.setSelectedVisDataset)
  const claimIdForLogs = activeClaim?.id ?? 'no-claim'

  const handleDatasetChange = (name: string) => {
    setSelectedVisDataset(name)
    eventLogger.log({
      type: 'vis_dataset_switched',
      claimId: claimIdForLogs,
      chartId: 'default',
      datasetName: name,
      source: 'uploaded',
    })
  }

  const datasets = pageTableData ?? []
  const csvData = datasets.find((d) => d.name === selectedVisDataset) ?? datasets[0] ?? null

  const containerStyle: React.CSSProperties =
    mode === 'sandbox'
      ? {
          height: '100vh',
          width: '100vw',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
        }
      : {
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
        }

  if (!csvData) {
    const sizeClass = mode === 'sandbox' ? 'h-screen w-screen' : 'h-full w-full'
    return (
      <div className={`${sizeClass} flex flex-col`}>
        <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/30 shrink-0">
          <ChartArea className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground">Chart Builder</span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <ChartArea className="h-8 w-8 text-muted-foreground opacity-40" />
          <div>
            <p className="text-sm font-medium text-muted-foreground">No data uploaded</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Upload a CSV file to build visualizations.</p>
          </div>
          {mode === 'panel' && <CSVUploadButton compact />}
        </div>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/30 shrink-0">
        <ChartArea className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-semibold text-muted-foreground shrink-0">Chart Builder</span>
        {datasets.length === 1 ? (
          <span className="text-xs text-muted-foreground truncate max-w-[160px]">{csvData?.name}</span>
        ) : datasets.length > 1 ? (
          <Select
            value={csvData?.name ?? ''}
            onValueChange={handleDatasetChange}
          >
            <SelectTrigger className="h-6 text-xs min-w-0 max-w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {datasets.map((ds) => (
                <SelectItem key={ds.name} value={ds.name} className="text-xs">
                  {ds.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>
      <main style={{ flex: 1, minHeight: 0 }}>
        <VizBuilder
          dataset={csvData}
          mode={mode}
          onRequestDataset={(name) => {
            if (!datasets.some((d) => d.name === name)) return
            setSelectedVisDataset(name)
            eventLogger.log({
              type: 'vis_dataset_switched',
              claimId: claimIdForLogs,
              chartId: 'default',
              datasetName: name,
              source: 'uploaded',
            })
          }}
        />
      </main>
    </div>
  )
}
