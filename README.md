# awake-axi

Battery-aware macOS sleep inhibition for long-running agent tasks.

`awake-axi` holds a `PreventUserIdleSystemSleep` assertion while the Mac is on
AC power or its battery is at least 35% by default. It releases the assertion
when charge drops below the threshold and always bounds a background lease with
an expiry.

## Usage

```sh
awake-axi start
awake-axi status <session-id>
awake-axi stop <session-id>

awake-axi run -- make test
awake-axi start --min-battery 50 --max-hours 4
```

Install the bundled Codex skill:

```sh
awake-axi skill install
```

Until the npm package is published, install the CLI from a checkout:

```sh
npm install
npm run build
npm link
awake-axi skill install
```

## Safety model

- AC power is considered sufficient.
- Battery power must be at or above `--min-battery` (default 35%).
- Power is checked every 30 seconds by default; `caffeinate` is stopped below
  the threshold and restarted after recovery.
- Every lease expires after 8 hours by default and should still be stopped
  explicitly by its owner.
- Only idle system sleep (`caffeinate -i`) is inhibited. Display sleep and
  closed-lid sleep are unchanged.
- Unknown power state fails safe and does not inhibit sleep.

State contains no secrets and lives in `~/Library/Caches/awake-axi`.

## Development

```sh
npm ci
npm run check
```

The integration test uses fake `pmset` and `caffeinate` executables to verify
threshold transitions and process cleanup. A release should additionally run a
real-macOS smoke check against `pmset -g assertions`.
