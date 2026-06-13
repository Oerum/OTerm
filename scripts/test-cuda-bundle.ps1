# Mirrors the Windows CUDA publish job: stage runtime DLLs, build, verify bundle layout.
# Requires: CUDA toolkit (CUDA_PATH), Node 24+, Rust, LLVM/libclang.
param(
  [string]$CudaPath = $env:CUDA_PATH,
  [string]$TargetDir = "C:\oterm-t",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent
Set-Location $repoRoot

if (-not $CudaPath) {
  throw "CUDA_PATH is not set and -CudaPath was not provided."
}

$dest = Join-Path $repoRoot "src-tauri/cuda-runtime"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
$binDirs = @(
  Join-Path $CudaPath "bin\x64"
  Join-Path $CudaPath "bin"
) | Where-Object { Test-Path $_ }
if ($binDirs.Count -eq 0) {
  throw "CUDA bin directory not found under $CudaPath"
}

$patterns = @("cudart64_*.dll", "cublas64_*.dll", "cublasLt64_*.dll")
$copied = @()
foreach ($bin in $binDirs) {
  foreach ($pattern in $patterns) {
    Get-ChildItem -Path $bin -Filter $pattern -ErrorAction SilentlyContinue | ForEach-Object {
      if ($copied -notcontains $_.Name) {
        Copy-Item $_.FullName -Destination $dest -Force
        $copied += $_.Name
      }
    }
  }
}
if ($copied.Count -eq 0) {
  throw "No CUDA runtime DLLs found in $($binDirs -join ', ')"
}
Write-Host "Staged CUDA runtime DLLs: $($copied -join ', ')"

$resources = [ordered]@{}
foreach ($name in $copied) {
  $resources["cuda-runtime/$name"] = $name
}
$resources["icons/icon.ico"] = "icons/icon.ico"

$configObj = [ordered]@{
  productName = "OTerm CUDA"
  bundle = [ordered]@{
    createUpdaterArtifacts = $false
    resources = $resources
  }
}
$config = ($configObj | ConvertTo-Json -Compress -Depth 6)
Write-Host "Tauri config: $config"

if ($SkipBuild) {
  exit 0
}

$env:CARGO_TARGET_DIR = $TargetDir
$env:OTERM_WHISPER_BACKEND = "cuda"
npm run tauri build -- --features whisper-cuda -c $config
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
foreach ($dll in (Get-ChildItem -Path $dest -Filter "*.dll")) {
  $installed = Join-Path $dir $dll.Name
  if (-not (Test-Path $installed)) {
    throw "Bundled CUDA DLL missing from install tree: $($dll.Name) (expected at $installed)"
  }
}
Write-Host "Verified $($copied.Count) CUDA runtime DLL(s) beside oterm.exe in $dir"
