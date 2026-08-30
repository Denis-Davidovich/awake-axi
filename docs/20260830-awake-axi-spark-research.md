# Spark research: battery-aware keep-awake for agent tasks

Date: 2026-08-30

Scope: macOS laptop, unattended Claude/Codex work, system may stay awake only
while power is safe. This is a quick product/implementation scan, not a formal
security audit.

## Executive summary

The underlying sleep assertion is already solved well by macOS `caffeinate`.
The useful product gap is lifecycle and safety around that primitive: acquire a
lease for one agent task, release only that lease, stop inhibiting sleep below a
battery floor, expire after a crash, and emit machine-readable proof.

There are two close precedents:

- [Keepresso](https://github.com/gyorgysh/keepresso) is the broadest existing
  solution. It already provides battery-aware auto-pause, thermal protection,
  process triggers, bounded automation leases, a CLI, an MCP server, and a
  bundled agent skill. It is a native menu-bar product and its repository is
  GPL-3.0.
- [cocaffeinate](https://github.com/ericporres/cocaffeinate) targets Claude and
  Codex directly. It adds battery and thermal guards and can keep a Mac awake
  with the lid closed, but that mode mutates `pmset disablesleep`, needs sudo,
  and can remain set after `SIGKILL`.

Recommendation: continue `awake-axi` only as a deliberately narrow,
unprivileged agent CLI/skill: open-lid idle-sleep prevention, no GUI, no global
power-setting mutations, per-session ownership, battery floor, TTL, and
verifiable state. Do not compete with Keepresso on closed-lid operation,
thermal/fan control, schedules, or a menu-bar UI. If those become requirements,
prefer a Keepresso backend/integration instead of reimplementing them.

## Approaches found

| Approach | What it already solves | Gap for this task |
|---|---|---|
| macOS `caffeinate -i` / `-w PID` | Built in; process-scoped; no admin; assertion disappears with the process. Local `man caffeinate` confirms `-i` prevents idle system sleep and `-w` waits for a PID. | No battery floor, session ownership, state, or agent workflow. |
| Community [`anti-sleep` skill](https://github.com/sickn33/agentic-awesome-skills/blob/main/skills/anti-sleep/SKILL.md) | Teaches agents timers, process binding and `pmset -g assertions` verification. | Defaults to keeping the display on (`-d -i`), has no battery monitoring, and suggests broad `pkill -f`, which can stop another task's assertion. |
| [`caffeinate-claude`](https://github.com/bmoeskau/caffeinate-claude) | Claude hooks start/stop `caffeinate`; validates PIDs before killing; reference-counts concurrent sessions. | Claude-specific hooks, fixed timeout, no battery or power-source safety, no Codex skill. |
| [`KeepingYouAwake`](https://github.com/newmarcel/KeepingYouAwake) | Mature open-source menu-bar wrapper around Apple's `caffeinate`; timed sessions. | Human/UI-oriented, not task-lease oriented, and no battery threshold. Its own documentation says it does not defeat closed-lid sleep. |
| [Amphetamine](https://apps.apple.com/us/app/amphetamine/id937984704) | Mature UI, triggers, app-based sessions, low-battery auto-end and optional closed-display behavior. | App-store GUI/configuration is heavier than a deterministic agent tool; not a portable skill contract. |
| [`wakepy`](https://github.com/wakepy/wakepy) | Cross-platform library and CLI; non-disruptive OS APIs; crash-safe process lifetime; separates system-running and presentation modes. | Python runtime/package; no battery-aware policy or per-agent lease registry. Cross-platform scope is unnecessary for the first version. |
| [`cocaffeinate`](https://github.com/ericporres/cocaffeinate) | Agent/process gating, battery floor, thermal failsafe, command wrapper, macOS and Windows. | Closed-lid path requires privileged persistent settings; agent discovery is process-name based; no Codex skill package or independent lease ownership. |
| [`Keepresso`](https://github.com/gyorgysh/keepresso) | Superset: battery pause, thermal guard, activity explanation, leases with TTL/heartbeat/release, CLI, MCP and agent skill. | Requires a native app for the full feature set; much larger operational surface; GPL-3.0 prevents copying implementation into a permissively licensed tool. |

## SWOT for `awake-axi`

### Strengths

- Narrow safety contract: unknown power state means no assertion; AC or battery
  above the configured floor enables it.
- No sudo and no persistent `pmset` mutations. A crash cannot leave a global
  `disablesleep` setting behind.
- Per-session IDs avoid broad process killing and make concurrent agents safe.
- Agent-first interface: compact status, scoped `run -- command`, hard TTL, and
  a directly installable Codex and Claude skill.
- Keeps display sleep and screen locking intact by using only `caffeinate -i`.

### Weaknesses

- macOS-only first version.
- Does not work with a physically closed MacBook lid; this is intentional but
  must be explicit in the skill and CLI help.
- Polling `pmset -g batt` has up to one poll interval of reaction delay.
- A detached monitor adds state/PID lifecycle complexity compared with wrapping
  one command directly.
- No thermal signal in v1; battery sufficiency alone does not guarantee safe
  operation under a heavy load or inside a bag.

### Opportunities

- Add heartbeat-based leases so a live agent can extend a short TTL while an
  abandoned session expires quickly, following Keepresso's proven contract.
- Offer optional Claude/Codex lifecycle hooks while retaining the CLI as the
  backend, borrowing the safe PID-validation idea from `caffeinate-claude`.
- Add a read-only `doctor` command that combines own state with
  `pmset -g assertions` for third-party proof and diagnosis.
- Add Linux/Windows backends later through native inhibitors or delegate to
  wakepy, without changing the lease protocol.
- Detect Keepresso and use its lease API as an optional backend when users need
  closed-lid or thermal features.

### Threats

- Keepresso already covers almost every advanced roadmap item and ships an
  agent skill/MCP server; expanding scope would duplicate a stronger product.
- Apple can change `pmset` output formatting or assertion behavior across macOS
  versions, so parsing and live smoke tests are required.
- Multiple independent keep-awake apps can make the machine remain awake even
  after `awake-axi` stops; proof must identify the assertion owner, not merely
  observe a global non-zero assertion count.
- Users may assume “keep awake” includes closed-lid operation, display wake, or
  bypassing screen lock. Those expectations would create safety and security
  regressions if implemented implicitly.

## Decisions for v1

1. Keep `caffeinate -i`; never add `-d` by default.
2. Treat AC as sufficient; require battery percentage `>= 35` by default.
3. Release the assertion on unknown/unreadable power state.
4. Give every start a unique session ID and stop only a validated monitor PID.
5. Support both background `start/status/stop` and automatically scoped
   `run -- command`.
6. Enforce an 8-hour default expiry and explicit owner cleanup.
7. Prove behavior twice: deterministic fake-power integration tests and a real
   macOS smoke using `pmset -g assertions`.
8. Keep closed-lid, sudo, global power-setting mutation and thermal control out
   of v1. Re-evaluate integration with Keepresso if those are requested.

## Sources

- Apple primitives inspected locally on the target Mac: `man caffeinate`,
  `man pmset`, `pmset -g batt`, and `pmset -g assertions`.
- [Community anti-sleep agent skill](https://github.com/sickn33/agentic-awesome-skills/blob/main/skills/anti-sleep/SKILL.md)
- [caffeinate-claude](https://github.com/bmoeskau/caffeinate-claude)
- [KeepingYouAwake](https://github.com/newmarcel/KeepingYouAwake)
- [Amphetamine App Store listing](https://apps.apple.com/us/app/amphetamine/id937984704)
- [wakepy](https://github.com/wakepy/wakepy)
- [cocaffeinate](https://github.com/ericporres/cocaffeinate)
- [Keepresso](https://github.com/gyorgysh/keepresso)
