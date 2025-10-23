# publish-docs.ps1 — docs-only publish for FoodBridge
$ErrorActionPreference = "Stop"
$docs  = "C:\Users\Tetra\FoodBridge\docs"
$index = Join-Path $docs "index.html"

if (Test-Path $index) {
  $ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  $html = Get-Content $index -Raw
  $html = $html -replace '(src|href)=(["''])((?![^"''?]*\?v=)\S+\.(js|css))\2', "`$1=`$2`$3?v=$ts`$2"
  Set-Content $index $html
  Set-Content (Join-Path $docs "version.txt") "build=$ts"
}

git add $docs
if (-not (git diff --cached --quiet)) {
  git commit -m "Docs-only UI publish ($([DateTime]::UtcNow.ToString('s')))"
  git push
} else {
  Write-Host "No changes in /docs to publish."
}
