#!/usr/bin/env bash
# Import distribution certificate + provisioning profile on GitHub macOS runner.
set -euo pipefail

: "${IOS_BUILD_CERTIFICATE_BASE64:?Missing IOS_BUILD_CERTIFICATE_BASE64 secret}"
: "${IOS_P12_PASSWORD:?Missing IOS_P12_PASSWORD secret}"
: "${IOS_PROVISION_PROFILE_BASE64:?Missing IOS_PROVISION_PROFILE_BASE64 secret}"
: "${IOS_KEYCHAIN_PASSWORD:?Missing IOS_KEYCHAIN_PASSWORD secret}"

KEYCHAIN_PATH="${RUNNER_TEMP}/app-signing.keychain-db"
CERT_PATH="${RUNNER_TEMP}/distribution.p12"
PROFILE_PATH="${RUNNER_TEMP}/distribution.mobileprovision"

echo "$IOS_BUILD_CERTIFICATE_BASE64" | base64 --decode > "$CERT_PATH"
echo "$IOS_PROVISION_PROFILE_BASE64" | base64 --decode > "$PROFILE_PATH"

security create-keychain -p "$IOS_KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
security set-keychain-settings -lut 21600 "$KEYCHAIN_PATH"
security unlock-keychain -p "$IOS_KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
security import "$CERT_PATH" -P "$IOS_P12_PASSWORD" -A -t cert -f pkcs12 -k "$KEYCHAIN_PATH"
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$IOS_KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
security list-keychain -d user -s "$KEYCHAIN_PATH"

PROFILE_UUID="$(
  /usr/libexec/PlistBuddy -c "Print UUID" /dev/stdin <<<"$(security cms -D -i "$PROFILE_PATH")"
)"
PROFILE_DIR="${HOME}/Library/MobileDevice/Provisioning Profiles"
mkdir -p "$PROFILE_DIR"
cp "$PROFILE_PATH" "${PROFILE_DIR}/${PROFILE_UUID}.mobileprovision"

echo "Imported provisioning profile UUID: ${PROFILE_UUID}"
