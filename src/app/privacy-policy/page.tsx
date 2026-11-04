import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { FyiMark } from '@/components/brand/FyiMark'

/**
 * The canonical privacy policy, and the URL given to the Chrome Web Store.
 * `PRIVACY.md` points here rather than repeating it. Every statement must match
 * what the extension does; if the data flow changes, so does the date below.
 */

const LAST_UPDATED = '4 November 2026'

export const metadata: Metadata = {
  title: 'Privacy Policy | FYI',
  description:
    'What the FYI browser extension does with your data: what it reads, what leaves your browser, and what stays on your device.',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-border border-t py-10">
      <h2 className="mb-4 text-base font-semibold tracking-tight">{title}</h2>
      <div className="space-y-4 text-sm leading-relaxed">{children}</div>
    </section>
  )
}

const PERMISSIONS: [string, string][] = [
  ['activeTab', 'Read the article on the tab where you open the panel'],
  ['scripting', 'Inject the content script that extracts the article text'],
  ['sidePanel', "Present the tool in Chrome's side panel"],
  ['storage', 'Save your settings and your in-progress work'],
  [
    '<all_urls> host access',
    'News articles can be on any domain, so the tool cannot be restricted to a fixed list',
  ],
]

export default function PrivacyPolicyPage() {
  return (
    <main className="bg-background text-foreground min-h-svh">
      <div className="mx-auto w-full max-w-3xl px-5 sm:px-8">
        <header className="flex items-center justify-between py-10">
          <FyiMark />
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back
          </Link>
        </header>

        <div className="pb-10">
          <h1 className="text-2xl font-semibold tracking-tight">
            Privacy Policy for the FYI browser extension
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">Last updated: {LAST_UPDATED}</p>
          <p className="mt-6 text-sm leading-relaxed">
            FYI (Fact-check Your Information) is a research tool for studying how people verify
            data-driven claims in news articles. This policy describes what the browser extension
            does with your data.
          </p>
        </div>

        <Section title="What the extension accesses">
          <p>
            The extension runs only when you open its side panel on a page. When you do, it reads
            the <strong>text content of the article on the current tab</strong> so it can detect
            factual claims in it. It does not read pages in the background, and it does not run on
            tabs where you have not opened the panel.
          </p>
          <p>You may also upload a CSV file yourself, in order to explore the data behind a claim.</p>
        </Section>

        <Section title="You supply the AI provider">
          <p>
            The AI features are off until you enter your own API key, under{' '}
            <strong>API key</strong> in the panel menu or on the extension&rsquo;s options page.
            The extension has no shared key: nothing is sent to an AI provider until you have chosen one and
            supplied credentials for it.
          </p>
        </Section>

        <Section title="What leaves your browser">
          <p>
            To detect claims and answer your questions, the extension sends the following to the FYI
            backend, which relays it to the AI provider you configured:
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>the text of the article you are analysing</li>
            <li>the specific claim you select</li>
            <li>messages you type into the AI chat</li>
            <li>the contents of any CSV file you upload for analysis</li>
            <li>
              <strong>your API key</strong>, sent as a request header on each call
            </li>
          </ul>
          <p>
            The key is used to authenticate that one request against your provider and is then
            discarded. It is not stored, logged, or written to disk on the backend, and the backend
            uses no key of its own for the extension.
          </p>
          <p>
            Which provider receives your content is your choice. The default is{' '}
            <strong>OpenRouter</strong>, and you may point the extension at any OpenAI-compatible
            endpoint instead. When you enable the Web Search option, the search step runs on
            whichever search-capable model your provider offers, <strong>Perplexity Sonar</strong>{' '}
            in OpenRouter&rsquo;s case.
          </p>
          <p>
            Your data is therefore processed under your chosen provider&rsquo;s policies as well as
            this one, and the usage is billed to your account with them. Do not use the extension on
            pages containing information you are not willing to send to that provider.
          </p>
        </Section>

        <Section title="Free AI access on the FYI website">
          <p>
            This section applies to the website at tryfyi.app, not the extension. Until December 4,
            2026, the website&rsquo;s AI features work without your own key, using a key we hold on
            the server and pay for. When you use them this way, the article text, claims, chat
            messages and uploaded data you use with those features are relayed to{' '}
            <strong>OpenRouter</strong> under that key, and to <strong>Perplexity Sonar</strong> if
            you enable Web Search or use Fetch dataset. Your IP address is used to limit how many requests you can make
            per minute. Do not submit information you are not willing to send to those providers.
          </p>
          <p>If you enter your own key on the website, requests use your key and provider instead.</p>
        </Section>

        <Section title="What stays on your device">
          <ul className="list-disc space-y-3 pl-5">
            <li>
              <strong>Interaction history.</strong> The extension records your actions during a
              session (claims opened, tools used, verdicts submitted). This stays in your browser
              and is never transmitted to us. It is saved locally so that closing the panel or
              reloading the page does not lose your work, and it is erased when you reset the
              session or start on a different article. It leaves your device only if you explicitly
              click <strong>Export session</strong>, which downloads it as a JSON file to your
              computer.
            </li>
            <li>
              <strong>Claims and chart-builder state</strong>, saved in your browser&rsquo;s local
              storage for the same reason.
            </li>
            <li>
              <strong>Your API key and model settings</strong>, saved in Chrome&rsquo;s extension
              storage on this machine. They are not synced to your Google account and are not sent
              to us except as the per-request header described above. Clearing the key from either
              settings screen removes it and turns the AI features back off.
            </li>
            <li>
              <strong>Your custom FYI backend URL</strong>, if you set one, saved in Chrome&rsquo;s
              extension storage.
            </li>
          </ul>
        </Section>

        <Section title="What we do not do">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              We do not sell or transfer your data to third parties, beyond the AI provider you
              chose, which is required to operate the features you invoke.
            </li>
            <li>We do not use your data for advertising, credit scoring, or lending.</li>
            <li>
              We do not collect your passwords or your login credentials for any website. The one
              credential involved is the API key you enter yourself, which is handled as described
              above: stored on your machine, sent with your own requests to your own provider, never
              retained by us.
            </li>
            <li>We do not collect payment information, health information, or personal communications.</li>
            <li>
              We do not run analytics or telemetry, and the extension does not report your browsing
              back to us.
            </li>
          </ul>
        </Section>

        <Section title="Python analysis">
          <p>
            The Python data-analysis tool runs entirely inside your browser, using a Python runtime
            bundled in the extension package. Code you write there, and the data it operates on, are
            not sent anywhere.
          </p>
        </Section>

        <Section title="Permissions and why they are needed">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-border border-b text-left">
                  <th className="text-muted-foreground py-2 pr-4 font-medium">Permission</th>
                  <th className="text-muted-foreground py-2 font-medium">Why</th>
                </tr>
              </thead>
              <tbody>
                {PERMISSIONS.map(([name, why]) => (
                  <tr key={name} className="border-border/60 border-b align-top last:border-0">
                    <td className="py-2.5 pr-4">
                      <code className="text-xs">{name}</code>
                    </td>
                    <td className="py-2.5 leading-relaxed">{why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Contact">
          <p>
            Questions about this policy or about the extension:{' '}
            <a
              href="mailto:truongthinh.nguyen03@gmail.com"
              className="text-foreground border-border border-b border-dashed transition-colors hover:border-solid hover:border-green-500"
            >
              truongthinh.nguyen03@gmail.com
            </a>
            , or open an issue at{' '}
            <a
              href="https://github.com/DataVisards/FYI/issues/new/choose"
              target="_blank"
              rel="noreferrer"
              className="text-foreground border-border border-b border-dashed transition-colors hover:border-solid hover:border-green-500"
            >
              github.com/DataVisards/FYI
            </a>
            .
          </p>
        </Section>

        <footer className="border-border border-t py-10">
          <p className="text-muted-foreground text-xs">
            Material changes to this policy will be reflected in the &ldquo;last updated&rdquo; date
            above.
          </p>
        </footer>
      </div>
    </main>
  )
}
