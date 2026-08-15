/**
 * Vendors the Pyodide runtime and the wheels the Python sandbox needs into
 * extension/vendor/pyodide/, so the packaged extension executes no remotely
 * hosted code. Chrome Web Store's Manifest V3 policy forbids fetching and
 * running code at runtime, which is what loading Pyodide from a CDN does.
 *
 * The output directory is gitignored: these are ~71 MB of binaries that would
 * bloat a public repo. Run this before building a package for the store.
 *
 *   node extension/scripts/fetch-pyodide.mjs
 *
 * Re-running is cheap; files already present are skipped.
 */
import { mkdir, writeFile, stat } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const VERSION = '0.26.4'
const BASE = `https://cdn.jsdelivr.net/pyodide/v${VERSION}/full/`
const PACKAGES = ['pandas', 'numpy', 'matplotlib']

const CORE = [
  'pyodide.js',
  'pyodide.mjs',
  'pyodide.asm.js',
  'pyodide.asm.wasm',
  'python_stdlib.zip',
  'pyodide-lock.json',
]

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'vendor', 'pyodide')

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function download(name) {
  const dest = join(outDir, name)
  if (await exists(dest)) return { name, bytes: 0, skipped: true }

  const resp = await fetch(BASE + name)
  if (!resp.ok) throw new Error(`${name}: HTTP ${resp.status}`)
  const buf = Buffer.from(await resp.arrayBuffer())
  await writeFile(dest, buf)
  return { name, bytes: buf.length, skipped: false }
}

/** Walk `depends` so we vendor the full closure, not just the three names above. */
function closure(lock, roots) {
  const seen = new Set()
  const queue = [...roots]
  while (queue.length) {
    const name = queue.shift()
    if (seen.has(name)) continue
    const pkg = lock.packages[name]
    if (!pkg) continue
    seen.add(name)
    queue.push(...(pkg.depends ?? []))
  }
  return [...seen].map((n) => lock.packages[n].file_name)
}

await mkdir(outDir, { recursive: true })

let total = 0
for (const name of CORE) {
  const { bytes, skipped } = await download(name)
  total += bytes
  console.log(`  ${skipped ? 'skip' : 'get '} ${name}`)
}

const lock = JSON.parse(
  await (await fetch(BASE + 'pyodide-lock.json')).text()
)
const wheels = closure(lock, PACKAGES)
console.log(`  ${wheels.length} wheels for ${PACKAGES.join(', ')} (with dependencies)`)

for (const name of wheels) {
  const { bytes, skipped } = await download(name)
  total += bytes
  console.log(`  ${skipped ? 'skip' : 'get '} ${name}`)
}

console.log(`\nVendored into extension/vendor/pyodide (${(total / 1024 / 1024).toFixed(1)} MB downloaded this run)`)
