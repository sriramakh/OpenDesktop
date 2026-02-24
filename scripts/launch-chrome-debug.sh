#!/bin/bash
# launch-chrome-debug.sh
#
# Start Google Chrome with remote debugging on port 9222.
# This enables OpenDesktop to fully manage tabs, read page content,
# detect/fill forms, and run JavaScript via CDP.
#
# NOTE: Chrome security policy requires a non-default profile directory for
# remote debugging. This script uses ~/ChromeDebug as the profile.
# Log in to your accounts in this window once — Chrome saves your sessions.
#
# Debugging port only accepts connections from localhost (safe).
#
# Usage:
#   bash scripts/launch-chrome-debug.sh
#   bash scripts/launch-chrome-debug.sh https://example.com

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
DEBUG_PROFILE="$HOME/Library/Application Support/Google/ChromeDebug"

if [ ! -f "$CHROME" ]; then
  echo "Google Chrome not found at: $CHROME"
  echo "Please install Chrome from https://www.google.com/chrome/"
  exit 1
fi

# If a debug-profile Chrome is already running with port 9222, reuse it
if curl -s --connect-timeout 1 http://localhost:9222/json/version >/dev/null 2>&1; then
  echo "Chrome debug port 9222 is already active."
  echo "OpenDesktop can already connect to it."
  exit 0
fi

echo "Starting Chrome with remote debugging on port 9222..."
echo "Profile: $DEBUG_PROFILE"
echo ""
echo "FIRST-TIME SETUP: Log in to Gmail, Facebook, etc. in this Chrome window."
echo "Your logins are saved in the debug profile — no need to log in again."
echo ""
echo "To verify after start: curl http://localhost:9222/json/version"
echo ""

exec "$CHROME" \
  --remote-debugging-port=9222 \
  --user-data-dir="$DEBUG_PROFILE" \
  --no-first-run \
  "$@"
