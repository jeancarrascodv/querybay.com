#!/usr/bin/env bash

set -xeuo pipefail

if [[ "$(uname -s)" == "Darwin" ]]; then
  echo "This should only be run on the linux servers"
	exit 1
fi

thisDir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${thisDir}/.."

[ -f ../.env ] && source ../.env
[ -f /var/lib/janium/.env ] && source /var/lib/janium/.env

if [[ -z "${CARGO_TARGET_DIR:-}" ]]; then
  echo "CARGO_TARGET_DIR not set in any .env files"
  exit 1
fi

export CARGO_TARGET_DIR="${CARGO_TARGET_DIR}"

if [[ -z "${DEFAULT_BRANCH:-}" ]]; then
  echo "DEFAULT_BRANCH not set in any .env files"
  exit 1
fi

CURRENT_BRANCH="$(git branch --show-current)"
git checkout "${DEFAULT_BRANCH}"

LAST_GIT="$(cat run/last_git.txt)"
LAST_BUILD_HASH="$(cat run/last_build_hash.txt)"

git pull

CURRENT_GIT="$(git rev-parse HEAD)"

if [ "x${CURRENT_GIT}" == "x${LAST_GIT}" ]; then
	echo "git hashes are the same"
	return 0
fi

cargo metadata --format-version=1 | jq .target_directory
cargo build --release -p janium

CURRENT_BUILD_HASH="$(sha256sum ~/.target/release/janium)"
git checkout "${CURRENT_BRANCH}"

if [ "x${CURRENT_BUILD_HASH}" == "x${LAST_BUILD_HASH}" ]; then
  echo "build hashes are the same"
	return 0
fi

echo -n "${CURRENT_GIT}" > run/last_git.txt
echo -n "${CURRENT_BUILD_HASH}" > run/last_build_hash.txt

echo finished downloading and building
