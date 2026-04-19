#!/usr/bin/env bash

set -xeuo pipefail

thisDir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ -f ../.env ] && source ../.env
[ -f /var/lib/janium/.env ] && source /var/lib/janium/.env

if [[ -z "${CARGO_TARGET_DIR:-}" ]]; then
  echo "CARGO_TARGET_DIR not set in any .env files"
  exit 1
fi

export CARGO_TARGET_DIR="${CARGO_TARGET_DIR}"

cargo build -p janium "${@}"
cd "${thisDir}/.."

export DATABASE_URL="${DB_CONNECT_URL}"
ormlite up --all --no-snapshot

echo "finished database migrations"

systemctl --user daemon-reload
systemctl --user stop janium
cp "${CARGO_TARGET_DIR}/release/janium" /usr/local/bin/janium
systemctl --user start janium

echo "finished restarting service"

journalctl --user -u janium -f
