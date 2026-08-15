import Link from 'next/link'
import Image from 'next/image'
import {
  AppWindow,
  ArrowRight,
  ArrowUpRight,
  Bot,
  BookOpen,
  ChartArea,
  FileText,
  Github,
  Globe,
  Mail,
  Puzzle,
  Table2,
  Zap,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { FyiMark } from '@/components/brand/FyiMark'



const REPO_URL = 'https://github.com/DataVisards/FYI'

const ARXIV_URL = 'https://arxiv.org/abs/2608.06804'

/* NBSP so the title breaks at the colon rather than stranding "A". */
const PAPER_TITLE =
  'Fact-Check Your Information (FYI): A Design Probe to Understand How People Actually Fact-Check Data-Driven Articles'.replace(
    '): A Design',
    '): A\u00A0Design'
  )

/* Transcribed from the camera-ready; keep in step with it. */
const ABSTRACT: React.ReactNode[] = [
  <>
    Data-driven journalism and policy reports frequently rely on statements grounded in
    statistical evidence, referred to as <em>data claims</em>. Verifying such a claim requires
    connecting it to the underlying structured dataset. However, existing systems typically
    isolate automated fact-checking from manual data exploration, leaving it unclear how readers
    coordinate AI assistance with manual inspection of the evidence in practice.
  </>,
  <>
    We present FYI, a browser extension that embeds fact-checking in the reading environment, and
    use it as a design probe to study how people detect, verify, and determine the validity of data
    claims against the underlying dataset. FYI provides four complementary tools spanning the
    spectrum from full automation to manual data exploration. In an exploratory study (N=22),
    participants used FYI to fact-check claims in a data-driven article.
  </>,
  <>
    We find that participants adopted three distinct workflow archetypes (AI-first with manual
    confirmation, manual-first with AI supplement, and parallel co-review), with visualization
    serving as the primary mechanism for auditing AI conclusions. Trust in AI shifted dynamically,
    growing when multiple tools converged and eroding when AI outputs were inconsistent.
  </>,
  <>
    These findings suggest that fact-checking systems should treat AI as a starting point that human
    verification complements rather than a definitive authority, elevate visualization as a core
    verification capability, and support flexible, user-driven workflows. We release FYI as
    open-source software for further research at{' '}
    <a
      href={REPO_URL}
      target="_blank"
      rel="noreferrer"
      className="text-foreground border-border border-b border-dashed transition-colors hover:border-solid hover:border-green-500"
    >
      github.com/DataVisards/FYI
    </a>
    .
  </>,
]

/*
 * Colours and icons are the paper's own. The palette is Okabe-Ito, chosen for
 * colour-vision safety, so do not swap either for Tailwind equivalents.
 */
const TOOLS = {
  autoCheck: { label: 'Auto Check', icon: Zap, bg: '#0072B2', fg: '#ffffff' },
  aiChat: { label: 'AI Chat', icon: Bot, bg: '#CC79A7', fg: '#ffffff' },
  table: { label: 'Table Explorer', icon: Table2, bg: '#009E73', fg: '#ffffff' },
  chart: { label: 'Chart Builder', icon: ChartArea, bg: '#E69F00', fg: '#ffffff' },
} as const

function ToolPill({ tool }: { tool: keyof typeof TOOLS }) {
  const { label, icon: Icon, bg, fg } = TOOLS[tool]
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-none px-1 py-0.5 text-xs leading-none font-normal whitespace-nowrap"
      style={{ backgroundColor: bg, color: fg }}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      {label}
    </span>
  )
}

/** `|` is a soft hyphen: the caption is justified and Chrome may lack a dictionary. */
const shy = (text: string) => text.replace(/\|/g, '\u00AD')

function Stage({ children }: { children: React.ReactNode }) {
  return <strong className="text-foreground font-semibold">{children}</strong>
}

const TEASER_CAPTION = (
  <>
    {shy(
      'The interface of FYI, a browser extension that enables in-situ data claim fact-check|ing directly alongside the article under review. The unified side panel supports a com|plete mixed-initiative pipe|line: '
    )}
    <Stage>{shy('(A) Detec|tion')}</Stage>
    {shy(' via (A1) AI detection or (A2) manual identi|fication; ')}
    <Stage>{shy('(B) Veri|fication')}</Stage>
    {shy(' through four com|ple|mentary modal|ities: (B1) ')}
    <ToolPill tool="autoCheck" />
    {', (B2) '}
    <ToolPill tool="aiChat" />
    {', (B3) '}
    <ToolPill tool="table" />
    {', and (B4) '}
    <ToolPill tool="chart" />
    {'; and '}
    <Stage>{shy('(C) Deter|mination')}</Stage>
    {shy(' via (C1) user-authored verdicts and (C2) cor|rections and expla|nations.')}
  </>
)

