#Requires -Version 5.1
<#
.SYNOPSIS
  Switch primary SEO host from palestine-games.netlify.app to games.scout4pal.com

.DESCRIPTION
  Run ONLY after https://games.scout4pal.com opens with a valid HTTPS certificate.
  Does not remove the Netlify subdomain — both hosts can serve the same site.

.EXAMPLE
  cd app
  .\scripts\switch-primary-host.ps1
#>

$ErrorActionPreference = 'Stop'

$OldHost = 'palestine-games.netlify.app'
$NewHost = 'games.scout4pal.com'
$AppRoot = Split-Path -Parent $PSScriptRoot

Write-Host "App root: $AppRoot"
Write-Host "Replace:  $OldHost  ->  $NewHost"
Write-Host ""

$patterns = @('*.html', 'robots.txt', 'sitemap.xml')

$files = foreach ($pat in $patterns) {
  Get-ChildItem -Path $AppRoot -Recurse -File -Filter $pat |
    Where-Object {
      $_.FullName -notmatch '[\\/]\.git[\\/]' -and
      $_.FullName -notmatch '[\\/]node_modules[\\/]' -and
      $_.FullName -notmatch '[\\/]netlify-deploy[\\/]'
    }
}

$changed = 0
foreach ($file in $files) {
  $text = [System.IO.File]::ReadAllText($file.FullName)
  if ($text -notlike "*$OldHost*") { continue }
  $updated = $text.Replace($OldHost, $NewHost)
  $utf8NoBom = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($file.FullName, $updated, $utf8NoBom)
  $rel = $file.FullName.Substring($AppRoot.Length).TrimStart('\', '/')
  Write-Host " updated: $rel"
  $changed++
}

Write-Host ""
if ($changed -eq 0) {
  Write-Host "No files still used $OldHost (already switched, or paths differ)."
} else {
  Write-Host "Done. Updated $changed file(s)."
  Write-Host "Next: commit, push / redeploy on Netlify, then submit sitemap in Search Console:"
  Write-Host "  https://$NewHost/sitemap.xml"
}