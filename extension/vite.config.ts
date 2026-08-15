import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

export default defineConfig({
  root,
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: 'extension/manifest.json', dest: '.' },
        // PNGs only: the folder also holds the generator and its README, which
        // have no business in the packaged extension.
        { src: 'extension/icons/*.png', dest: 'icons' },
        // Pyodide ships inside the package; nothing is fetched at runtime.
        // Beside the sandbox page that loads it, which resolves './pyodide/'
        // relative to itself. Populate with: node extension/scripts/fetch-pyodide.mjs
        { src: 'extension/vendor/pyodide/*', dest: 'extension/sandboxes/pyodide' },
      ],
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(root, 'src'),
    },
  },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      // The keys become the emitted script names, so `background` and `content`
      // must keep theirs: the manifest names background.js and content.js.
      input: {
        background: resolve(__dirname, 'background.ts'),
        content: resolve(__dirname, 'content/index.ts'),
        sidepanel: resolve(__dirname, 'pages/sidepanel.html'),
        options: resolve(__dirname, 'pages/options.html'),
        vegaSandbox: resolve(__dirname, 'sandboxes/vega.html'),
        builderSandbox: resolve(__dirname, 'sandboxes/builder.html'),
        pythonSandbox: resolve(__dirname, 'sandboxes/python.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: '[name].[ext]',
      },
    },
    // Store builds ship neither sourcemaps nor readable source: they added
    // ~8 MB to the package. Set EXT_DEBUG=1 for a debuggable local build.
    sourcemap: process.env.EXT_DEBUG === '1',
    target: 'esnext',
    minify: process.env.EXT_DEBUG === '1' ? false : 'esbuild',
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
})
