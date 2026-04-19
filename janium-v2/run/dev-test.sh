#!/usr/bin/env bash
# Run dev-server tests (requires dev DB with LinkedIn account).
# These tests are #[ignore]'d by default and need JANIUM_DEV_TESTS=1.
#
# Usage:
#   ./run/dev-test.sh                     # list available dev tests
#   ./run/dev-test.sh test_download_inbox  # run a specific test
#   ./run/dev-test.sh all                 # run all dev tests (sequentially)

set -euo pipefail

export JANIUM_DEV_TESTS=1

if [ $# -eq 0 ]; then
  echo "Available dev tests:"
  cargo test --package janium --lib -- --ignored --list 2>/dev/null
  echo
  echo "Usage: $0 <test_name>    # run one test"
  echo "       $0 all            # run all tests sequentially"
  exit 0
fi

if [ "$1" = "all" ]; then
  cargo test --package janium --lib -- --ignored
else
  cargo test --package janium --lib -- "$1" --ignored
fi
