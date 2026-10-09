# Build Canvastool Docker image (version + latest) and push to Zot.
# Version comes from ../VERSION — the only place you need to bump it.
param(
    [switch]$SkipPush
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$versionFile = Join-Path $RepoRoot "VERSION"
$imageRepo = "zotregistry.jelph.nl/jelph/canvastool"

if (-not (Test-Path $versionFile)) {
    Write-Error "Missing VERSION file at $versionFile"
}
$env:CANVASTOOL_VERSION = (Get-Content $versionFile -Raw).Trim()
if (-not $env:CANVASTOOL_VERSION) {
    Write-Error "VERSION file is empty"
}

$versionTag = "${imageRepo}:$($env:CANVASTOOL_VERSION)"
$latestTag = "${imageRepo}:latest"

Write-Host "Building $versionTag (+ latest)..." -ForegroundColor Cyan
Push-Location $RepoRoot
try {
    docker compose build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    if ($SkipPush) {
        Write-Host "SkipPush: not pushing." -ForegroundColor DarkGray
        exit 0
    }

    Write-Host "Pushing $versionTag..." -ForegroundColor Cyan
    docker push $versionTag
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Write-Host "Pushing $latestTag..." -ForegroundColor Cyan
    docker push $latestTag
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Write-Host "Done. Pushed $versionTag and $latestTag" -ForegroundColor Green
}
finally {
    Pop-Location
}
