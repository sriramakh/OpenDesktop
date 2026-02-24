#!/bin/bash
# launch-firefox-debug.sh
#
# Start Firefox with CDP remote debugging enabled on port 9223.
# After running this script, Firefox tabs will be fully accessible in OpenDesktop
# via tabs_list, tabs_read, tabs_find_forms, tabs_fill_form, and tabs_run_js.
#
# Port 9223 is used (instead of 9222) to avoid conflicts with Chrome's debug port.
#
# NOTE: Firefox has a single-instance restriction. This script closes any existing
# Firefox window and reopens it with debugging enabled.
#
# Usage:
#   bash scripts/launch-firefox-debug.sh
#   bash scripts/launch-firefox-debug.sh https://example.com   # open a URL

FIREFOX="/Applications/Firefox.app/Contents/MacOS/firefox"

if [ ! -f "$FIREFOX" ]; then
  echo "Firefox not found at $FIREFOX"
  echo "Please install Firefox from https://www.mozilla.org/firefox/"
  exit 1
fi

# If Firefox debug port is already active, reuse it
if curl -s --connect-timeout 1 http://localhost:9223/json/version >/dev/null 2>&1; then
  echo "Firefox debug port 9223 is already active."
  echo "OpenDesktop can already connect to it."
  exit 0
fi

# Close any existing Firefox (required — Firefox single-instance mode won't
# open a new process with different flags while one is already running)
if pgrep -x "firefox" > /dev/null 2>&1; then
  echo "Closing existing Firefox to restart with remote debugging..."
  osascript -e 'tell application "Firefox" to quit' 2>/dev/null || \
    pkill -x "firefox" 2>/dev/null
  sleep 3
fi

echo "Starting Firefox with remote debugging on port 9223..."
echo "OpenDesktop will be able to list tabs, read content, fill forms, and run JavaScript."
echo ""
echo "To verify after start: curl http://localhost:9223/json/version"
echo ""

exec "$FIREFOX" --remote-debugging-port=9223 "$@"
