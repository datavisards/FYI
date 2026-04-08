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
        { src: 'extension/options.html', dest: '.' },
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
      input: {
        background: resolve(__dirname, 'background.ts'),
        content: resolve(__dirname, 'content.ts'),
        sidepanel: resolve(__dirname, 'sidepanel.html'),
        vegaSandbox: resolve(__dirname, 'vega-sandbox.html'),
        builderSandbox: resolve(__dirname, 'builder-sandbox.html'),
        pythonSandbox: resolve(__dirname, 'python-sandbox.html'),
        options: resolve(__dirname, 'options.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: '[name].[ext]',
      },
    },
    sourcemap: true,
    target: 'esnext',
    minify: false,
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
})
