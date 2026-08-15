# Chrome Web Store submission notes

Everything needed for the Developer Dashboard, plus the items only you can complete.
Prepared 2026-07-30, updated 2026-08-15 against extension version 0.2.0.

## Status

| Item | State |
|---|---|
| Remotely hosted code removed | Done. Pyodide is vendored into the package |
| Package builds and zips correctly | Done. `fyi-extension-0.2.0.zip`, 22.99 MB, 51 entries |
| Sourcemaps and unminified source stripped | Done |
| Icons | Done. `icons/icon16/48/128.png`, wired into `manifest.json` |
| Contact address in policy | Done. The policy names a mail address and the issue tracker |
| Backend actually works | Done. The user brings their own key, so there is no shared balance to run out |
| Privacy policy | Written and served by the site at `/privacy-policy`. **Goes live only when the Worker is deployed** |
| Developer account | **Yours.** Requires a one-time 5 USD registration fee |
| Listing screenshots | One ready in `store/`. **It is a rendered mock, not a capture**, see below |
| Backend host | Cloudflare Workers, `https://fyi.datavisards-hkust.workers.dev` |

Policy URL for the dashboard: `https://fyi.datavisards-hkust.workers.dev/privacy-policy`.
It is served by this repo from `src/app/privacy-policy/page.tsx`, so it resolves as soon as the
Worker is deployed, and not before.

One thing stands between here and submission: **deploy the Worker**, which makes both the backend
and that URL work.

## Bring your own key

The extension no longer depends on a key held by the deployment, which is what previously blocked
this submission: the shared OpenRouter account had run out of credits, so a reviewer would have
installed the extension, clicked detect, and watched every AI feature fail while `/api/health`
stayed green.

Now the user supplies the credentials. The setup flow ends on a Model step, the panel menu and the
options page both open the same key form, and every AI control stays disabled until a key exists
rather than failing at the point of use. The key is stored in `chrome.storage.local`, sent as the
`x-fyi-api-key` header on each request, and forwarded by the backend without being stored or
logged. `src/lib/ai/config.ts` reads it per request.

What this means for review:

- There is no balance to top up and nothing to keep warm. Workers do not sleep, and the 44s Render
  cold start is long gone.
- **A reviewer without a key sees a tool that cannot do anything.** This is the new version of the
  old risk, and it is the thing most likely to fail the review. Give the reviewer a working key in
  the "Notes for reviewer" field of the dashboard, along with the two steps to enter it (open the
  panel, menu, API key). Revoke it after the review.
- The data-use disclosures changed with it. See the section below, and the policy page.

Still worth confirming before you submit, from a `chrome-extension://` origin:

- `GET /api/health` returns `200`.
- `OPTIONS /api/ai/detect-claims` returns `204` with `Access-Control-Allow-Origin: *` and `POST`
  allowed. CORS is handled by `src/lib/cors.ts` plus the `headers()` rule in `next.config.ts`
  (`src/proxy.ts` was removed; Workers cannot run it).
- `POST /api/ai/detect-claims` with a real key in `x-fyi-api-key` returns claims.

## Screenshots

`screenshot-1-workbench-1280x800.png`, beside this file, is exactly 1280x800 and ready to upload.

**Know what it is before you upload it.** It is not a screenshot. It is a React reproduction of the
interface, rendered by the Remotion project in `media/tutorial-video` from the same article text and
the same movies-merged dataset the real demo uses. It is faithful, and it is not the product. A
reviewer comparing the listing against the installed extension is comparing against something that
never ran, which is the same objection that rules out the paper teaser below, in milder form.
Whether that is acceptable is a judgement call, and it is yours. Common practice for promotional
images; less defensible as the only image on the listing.

It also shows the pre-bring-your-own-key layout. The real panel header now carries the FYI mark, the
bound article's title and the overflow menu, and the setup flow is new. The mock still shows the
older header.

To regenerate it, from `media/tutorial-video`:

```
npx remotion still src/index.ts storeShot   ../../fyi-release/extension/store/screenshot-1-workbench-1280x800.png   --frame=0 --overwrite
```

The `storeShot` composition exists for this and fills the store's exact size, edge to edge, with no
letterboxing. The constraint is width, not height: Workspace's layout assumes a 1920 canvas
(ARTICLE_WIDTH 690, panel 1230), so it cannot be narrowed, but everything below the browser chrome
is flex and takes a taller canvas happily. It therefore renders at 1920x1200, which is 16:10
exactly, and scales by two thirds onto 1280x800. The extra height simply shows more article and
taller tool columns, which is what a real 16:10 window would show. The address bar reads
`thedaily.example.com`, a reserved example domain, since the article is written for the demo; it
previously pointed at a Render host that no longer serves anything.

Worth adding before you submit, since one image is the minimum rather than a good listing, and real
captures would answer the objection above:

- the side panel at its default narrow width, which is what a new user actually gets
- the setup flow's Model step, which shows the bring-your-own-key story the listing copy promises
- claims highlighted in the article itself, the feature that distinguishes this from a chat window

## Do NOT use the paper teaser

`public/teaser.png` is a camera-ready figure, not a capture. It carries the A1/B1/C1 annotation
badges and the DETECTION / VERIFICATION / DETERMINATION legend, and its address bar reads
`thedaily.example.com`, a fictional site. It also shows the full-width workbench rather than the
side panel a default install produces. It is the right image for the paper and the wrong one for a
store listing.

## Why the package is 75 MB

Chrome Web Store's Manifest V3 policy forbids executing remotely hosted code. The Python tool
previously loaded Pyodide from `cdn.jsdelivr.net` at runtime, which is exactly that pattern, so the
runtime and its wheels (pandas, numpy, matplotlib, and dependencies) now ship inside the package:
71.48 MB of the 74 MB unpacked total. It compresses to 22.99 MB for upload.

