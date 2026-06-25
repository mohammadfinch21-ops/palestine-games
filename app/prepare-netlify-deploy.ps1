# Build slim Netlify drag-and-drop folder (under 10 MB).
# Does NOT modify source files — output: netlify-deploy/
# Requires: Python 3 + Pillow (pip install pillow)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "Building netlify-deploy/ (compressed, under 10 MB)..." -ForegroundColor Cyan

python -c "import PIL" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Installing Pillow..." -ForegroundColor Yellow
    pip install pillow
}

python build_netlify_deploy.py
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Done. Drag this folder to Netlify Drop:" -ForegroundColor Green
Write-Host "  $PSScriptRoot\netlify-deploy" -ForegroundColor White
Write-Host "  https://app.netlify.com/drop" -ForegroundColor DarkGray
