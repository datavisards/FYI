# Packages extension/dist into an upload-ready zip for the Chrome Web Store.
#
# Do NOT use Compress-Archive for this. On Windows PowerShell 5.1 it writes
# nested entry names with backslashes, which violates the ZIP spec (forward
# slashes only) and makes Chrome mis-extract paths like
# extension/sandboxes/pyodide/pyodide.js, breaking the Python sandbox.
#
#   npm run build:extension:store
#   powershell -File extension/scripts/package.ps1

param(
  [string]$Version = (Get-Content "$(Split-Path $PSScriptRoot -Parent)\manifest.json" -Raw | ConvertFrom-Json).version
)

# Paths are relative to extension/, not to this script's own directory.
$extRoot = Split-Path $PSScriptRoot -Parent

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$dist = Join-Path $extRoot 'dist'
# Beside dist/, where .gitignore's `extension/*.zip` keeps it out of the repo.
$zip = Join-Path $extRoot "fyi-extension-$Version.zip"

if (-not (Test-Path $dist)) {
  Write-Error "No build found at $dist. Run: npm run build:extension:store"
  exit 1
}
if (Test-Path $zip) { [System.IO.File]::Delete($zip) }

$fs = [System.IO.File]::Open($zip, [System.IO.FileMode]::CreateNew)
$archive = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)

$count = 0
Get-ChildItem $dist -Recurse -File | ForEach-Object {
  $rel = $_.FullName.Substring($dist.Length + 1).Replace('\', '/')
  $entry = $archive.CreateEntry($rel, [System.IO.Compression.CompressionLevel]::Optimal)
  $stream = $entry.Open()
  $bytes = [System.IO.File]::ReadAllBytes($_.FullName)
  $stream.Write($bytes, 0, $bytes.Length)
  $stream.Dispose()
  $count++
}
$archive.Dispose()
$fs.Dispose()

$size = [math]::Round((Get-Item $zip).Length / 1MB, 2)
Write-Host "Packed $count files into $(Split-Path $zip -Leaf) ($size MB)"

# Fail loudly rather than shipping a broken package
$verify = [System.IO.Compression.ZipFile]::OpenRead($zip)
$bad = ($verify.Entries | Where-Object { $_.FullName -match '\\' }).Count
$hasManifest = ($verify.Entries | Where-Object { $_.FullName -eq 'manifest.json' }).Count -eq 1
$verify.Dispose()

if ($bad -gt 0) { Write-Error "$bad entries use backslashes; Chrome will mis-extract them."; exit 1 }
if (-not $hasManifest) { Write-Error "manifest.json is not at the archive root."; exit 1 }
Write-Host "Verified: forward-slash entries, manifest.json at root."
