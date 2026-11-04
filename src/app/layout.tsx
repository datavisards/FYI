import type { Metadata } from 'next'
import { Inter, Geist_Mono } from 'next/font/google'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { QueryProvider } from '@/components/providers/QueryProvider'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

const SITE_URL = 'https://tryfyi.app'

const TITLE = 'Fact-Check Your Information'
const DESCRIPTION =
  'A design probe to understand how people actually fact-check data-driven articles.'

/*
 * openGraph and twitter carry their own title and description: Next does not
 * copy the top-level ones into them.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: 'FYI',
  authors: [{ name: 'Nguyen-Truong Thinh' }, { name: 'Arpit Narechania' }],
  keywords: [
    'data claims',
    'fact-checking',
    'human-AI interaction',
    'trust calibration',
    'visualization',
    'large language models',
    'design probe',
  ],
  openGraph: {
    type: 'website',
    siteName: 'FYI',
    locale: 'en_US',
    url: SITE_URL,
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: '/teaser.png',
        width: 3200,
        height: 1912,
        alt: 'The FYI side panel open beside a news article. The article is on the left with a data claim highlighted; the panel on the right shows Auto Check with a misleading verdict, an AI chat, a table of the movie dataset, and a bar chart of IMDb rating by genre.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/teaser.png'],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${geistMono.variable}`}
    >
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            {children}
            <Toaster />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
