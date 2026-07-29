# Encode iOS signing files to base64 for GitHub Secrets (run on Windows).
# Usage:
#   .\encode-ios-secrets.ps1 -P12Path "C:\path\dist.p12" -ProfilePath "C:\path\AppStore.mobileprovision"

param(
    [Parameter(Mandatory = $true)]
    [string]$P12Path,
    [Parameter(Mandatory = $true)]
    [string]$ProfilePath
)

if (-not (Test-Path $P12Path)) { throw "P12 not found: $P12Path" }
if (-not (Test-Path $ProfilePath)) { throw "Profile not found: $ProfilePath" }

$p12B64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($P12Path))
$profileB64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($ProfilePath))

Write-Host ""
Write-Host "=== Copy each block into GitHub -> Settings -> Secrets -> Actions ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Secret name: IOS_BUILD_CERTIFICATE_BASE64"
Write-Host $p12B64
Write-Host ""
Write-Host "Secret name: IOS_PROVISION_PROFILE_BASE64"
Write-Host $profileB64
Write-Host ""
Write-Host "Also add manually:" -ForegroundColor Yellow
Write-Host "  IOS_P12_PASSWORD          = password you chose for the .p12 file"
Write-Host "  IOS_KEYCHAIN_PASSWORD   = any random string (e.g. ci-keychain-2026)"
Write-Host "  IOS_TEAM_ID             = 10-char Team ID from developer.apple.com/account"
Write-Host "  IOS_PROVISION_PROFILE_NAME = exact profile name in Apple Developer portal"
Write-Host "  APPSTORE_ISSUER_ID      = App Store Connect -> Users and Access -> Keys"
Write-Host "  APPSTORE_API_KEY_ID     = Key ID for App Store Connect API"
Write-Host "  APPSTORE_API_PRIVATE_KEY = full contents of AuthKey_XXXX.p8 file"
Write-Host ""
