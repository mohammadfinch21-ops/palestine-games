#!/usr/bin/env bash
# Generate ExportOptions.plist for App Store export from GitHub secrets.
set -euo pipefail

OUT="${1:?Usage: ios-generate-export-options.sh <output.plist>}"
: "${IOS_TEAM_ID:?Missing IOS_TEAM_ID}"
: "${IOS_PROVISION_PROFILE_NAME:?Missing IOS_PROVISION_PROFILE_NAME}"

cat > "$OUT" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store</string>
  <key>teamID</key>
  <string>${IOS_TEAM_ID}</string>
  <key>uploadSymbols</key>
  <true/>
  <key>signingStyle</key>
  <string>manual</string>
  <key>provisioningProfiles</key>
  <dict>
    <key>com.scout4pal.palestinetrain</key>
    <string>${IOS_PROVISION_PROFILE_NAME}</string>
  </dict>
</dict>
</plist>
EOF

echo "Wrote ${OUT}"
