# publish-full-ui.ps1 — mirror ROOT UI to /docs, cache-bump, commit, push
$ErrorActionPreference = "Stop"

$repo  = "C:\Users\Tetra\FoodBridge"
$docs  = Join-Path $repo "docs"
$index = Join-Path $docs "index.html"

# Ensure we're on main and synced
cd $repo
git rebase --abort 2>$null
git fetch origin
git checkout main
git pull --rebase origin main

# Make sure /docs + /docs/assets exist
if (!(Test-Path $docs)) { New-Item -ItemType Directory -Path $docs | Out-Null }
$assetsDir = Join-Path $docs "assets"
if (!(Test-Path $assetsDir)) { New-Item -ItemType Directory -Path $assetsDir | Out-Null }

# Copy root UI files if they exist
$rootUiFiles = @("index.html","app.js","styles.css","config.js","favicon.ico")
$copied = @()
foreach ($f in $rootUiFiles) {
  $src = Join-Path $repo $f
  if (Test-Path $src) {
    Copy-Item -LiteralPath $src -Destination $docs -Force
    $copied += $f
  }
}

# Copy assets folder (if present)
$rootAssets = Join-Path $repo "assets"
if (Test-Path $rootAssets) {
  Copy-Item -Path (Join-Path $rootAssets "*") -Destination $assetsDir -Recurse -Force
}

# Pages helpers: .nojekyll + 404.html
if (Test-Path $index) {
  Copy-Item -LiteralPath $index -Destination (Join-Path $docs "404.html") -Force
}
New-Item -ItemType File -Path (Join-Path $docs ".nojekyll") -Force | Out-Null

# Cache-bump all JS/CSS refs in /docs/index.html
if (Test-Path $index) {
  $ts   = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  $html = Get-Content -LiteralPath $index -Raw
  $pattern     = '(src|href)=("|\')((?![^"\']*\?v=)\S+\.(?:js|css))\2'
  $replacement = '$1=$2$3?v=' + $ts + '$2'
  $html = [regex]::Replace($html, $pattern, $replacement)
  Set-Content -LiteralPath $index -Value $html -Encoding UTF8
  Set-Content -LiteralPath (Join-Path $docs "version.txt") -Value ("build={0}" -f $ts) -Encoding UTF8
}

# Stage and commit only /docs
git add -f -- docs
if (-not (git diff --cached --quiet)) {
  $msg = "Publish FULL UI to /docs (cache-bumped $(Get-Date -Format s)); files: " + ($copied -join ', ')
  git commit -m $msg
  git push
} else {
  Write-Host "No changes to /docs to publish."
}
