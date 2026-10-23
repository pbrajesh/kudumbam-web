# Build the app and pack it with the Raspberry Pi files into deploy\out\kudumbam-web-<date>.zip
#   powershell -ExecutionPolicy Bypass -File deploy\raspberry-pi\package.ps1
# Contains: app\ (built Angular files) and deploy\ (Pi scripts, services, Apache site).
# The API server is packed separately in its own repository (kudumbam-app: deploy\package.ps1).
# Never includes .env files, the data\ folder or backups.
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
  $stage = Join-Path $root "deploy\out\stage-web-$stamp"
  New-Item -ItemType Directory -Force "$stage\deploy" | Out-Null

  Copy-Item -Recurse 'dist\family-tree\browser' "$stage\app"
  Copy-Item 'deploy\raspberry-pi\*' "$stage\deploy" -Exclude 'package.ps1'

  # Shell scripts and config must have Unix line endings on the Pi.
  Get-ChildItem "$stage\deploy" -File | ForEach-Object {
    $text = [IO.File]::ReadAllText($_.FullName) -replace "`r`n", "`n"
    [IO.File]::WriteAllText($_.FullName, $text, (New-Object Text.UTF8Encoding $false))
  }

  # Never ship settings or family data, even if something was dropped into the build folder.
  Get-ChildItem -Recurse -Force $stage -Include '.env', '.env.*', '*.ged', '*.dump', 'backup-*.json' |
    Remove-Item -Force

  # Windows' tar writes a standard zip (-a picks the format from the .zip name); unzip on the Pi reads it.
  $out = Join-Path $root "deploy\out\kudumbam-web-$stamp.zip"
  tar -a -cf $out -C $stage app deploy
  if ($LASTEXITCODE -ne 0) { throw 'Packing failed.' }
  Remove-Item -Recurse -Force $stage
  Write-Host ''
  Write-Host "Package: $out"
  Write-Host 'Copy it to the Pi, e.g.:'
  Write-Host "  scp `"$out`" <user>@familytree.local:"
} finally {
  Pop-Location
}
