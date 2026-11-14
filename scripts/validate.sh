#!/usr/bin/env bash
# `claude plugin validate .`, failing on a type error too. validate itself passes "with warnings" when a hooks
# module or a test no longer type-checks, which is how a new Claude Code release that changed a type would go
# unnoticed. CI runs this in both jobs; run it by hand the same way: scripts/validate.sh
set -uo pipefail

out="$(claude plugin validate . 2>&1)"
status=$?
printf '%s\n' "$out"
if [ "$status" -ne 0 ]; then
  exit "$status"
fi
errors="$(printf '%s\n' "$out" | grep -c 'error TS' || true)"
if [ "$errors" -gt 0 ]; then
  echo "::error::claude plugin validate reported $errors type error(s). Fix them, or the types changed in this Claude Code release."
  exit 1
fi
echo "No type errors."
