# Build the app and pack everything the Raspberry Pi needs into deploy\out\family-tree-<date>.tgz
#   powershell -ExecutionPolicy Bypass -File deploy\raspberry-pi\package.ps1
# Contains: app\ (built Angular files), server\ (API code, no node_modules / .env / data / tests), deploy\ (Pi files).
# Never includes your .env, local database (.pgdata), data\ folder or backups.
$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$node = 'D:\nodejs-v24.11.0'
if (-not (Get-Command node -ErrorAction SilentlyContinue) -and (Test-Path "$node\node.exe")) { $env:Path = "$node;$env:Path" }
$env:NG_CLI_ANALYTICS = 'false'

Push-Location $root
try {
  Write-Host 'Building the app…'
  npx ng build
  if ($LASTEXITCODE -ne 0) { throw 'The app build failed.' }

  $stamp = Get-Date -Format 'yyyyMMdd-HHmm'
  $stage = Join-Path $root "deploy\out\stage-$stamp"
  New-Item -ItemType Directory -Force "$stage\server", "$stage\deploy" | Out-Null

  Copy-Item -Recurse 'dist\family-tree\browser' "$stage\app"
  foreach ($item in 'src', 'migrations', 'scripts', 'package.json', 'package-lock.json', 'tsconfig.json', '.env.example') {
    Copy-Item -Recurse "server\$item" "$stage\server\$item"
  }
  Copy-Item 'deploy\raspberry-pi\*' "$stage\deploy" -Exclude 'package.ps1'

  # Shell scripts and config must have Unix line endings on the Pi.
  Get-ChildItem "$stage\deploy" -File | ForEach-Object {
    $text = [IO.File]::ReadAllText($_.FullName) -replace "`r`n", "`n"
    [IO.File]::WriteAllText($_.FullName, $text, (New-Object Text.UTF8Encoding $false))
  }

  $out = Join-Path $root "deploy\out\family-tree-$stamp.tgz"
  tar -czf $out -C $stage app server deploy
  if ($LASTEXITCODE -ne 0) { throw 'Packing failed.' }
  Remove-Item -Recurse -Force $stage
  Write-Host ''
  Write-Host "Package: $out"
  Write-Host 'Copy it to the Pi, e.g.:'
  Write-Host "  scp `"$out`" pi@familytree.local:"
} finally {
  Pop-Location
}
