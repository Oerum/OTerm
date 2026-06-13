# Validates Tauri root-level resource bundling (same map shape as the CUDA publish job).
# Uses whisper-vulkan so it runs without a CUDA toolkit.
param(
  [string]$TargetDir = "C:\oterm-t",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent
Set-Location $repoRoot

$dest = Join-Path $repoRoot "src-tauri/cuda-runtime"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
$marker = Join-Path $dest "bundle-marker.dll"
Copy-Item (Join-Path $env:SystemRoot "System32\version.dll") $marker -Force

$config = @{
  productName = "OTerm"
  bundle = @{
    createUpdaterArtifacts = $false
    resources = @{
      "cuda-runtime/bundle-marker.dll" = "bundle-marker.dll"
      "icons/icon.ico" = "icons/icon.ico"
    }
  }
} | ConvertTo-Json -Compress -Depth 6

Write-Host "Tauri config: $config"
if ($SkipBuild) {
  exit 0
}

$env:CARGO_TARGET_DIR = $TargetDir
$env:OTERM_WHISPER_BACKEND = "vulkan"
npm run tauri build -- --features whisper-vulkan -c $config
if ($LASTEXITCODE -ne 0) {
  throw "tauri build failed with exit code $LASTEXITCODE"
}

$releaseDir = Join-Path $TargetDir "release"
$exePath = Join-Path $releaseDir "oterm.exe"
if (-not (Test-Path $exePath)) {
  $exe = Get-ChildItem -Path (Join-Path $TargetDir "release/bundle") -Recurse -Filter "oterm.exe" -ErrorAction Stop |
    Select-Object -First 1
  $exePath = $exe.FullName
}
$dir = Split-Path $exePath -Parent
$installed = Join-Path $dir "bundle-marker.dll"
if (-not (Test-Path $installed)) {
  throw "bundle-marker.dll missing beside oterm.exe (expected at $installed)"
}
Write-Host "Verified bundle-marker.dll beside oterm.exe in $dir"
