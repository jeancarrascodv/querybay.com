#!/usr/bin/env bash

set -xeuo pipefail

thisDir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${thisDir}/download_and_build.sh"
cd "${thisDir}/.."

export DATABASE_URL="${DB_CONNECT_URL}"
git checkout "${DEFAULT_BRANCH}"
ormlite up --all --no-snapshot
git checkout "${CURRENT_BRANCH}"

echo "finished database migrations"

systemctl --user daemon-reload
systemctl --user stop janium
cp "${CARGO_TARGET_DIR}/release/janium" /usr/local/bin/janium
systemctl --user start janium

echo "finished restarting service"
