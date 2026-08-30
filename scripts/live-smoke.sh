#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
CLI="$ROOT/dist/bin/awake-axi.js"
SMOKE_STATE=$(mktemp -d "${TMPDIR:-/tmp}/awake-axi-live.XXXXXX")
SESSION_ID=""

cleanup() {
  if [ -n "$SESSION_ID" ]; then
    AWAKE_AXI_STATE_DIR="$SMOKE_STATE" node "$CLI" stop "$SESSION_ID" --json >/dev/null 2>&1 || true
  fi
  rm -rf "$SMOKE_STATE"
}
trap cleanup EXIT INT TERM

json_field() {
  node -e 'const value=JSON.parse(process.argv[1]); console.log(value[process.argv[2]])' "$1" "$2"
}

echo "probe: awake-axi-live-macos"
echo "captured_at: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "host_os: $(uname -s)"
echo "host_arch: $(uname -m)"
echo "node: $(node --version)"
echo "git_head: $(git -C "$ROOT" rev-parse HEAD)"
echo "power_before:"
pmset -g batt

START=$(AWAKE_AXI_STATE_DIR="$SMOKE_STATE" node "$CLI" start --min-battery 35 --poll-seconds 0.25 --max-hours 0.1 --json)
SESSION_ID=$(json_field "$START" session_id)
MONITOR_PID=$(json_field "$START" monitor_pid)

STATUS="$START"
attempt=0
while [ "$(json_field "$STATUS" sleep_prevented)" != "true" ] && [ "$attempt" -lt 20 ]; do
  sleep 0.1
  STATUS=$(AWAKE_AXI_STATE_DIR="$SMOKE_STATE" node "$CLI" status "$SESSION_ID" --json)
  attempt=$((attempt + 1))
done
INHIBITOR_PID=$(json_field "$STATUS" inhibitor_pid)

echo "start: $START"
echo "status_active: $STATUS"
if [ "$(json_field "$STATUS" sleep_prevented)" != "true" ]; then
  echo "verdict: FAIL (sleep assertion did not become active)"
  exit 1
fi

echo "assertion_for_inhibitor_pid:"
ASSERTIONS=$(pmset -g assertions)
echo "$ASSERTIONS" | grep -E "pid ${INHIBITOR_PID}\(caffeinate\).*PreventUserIdleSystemSleep"

STOP=$(AWAKE_AXI_STATE_DIR="$SMOKE_STATE" node "$CLI" stop "$SESSION_ID" --json)
SESSION_ID=""
sleep 0.2
echo "stop: $STOP"

if ps -p "$MONITOR_PID" >/dev/null 2>&1; then
  echo "verdict: FAIL (monitor pid $MONITOR_PID remains)"
  exit 1
fi
if ps -p "$INHIBITOR_PID" >/dev/null 2>&1; then
  echo "verdict: FAIL (caffeinate pid $INHIBITOR_PID remains)"
  exit 1
fi
if pmset -g assertions | grep -qE "pid ${INHIBITOR_PID}\(caffeinate\).*PreventUserIdleSystemSleep"; then
  echo "verdict: FAIL (assertion for pid $INHIBITOR_PID remains)"
  exit 1
fi

echo "monitor_after_stop: absent"
echo "inhibitor_after_stop: absent"
echo "assertion_after_stop: absent"
echo "verdict: PASS"
