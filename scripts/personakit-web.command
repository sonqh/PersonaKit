#!/bin/sh
# PersonaKit web app launcher for macOS. Double-click this file to start PersonaKit.
# It needs the one-time install: Node.js 22 and "npm link" in the PersonaKit folder.
# Keep the window open while you use the app. Close it to stop PersonaKit.
PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
export PATH
if ! command -v personakit >/dev/null 2>&1; then
  echo "PersonaKit is not installed. Install Node.js 22, then run \"npm link\" in the PersonaKit folder."
  read -r _
  exit 1
fi
personakit serve --open
