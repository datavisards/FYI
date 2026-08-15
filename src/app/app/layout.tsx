'use client'

export default function StudyLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="h-screen min-h-0 flex flex-col overflow-hidden" data-viewport-lock>
      {children}
    </div>
  )
}
