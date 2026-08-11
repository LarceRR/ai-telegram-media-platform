#!/usr/bin/env bash
#
# Runs one CI command, streams its output, and on failure re-emits the tail of
# that output as a GitHub workflow annotation.
#
# Why: raw job logs require an authenticated download, while check-run
# annotations are readable from the public API. Without this wrapper a red step
# only reports "Process completed with exit code 1", which is not diagnosable.
set -uo pipefail

label="${1:?usage: ci-run.sh <label> <command...>}"
shift

log_file="$(mktemp)"
# shellcheck disable=SC2064
trap "rm -f '${log_file}'" EXIT

"$@" >"${log_file}" 2>&1
status=$?

cat "${log_file}"

if [[ ${status} -ne 0 ]]; then
  # GitHub annotation messages are single-line: encode CR/LF and percent signs.
  payload="$(tail -c "${CI_ANNOTATION_BYTES:-8000}" "${log_file}" |
    perl -0pe 's/%/%25/g; s/\r/%0D/g; s/\n/%0A/g')"
  echo "::error title=${label} (exit ${status})::${payload}"
fi

exit "${status}"
