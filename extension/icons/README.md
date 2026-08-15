# Extension icons

Drop the finished PNGs here and the build picks them up automatically
(`extension/vite.config.ts` copies `extension/icons/*` into `dist/icons/`).

Required files:

| File | Size | Used for |
|---|---|---|
| `icon16.png` | 16x16 | favicon next to the toolbar item |
| `icon48.png` | 48x48 | extensions management page |
| `icon128.png` | 128x128 | install dialog and the Chrome Web Store listing |

Chrome Web Store will not accept a submission without a 128x128 icon.

After adding them, wire them into `extension/manifest.json`:

```json
"icons": { "16": "icons/icon16.png", "48": "icons/icon48.png", "128": "icons/icon128.png" },
"action": { "default_title": "Open FYI", "default_icon": { "16": "icons/icon16.png", "48": "icons/icon48.png", "128": "icons/icon128.png" } }
```

Design note: the wordmark lives at `public/fyi-mark.svg` and is the single source
for every surface (both web headers and the extension panel reference that file).
It sets "FYI" with the dashed underline the app draws under a detected claim, so
the mark reads as a claim sitting in text. Worth carrying into the icon for
consistency; cut these PNGs from that SVG rather than redrawing them.
