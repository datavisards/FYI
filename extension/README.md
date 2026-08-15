# FYI Browser Extension

Side-panel extension: extract the article from the current page, detect claims with AI, and use the
same tools as the web app (AI Chat, Table Explorer, Chart Builder, Auto-Check).

## Build

From the project root:

```bash
npm install
npm run build:extension:store
```

That fetches the Pyodide runtime (see below) and builds into `extension/dist/`.

For a debuggable build with sourcemaps and unminified output, set `EXT_DEBUG=1`:

```bash
EXT_DEBUG=1 npm run build:extension          # macOS / Linux
$env:EXT_DEBUG=1; npm run build:extension    # PowerShell
```

## Python runtime is vendored, not fetched

The Python tool runs Pyodide inside a sandboxed iframe. Pyodide and its wheels (pandas, numpy,
matplotlib, and dependencies) ship **inside the package**, in `extension/vendor/pyodide/`, populated
by `npm run pyodide:fetch`.

This is not optional. Chrome Web Store's Manifest V3 policy forbids executing remotely hosted code,
so loading Pyodide from a CDN at runtime, which is what this extension used to do, gets a submission
rejected. `extension/vendor/` is gitignored because it is ~71 MB of binaries; run the fetch script on
a fresh clone before building.

Consequence: the packaged extension is about **75 MB**, of which ~71 MB is the Python runtime.

## Load in Chrome (development)

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `extension/dist` folder

## Packaging for the Chrome Web Store

```powershell
npm run build:extension:store
powershell -File extension/scripts/package.ps1
```

Upload the resulting `fyi-extension-<version>.zip` in the Developer Dashboard. The store rejects a
submission with no 128x128 icon: see `extension/icons/README.md`.

**Do not package with `Compress-Archive`.** On Windows PowerShell 5.1 it writes nested entry names
using backslashes, which violates the ZIP spec and makes Chrome mis-extract `extension/pyodide/*`,
silently breaking the Python sandbox. `package.ps1` writes forward-slash entries and verifies the
archive before it finishes.

## Backend

`src/lib/apiClient.ts` resolves the API base in this order:

1. An explicit override saved in the options page (`chrome.storage.sync`, key `apiBaseUrl`).
2. `http://localhost:3000` if `/api/health` answers within 1.5s, so a developer running `npm run dev`
   picks up their own server automatically.
3. `https://fyi.datavisards-hkust.workers.dev`.

For store users step 2 just fails fast and falls through to the hosted backend.

## Options

Set an explicit API base URL to skip the probe:

- Right-click the extension icon → **Options**, or
- `chrome://extensions/` → FYI → **Details** → **Extension options**

Leave it empty for the automatic behaviour above.

## CORS

The Next.js app reflects `chrome-extension://` and `moz-extension://` origins for `/api/*`
(see `src/proxy.ts`).
