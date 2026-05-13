#!/bin/sh
result=$(curl -fsS -X POST \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  http://app:3000/api/reminders/run 2>&1)
status=$?
timestamp=$(date -Iseconds)
if [ $status -eq 0 ]; then
  echo "[${timestamp}] OK: ${result}"
else
  echo "[${timestamp}] FAILED (exit ${status}): ${result}" >&2
fi
