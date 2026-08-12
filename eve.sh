#!/bin/sh
#  EVE — run ./eve.sh on Linux, a Raspberry Pi, or a Mac.
#
#  Starts her on this machine and opens her eye. Nothing is uploaded and
#  nothing is installed; Ctrl-C stops her.

cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "  EVE needs Node.js, which is not installed."
  echo
  echo "  On a Raspberry Pi or Debian/Ubuntu:  sudo apt install nodejs"
  echo "  On a Mac with Homebrew:              brew install node"
  echo "  Otherwise:                           https://nodejs.org"
  echo
  exit 1
fi

echo
echo "  Starting EVE. Ctrl-C stops her."
echo

exec node eve-proxy.js --open "$@"
