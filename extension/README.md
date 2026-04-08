# FYI Browser Extension

 Side-panel only extension: extract article from the current page, detect claims with AI, and use the same tools (AI Chat, Table Explorer, Chart Builder, Auto-Check) as the web app.

## Build

From project root:

```bash
npm install
npm run build:extension
```

Output is in `extension/dist/`.

## Load in Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `extension/dist` folder

## Options

Set the API base URL (your Next.js app) so the extension can call detect-claims, chat, etc.:

- Right-click the extension icon → **Options**, or
- Open `chrome://extensions/` → FYI → **Details** → **Extension options**

Default: `http://localhost:3000`. Use your deployed URL in production.

## CORS

The Next.js app allows `chrome-extension://` and `moz-extension://` origins for `/api/*` (see `src/middleware.ts`). For local dev, run `npm run dev` and set the extension options to `http://localhost:3000`.
