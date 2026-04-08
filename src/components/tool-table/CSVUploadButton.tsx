'use client'

import { useRef, useState, useCallback } from 'react'
import { useDataStore } from '@/stores/dataStore'
import { Button } from '@/components/ui/button'
import { Upload, FileSpreadsheet } from 'lucide-react'
import { cn } from '@/lib/utils'

export function CSVUploadButton({ compact }: { compact?: boolean }) {
  const uploadCSVFile = useDataStore((s) => s.uploadCSVFile)
  const isLoading = useDataStore((s) => s.isLoadingData)
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return
      for (const file of Array.from(files)) {
        if (file.name.match(/\.(csv|tsv)$/i)) {
          uploadCSVFile(file)
        }
      }
    },
    [uploadCSVFile]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      handleFiles(e.dataTransfer.files)
    },
    [handleFiles]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  if (compact) {
    return (
      <>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.tsv"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
          multiple
        />
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => inputRef.current?.click()}
          disabled={isLoading}
        >
          <Upload className="h-3 w-3" />
          Upload CSV
        </Button>
      </>
    )
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 p-6 border-2 border-dashed rounded-lg transition-colors',
        isDragging
          ? 'border-primary bg-primary/5'
          : 'border-muted-foreground/25 hover:border-muted-foreground/50'
      )}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.tsv"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
        multiple
      />
      <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
      <div className="text-center">
        <p className="text-sm font-medium">
          {isDragging ? 'Drop CSV file here' : 'Upload a CSV file'}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Drag & drop or click to browse
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={isLoading}
      >
        <Upload className="h-3.5 w-3.5 mr-1.5" />
        Choose File
      </Button>
    </div>
  )
}