const TEASER_ALT =
  'A browser window with a news article on the left and the FYI side panel filling the rest. In the article, the sentence claiming Drama has the highest average IMDb rating is highlighted, with a Mark as claim button beside it and a Detect claims with AI button below. In the panel, AutoCheck returns MISLEADING at moderate confidence and sets the claimed Drama is number 1 against the actual Thriller at 6.9, above a bar chart of average rating by genre in which Drama is the shortest of the five bars. Below it an AI Chat exchange repeats the correction, a Table Explorer lists movie titles with gross, budget, year and rating, and a Chart Builder is configured with Genre on X and average IMDb rating on Y. On the right a verdict form has Misleading selected, confidence 6 of 7, severity 5 of 7, and a rewritten version of the claim naming Thriller instead of Drama.'

/* Nguyen-Truong's affiliation intentionally differs from the camera-ready. */
const AUTHORS = [
  {
    name: 'Nguyen-Truong Thinh',
    affil: 'The Hong Kong University of Science and Technology',
    email: 'truongthinh.nguyen03@gmail.com',
    orcid: '0009-0006-5441-7057',
    site: 'https://thinhnguyentruong.com/',
    equal: true,
  },
  {
    name: 'Yuxuan Du',
    affil: 'Independent Contributor',
    email: 'yuxuan.du.sherry@gmail.com',
    orcid: '0009-0000-1299-7520',
    equal: true,
  },
  {
    name: 'Phongsakon Mark Konrad',
    affil: 'University of Southern Denmark',
    email: 'phkon23@student.sdu.dk',
    orcid: '0009-0004-2521-7879',
  },
  {
    name: 'Arpit Narechania',
    affil: 'The Hong Kong University of Science and Technology',
    email: 'arpit@ust.hk',
    orcid: '0000-0001-6980-3686',
    site: 'https://narechania.com/',
  },
]

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="text-muted-foreground mb-6 text-sm font-medium">{children}</h2>
}

/**
 * The ORCID iD mark, drawn inline rather than pulled from a CDN so it survives
 * the extension's offline packaging and needs no network request here.
 *
 * Lucide has no ORCID glyph and no generic stand-in reads as "ORCID", so this
 * is the official mark: their green (#A6CE39) with the iD lettering knocked
 * out in white. It holds its own colour in both themes on purpose, which is
 * also what ORCID's brand guidance asks for.
 */
function OrcidIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 256 256" className={className} aria-hidden focusable="false">
      <circle cx="128" cy="128" r="128" fill="#A6CE39" />
      <g fill="#FFF">
        <path d="M86.3 186.2H70.9V79.1h15.4v107.1z" />
        <path d="M108.9 79.1h41.6c39.6 0 57 28.3 57 53.6 0 27.5-21.5 53.6-56.8 53.6h-41.8V79.1zm15.4 93.3h24.5c34.9 0 42.9-26.5 42.9-39.7 0-21.5-13.7-39.7-43.7-39.7h-23.7v79.4z" />
        <circle cx="78.6" cy="56.8" r="10.1" />
      </g>
    </svg>
  )
}

/** "https://narechania.com/" reads as "narechania.com" in a hover title. */
function hostname(url: string) {
  return new URL(url).hostname.replace(/^www\./, '')
}

/** One of the small round links under an author's name. */
function AuthorLink({
  href,
  label,
  children,
}: {
  href: string
  label: string
  children: React.ReactNode
}) {
  return (
    <a
      href={href}
      target={href.startsWith('mailto:') ? undefined : '_blank'}
      rel="noreferrer"
      title={label}
      aria-label={label}
      className="border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground hover:bg-accent/50 inline-flex size-7 items-center justify-center rounded-md border transition-colors"
    >
      {children}
    </a>
  )
}

function DestinationCard({
  title,
  href,
  icon: Icon,
  external,
  note,
}: {
  title: string
  href?: string
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  external?: boolean
  note?: string
}) {
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <Icon
          className={cn(
            'size-5',
            href ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground'
          )}
        />
        {href &&
          (external ? (
            <ArrowUpRight
              className="text-muted-foreground group-hover:text-foreground size-3.5 shrink-0 transition-colors"
              aria-hidden
            />
          ) : (
            <ArrowRight
              className="text-muted-foreground group-hover:text-foreground size-3.5 shrink-0 transition-colors"
              aria-hidden
            />
          ))}
      </div>
      <h3 className="mt-3 text-sm leading-snug font-medium text-balance">{title}</h3>
      {note && <p className="text-muted-foreground mt-1 text-xs leading-snug">{note}</p>}
    </>
  )

  const base =
    'group flex flex-col rounded-lg border p-4 transition-colors duration-200 border-border bg-card'

  if (!href) {
    return <div className={cn(base, 'opacity-70')}>{inner}</div>
  }

  return external ? (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(base, 'hover:border-foreground/30 hover:bg-accent/50')}
    >
      {inner}
    </a>
  ) : (
    <Link href={href} className={cn(base, 'hover:border-foreground/30 hover:bg-accent/50')}>
      {inner}
    </Link>
  )
}

