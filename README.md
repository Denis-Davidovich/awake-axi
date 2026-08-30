# awake-axi

> Your agent should not lose an hour of work because you walked away from your Mac.

Long Codex and Claude tasks often keep working after the human leaves. macOS
sees an idle laptop and may put it to sleep; the build, browser flow, model run,
or deployment stops with it.

Running `caffeinate` forever solves the interruption by creating a different
problem: an unplugged Mac can stay awake until its battery is empty.

**awake-axi gives each agent task a battery-aware sleep-inhibition lease.** It
keeps the system awake while power is safe, releases its assertion when charge
drops below the configured floor, and cleans up when the task ends.

```text
long agent task starts
        │
        ▼
 AC power or battery ≥ 35%? ── no ──▶ normal macOS sleep policy
        │ yes                              ▲
        ▼                                  │ rechecked every 30s
 PreventUserIdleSystemSleep                │
        │
        ▼
 task ends / stop / TTL expires ───────────┘
```

## Proof, not promise

The repository contains both deterministic integration tests and a captured
test against the real macOS power-management subsystem.

On an arm64 Mac running on battery at 89%, `awake-axi start` reported:

```text
sleep_prevented: true
monitor_pid: 56676
inhibitor_pid: 56678
```

At the same moment, `pmset -g assertions` independently observed the OS-level
assertion owned by that exact process:

```text
pid 56678(caffeinate): ... PreventUserIdleSystemSleep named: "caffeinate command-line tool"
```

After `awake-axi stop`, the probe verified all three cleanup signals:

```text
monitor_after_stop: absent
inhibitor_after_stop: absent
assertion_after_stop: absent
verdict: PASS
```

- [Full real-macOS smoke output](docs/evidence/20260830-macos-live-smoke.txt)
- [Automated check: 6 tests passed](docs/evidence/20260830-automated-check.txt)
- [Installed skill validation](docs/evidence/20260830-skill-install-validation.txt)

Reproduce the live assertion check on a Mac:

```sh
npm ci
npm run build
scripts/live-smoke.sh
```

The smoke fails unless it sees the assertion for its own `caffeinate` PID and
then proves that the PID and assertion disappear after cleanup.

## What it protects

| Failure mode | awake-axi control | Observable check |
|---|---|---|
| macOS sleeps during unattended work | `caffeinate -i` assertion scoped to a lease | `pmset -g assertions` names the lease's inhibitor PID |
| an unplugged task drains the battery | configurable battery floor, checked throughout the lease | integration test moves power 20% → 90% → 10% and observes off → on → off |
| a crashed or forgotten task holds the Mac forever | hard expiry, 8 hours by default | persisted `expires_at`; monitor exits and releases its child |
| one agent stops another agent's protection | unique session IDs and validated monitor PIDs | `stop` accepts one session ID and verifies process ownership before signalling |
| the detached monitor cannot start | fail closed and persist an error state | subprocess test supplies a missing runtime binary and verifies an error instead of a crash |
| keeping the system awake weakens screen privacy | only idle system sleep is inhibited | no `caffeinate -d`; display sleep and screen locking remain available |

## Quick start

Start a lease before a long task and save its session ID:

```sh
awake-axi start
# session_id: 875fcf0d2510
# sleep_prevented: true
```

Inspect or release only that lease:

```sh
awake-axi status 875fcf0d2510
awake-axi stop 875fcf0d2510
```

For one shell command, let the CLI own cleanup automatically:

```sh
awake-axi run -- make test
awake-axi run -- codex exec "finish the migration and run its tests"
```

Tune the safety boundary when needed:

```sh
awake-axi start --min-battery 50 --max-hours 4 --poll-seconds 15
```

## Install the CLI and skill

Until the npm package is published, install from a checkout:

```sh
npm install
npm run build
npm link
awake-axi skill install
```

`skill install` copies the bundled skill to
`~/.agents/skills/awake-axi`. The skill teaches Codex when a task is long enough
to justify a lease, requires it to preserve the returned session ID, and makes
explicit cleanup part of finishing the task.

## Safety boundaries

awake-axi is intentionally smaller than a general power-management app:

- AC power is always sufficient; battery power must be at or above
  `--min-battery` (default 35%).
- Power is checked every 30 seconds by default. The assertion is stopped below
  the floor and restored if power later becomes sufficient.
- Every lease expires after 8 hours by default. Its owner should still call
  `stop` explicitly.
- Unknown power state fails safe and does not inhibit sleep.
- State contains no secrets and lives in `~/Library/Caches/awake-axi`.
- It prevents idle **system** sleep only. It does not keep the display on,
  defeat screen locking, or keep a MacBook awake after the lid is closed.
- It never uses sudo or changes persistent/global `pmset` settings.

## Why not just use something else?

- Use plain `caffeinate -i <command>` when one foreground command is enough and
  battery-aware behavior is unnecessary.
- Use [Keepresso](https://github.com/gyorgysh/keepresso) or Amphetamine when
  you need a menu-bar UI, closed-lid operation, schedules, triggers, or thermal
  controls.
- Use awake-axi when an agent needs a small, machine-readable, unprivileged
  lease that it can own and prove end to end.

The design choice and alternative analysis are documented in the
[spark research and SWOT](docs/20260830-awake-axi-spark-research.md).

## Development

```sh
npm ci
npm run check
```

`npm run check` builds the package, runs pure power-policy tests and subprocess
integration tests, validates the bundled skill, and checks the npm tarball.
