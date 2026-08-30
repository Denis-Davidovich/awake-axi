---
name: awake-axi
description: Keep a macOS laptop awake during long-running agent work only while it is on AC power or has sufficient battery. Use for tasks likely to run unattended long enough for idle sleep to interrupt them, or when the user asks to prevent sleep; do not use for short interactive work.
---

# awake-axi

Use `awake-axi` to create a battery-aware `caffeinate -i` lease. It prevents
idle system sleep, not display sleep, and cannot keep a Mac awake after the lid
is closed.

At the beginning of long unattended work, run `awake-axi start`. Save the
returned `session_id`. Defaults: 35% minimum battery, 8-hour hard expiry, and a
30-second power check. AC power is always sufficient. On battery, the assertion
is released below the minimum and restored when power becomes sufficient.

Continue the task if the result says `sleep_prevented: false`; the safety
threshold intentionally declined to hold the machine awake. Before the final
response, including after an error or blocker, run `awake-axi stop <session_id>`.
Never stop another session. The expiry is crash protection, not a substitute
for explicit cleanup.

For one long shell command, prefer `awake-axi run -- <command> [args...]`; it
cleans up automatically. Use `awake-axi status <session_id>` to diagnose a
lease. If the host is not macOS or `pmset` / `caffeinate` is unavailable,
report the limitation briefly and continue without the lease.