export default function HomePage() {
  return (
    <main className="bg-background text-foreground min-h-svh">
      <div className="mx-auto w-full max-w-3xl px-5 sm:px-8">
        <header className="flex h-12 items-center justify-between">
          {/*
                      Chrome derives an SVG's flex baseline from its border-box bottom, so
                      the mark sits 3.46px high against the text. Measured; recompute if
                      its height changes.
                    */}
          <div className="flex items-baseline gap-2.5">
            <FyiMark className="translate-y-[3.46px]" />
            <span className="text-muted-foreground hidden text-sm sm:inline">
              Fact-Check Your Information
            </span>
          </div>
        </header>

        <section className="border-border border-t pt-10 pb-12 sm:pt-14">
          <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl sm:leading-[1.25]">
            {PAPER_TITLE}
          </h1>


          {/* unoptimized: served as a static asset, so no Cloudflare IMAGES binding. */}
          <figure className="mt-8">
            <div className="border-border bg-card overflow-hidden rounded-lg border">
              <Image
                src="/teaser.png"
                alt={TEASER_ALT}
                width={3200}
                height={1912}
                priority
                unoptimized
                className="h-auto w-full"
              />
            </div>
            <figcaption className="text-muted-foreground mt-3 text-sm leading-relaxed hyphens-auto text-justify">
              <span className="text-foreground font-medium">Figure 1.</span> {TEASER_CAPTION}
            </figcaption>
          </figure>
        </section>

        <section className="border-border border-t py-12">
          <SectionLabel>Abstract</SectionLabel>
          <div className="space-y-4 hyphens-auto text-justify">
            {ABSTRACT.map((para, i) => (
              <p key={i} className="leading-relaxed">
                {para}
              </p>
            ))}
          </div>
        </section>

        <section className="border-border border-t py-12">
          <SectionLabel>Resources</SectionLabel>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {/* Give it an href once the Xplore DOI exists. */}
            <DestinationCard title="Paper" icon={BookOpen} note="To appear at IEEE VIS 2026" />
            <DestinationCard title="Pre-print" href={ARXIV_URL} icon={FileText} external />
            <DestinationCard title="GitHub" href={REPO_URL} icon={Github} external />
            <DestinationCard title="Web application" href="/app" icon={AppWindow} />
            {/* Add href + external once the store listing exists, and drop the note. */}
            <DestinationCard
              title="Browser extension"
              icon={Puzzle}
              note="To be available on the Chrome Web Store"
            />
          </div>
        </section>

        <footer className="border-border border-t py-12">
          <SectionLabel>Authors</SectionLabel>
          <ul className="grid gap-x-10 gap-y-7 sm:grid-cols-2">
            {AUTHORS.map((a) => (
              <li key={a.name}>
                <p className="text-sm font-medium">
                  {a.name}
                  {a.equal && <sup className="ml-0.5">*</sup>}
                </p>
                <p className="text-muted-foreground mt-0.5 text-sm">{a.affil}</p>
                {/* ORCID last, so the one coloured mark ends the row rather than splitting it. */}
                <div className="mt-2 flex items-center gap-1.5">
                  <AuthorLink href={`mailto:${a.email}`} label={`Email ${a.name}: ${a.email}`}>
                    <Mail className="size-3.5" aria-hidden />
                  </AuthorLink>
                  {a.site && (
                    <AuthorLink
                      href={a.site}
                      label={`Website for ${a.name}: ${hostname(a.site)}`}
                    >
                      <Globe className="size-3.5" aria-hidden />
                    </AuthorLink>
                  )}
                  <AuthorLink
                    href={`https://orcid.org/${a.orcid}`}
                    label={`ORCID iD for ${a.name}: ${a.orcid}`}
                  >
                    <OrcidIcon className="size-3.5" />
                  </AuthorLink>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground mt-8 text-xs">
            * Authors contributed equally to this work.
          </p>
          <p className="text-muted-foreground mt-3 text-xs">
            <Link href="/privacy-policy" className="hover:text-foreground transition-colors">
              Privacy policy
            </Link>
          </p>
        </footer>
      </div>
    </main>
  )
}
