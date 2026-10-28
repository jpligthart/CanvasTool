# Release helper (not for daily local dev — use `docker compose up --build` for that).
# Builds linux/amd64 + linux/arm64, tags VERSION + latest, pushes to CANVASTOOL_IMAGE.
# Does not bump VERSION: edit the VERSION file yourself before running.
param(
    [switch]$SkipPush
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$versionFile = Join-Path $RepoRoot "VERSION"
$envFile = Join-Path $RepoRoot ".env"
$platforms = "linux/amd64,linux/arm64"

function Get-DotEnvValue([string]$Path, [string]$Key) {
    if (-not (Test-Path $Path)) { return $null }
    foreach ($line in Get-Content $Path) {
        if ($line -match "^\s*$([regex]::Escape($Key))\s*=\s*(.*)$") {
            return $matches[1].Trim().Trim('"').Trim("'")
        }
    }
    return $null
}

$imageRepo = $env:CANVASTOOL_IMAGE
if (-not $imageRepo) {
    $imageRepo = Get-DotEnvValue $envFile "CANVASTOOL_IMAGE"
}
if (-not $imageRepo) {
    Write-Error "Set CANVASTOOL_IMAGE in .env or the environment (registry/repo without tag)."
}

if (-not (Test-Path $versionFile)) {
    Write-Error "Missing VERSION file at $versionFile"
}
$env:CANVASTOOL_VERSION = (Get-Content $versionFile -Raw).Trim()
if (-not $env:CANVASTOOL_VERSION) {
    Write-Error "VERSION file is empty"
}

$versionTag = "${imageRepo}:$($env:CANVASTOOL_VERSION)"
$latestTag = "${imageRepo}:latest"
$created = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss'Z'")
$builder = "canvastool-multi"

# The default docker driver cannot export a multi-platform manifest.
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
docker buildx inspect $builder 2>$null | Out-Null
$builderExists = $LASTEXITCODE -eq 0
$ErrorActionPreference = $prevEap
if (-not $builderExists) {
    docker buildx create --name $builder --driver docker-container
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Push-Location $RepoRoot
try {
    if ($SkipPush) {
        $serverOs = docker version -f "{{.Server.Os}}"
        $serverArch = docker version -f "{{.Server.Arch}}"
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        $native = "$serverOs/$serverArch"
        Write-Host "SkipPush: building $native only and loading it locally as ${imageRepo}:local" -ForegroundColor DarkGray
        docker buildx build `
            --builder $builder `
            --load `
            --platform $native `
            --build-arg "VERSION=$($env:CANVASTOOL_VERSION)" `
            --build-arg "IMAGE_CREATED=$created" `
            -t "${imageRepo}:local" `
            .
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        exit 0
    }

    Write-Host "Building and pushing $versionTag (+ latest) for $platforms..." -ForegroundColor Cyan
    docker buildx build `
        --builder $builder `
        --platform $platforms `
        --push `
        --build-arg "VERSION=$($env:CANVASTOOL_VERSION)" `
        --build-arg "IMAGE_CREATED=$created" `
        -t $versionTag `
        -t $latestTag `
        .
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Write-Host "Done. Pushed $versionTag and $latestTag ($platforms)" -ForegroundColor Green
}
finally {
    Pop-Location
    # Drop the buildkit container; --keep-state leaves the cache volume for the next run.
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    docker buildx rm --keep-state --force $builder 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Could not remove buildx builder $builder (exit $LASTEXITCODE)." -ForegroundColor Yellow
    }
    $ErrorActionPreference = $prevEap
}
