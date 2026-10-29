#!/usr/bin/env bash
# Decrypts the @hive3 posting key (encrypted at rest with age) and runs the
# given node script with it set as HIVE3_POSTING_KEY. Never prints the key.
#
# Usage: ./run-with-key.sh <script.js> [args...]
#   e.g. ./run-with-key.sh flag-phishing.js phishing-untouched.json
#        pm2 start run-with-key.sh --name phishing-flagger -- flag-phishing.js phishing-untouched.json

set -euo pipefail

KEYFILE="/root/.config/age/hive3.key"
ENCRYPTED="/opt/hive-block-producer/secrets/hive3-posting.key.age"

if [ ! -f "$KEYFILE" ] || [ ! -f "$ENCRYPTED" ]; then
  echo "Missing $KEYFILE or $ENCRYPTED — run the one-time encryption step first." >&2
  exit 1
fi

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <script.js> [args...]" >&2
  exit 1
fi

export HIVE3_POSTING_KEY
HIVE3_POSTING_KEY="$(age -d -i "$KEYFILE" "$ENCRYPTED")"

exec node "$@"
