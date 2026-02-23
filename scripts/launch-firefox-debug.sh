#!/bin/bash
# launch-firefox-debug.sh
#
# Start Firefox with CDP remote debugging enabled on port 9223.
# After running this script, Firefox tabs will be fully accessible in OpenDesktop
# via tabs_list, tabs_read, tabs_find_forms, tabs_fill_form, and tabs_run_js.
#
# Port 9223 is used (instead of 9222) to avoid conflicts with Chrome's debug port.
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

echo "Starting Firefox with remote debugging on port 9223..."
echo "OpenDesktop can now access Firefox tabs."
echo ""
echo "To verify: curl http://localhost:9223/json/version"
echo ""

exec "$FIREFOX" --remote-debugging-port=9223 "$@"