If review pushes back on size, the alternatives measured on 2026-07-30 were: drop Python from the
extension (~4 MB), or ship Pyodide with the standard library only and no scientific wheels (~13 MB).

## Listing copy

**Name:** FYI: Fact-check Your Information

**Short description** (132 char limit):

> Check data-driven claims in news articles. Detect claims, explore the underlying data, and reach your own verdict.

**Detailed description:**

> FYI turns any news article into something you can interrogate.
>
> Open the side panel on an article and FYI finds the factual, data-driven claims in it. Pick one and
> investigate it with a set of connected tools: ask an AI about the claim, pull up the underlying
> dataset in a table, build a chart to see the shape of the data, or run a quick Python analysis. When
> you have seen enough, record your own verdict: verified, misleading, or unverifiable.
>
> FYI does not tell you what to believe. It gives you the working surface to decide for yourself, and
> keeps your reasoning visible as you go.
>
> Built as a research tool for studying how people verify quantitative claims.
>
> Bring your own AI key. FYI's AI features run on a provider you choose and pay for, such as
> OpenRouter, and any OpenAI-compatible endpoint works. You enter the key once when you set the
> extension up, it is stored on your machine, and the AI features stay switched off until you do.
>
> What you can do:
> - Detect data-driven claims in the article you are reading
> - Ask questions about a claim, with optional web search
> - Explore CSV data in a sortable table
> - Build charts to check whether the data supports the claim
> - Run Python (pandas, numpy, matplotlib) directly in your browser
> - Record a structured verdict with your reasoning
>
> The Python runtime is bundled in the extension and runs entirely on your machine.

**Category:** Productivity (alternative: Education)

**Language:** English

## Permission justifications

Paste these into the dashboard when prompted. Each permission is queried separately.

**`activeTab`**
> The extension reads the article on the tab where the user opens the side panel, so it can detect
> factual claims in that article. It acts only on the tab the user explicitly opened the panel on.

**`scripting`**
> Used to inject the content script that extracts article text and highlights detected claims in
> place on the page.

**`sidePanel`**
> The entire user interface is presented in Chrome's side panel, alongside the article being read.

**`storage`**
> Stores the user's own settings, which is how the extension works at all: the user supplies their
> own AI provider API key, and it is kept in local extension storage on their machine so they do not
> have to re-enter it. It also preserves in-progress work, such as detected claims and chart state,
> across page reloads.

**`<all_urls>` host permission**
> The tool's purpose is fact-checking news articles, which appear on an unbounded set of news and
> publisher domains. Restricting to a fixed list of hosts would make the extension unusable for its
> stated purpose. The content script extracts article text only after the user opens the side panel
> on that tab; it takes no action on pages where the panel has not been opened.

**Remote code justification** (if asked)
> None. The Python runtime (Pyodide) and all its packages are bundled inside the extension package.
> Nothing is fetched and executed at runtime.

## Data-use disclosures

Tick these in the "Data usage" section, and see the policy page for the detail:

- **Website content**: collected. Article text from the page the user opens the panel on is sent to
  the FYI backend and on to the AI provider the user configured, to detect and evaluate claims.
- **Authentication information**: collected. **Read this one before you tick the boxes.** The user's
  API key is stored locally and sent as a request header on every AI call, so the extension both
  stores and transmits a credential. It is the user's own key for their own provider account, it is
  never stored or logged on our side, and it is not a credential of ours; but it is still a
  credential in transit, and the honest declaration is to disclose it. Under-declaring here is a
  rejection risk, and the mitigating detail belongs in the justification box, not in a silent
  omission.
- **User activity**: not collected. Interaction history stays in memory in the browser and is only
  written out if the user clicks Export session, which saves a local file.
- **Personally identifiable information**: not collected.
- **Health, financial, personal communications, location**: not collected.

Certify all three required statements: data is not sold to third parties, not used for purposes
unrelated to the item's core functionality, and not used for creditworthiness or lending.

## Before you submit

1. Deploy the current branch to the Worker. This is the one blocking action, and it clears two
   items at once: the backend starts honouring `x-fyi-api-key`, and the privacy policy URL below
   starts resolving. Until then the extension fails for every user who is not running a local dev
   server, whatever key they enter.
2. Read the policy at `/privacy-policy` in full before you paste its URL into the dashboard. Its
   bring-your-own-key sections are the ones to check, since they describe where the user's
   credential goes.
3. Put a working API key in the dashboard's "Notes for reviewer" field with the two steps to enter
   it, and revoke it once the review completes. Without this the reviewer has nothing to test.
4. Bump `version` in `manifest.json` if the current one has been uploaded before. The store rejects
   re-uploads of an existing version.
5. Rebuild and repackage: `npm run build:extension:store` then `powershell -File extension/scripts/package.ps1`.
6. Prepare listing screenshots: at least one at 1280x800 or 640x400.

## Known review risks

- **A reviewer with no key sees a tool that does nothing.** The likeliest cause of a functional
  rejection, and the reason point 2 above exists. The gating helps, since every AI control is
  visibly disabled with a reason attached rather than failing when clicked, but a reviewer who
  never enters a key never sees the product work.
- **Broad host permissions** put the item on the slower review track. Expect additional questions.
- **Package size.** 75 MB unpacked is unusual and may draw a question about what the wheels are for.
- **Transmitting a credential.** Expect the authentication-information disclosure to draw a
  question about why a key leaves the browser at all. The answer: the backend is a relay that adds
  the provider's request format and CORS handling, and it forwards the key without storing it.
