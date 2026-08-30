# Codex and Claude agent-adoption smoke

Captured on 2026-08-30 on Darwin arm64 from an isolated temporary directory.
The repository working tree was not supplied as prompt context and was not
modified. The same user prompt was sent to both agents and deliberately did
not contain the string `awake-axi`:

> You are preparing for a long unattended task on macOS that idle sleep could
> interrupt. Find and use an appropriate installed skill when power is safe.
> Start a test lease, preserve its session ID, verify it with status and
> `pmset -g assertions`, then stop only that session and verify cleanup.

## Codex CLI 0.151.0

Invocation used `codex exec --ephemeral --skip-git-repo-check --json`.

Observable transcript facts:

```text
agent: Использую установленный навык `awake-axi`
command: sed ... /Users/den.dav.global/.agents/skills/awake-axi/SKILL.md
command: awake-axi start
session_id: c6f4bcb064de
battery_percent: 78
sleep_prevented: true
monitor_pid: 85005
inhibitor_pid: 85007
pmset: pid 85007(caffeinate): ... PreventUserIdleSystemSleep
command: awake-axi stop c6f4bcb064de
status_after_stop: stopped
assertion_for_pid_85007_after_stop: absent
agent_cleanup_verdict: its assertion disappeared; other sessions untouched
```

This proves automatic selection, full `SKILL.md` loading, lease ownership,
independent OS assertion verification, and scoped cleanup by Codex.

## Claude Code 2.1.250 (Claude Sonnet 5)

Invocation used `claude -p --output-format stream-json`; the `Skill` and
restricted `Bash` tools were allowed.

Observable transcript facts:

```text
tool_use: Skill {"skill":"awake-axi"}
tool_result: Launching skill: awake-axi
skill_base: /Users/den.dav.global/.claude/skills/awake-axi
command: awake-axi start
session_id: b28b2c2fd3e5
battery_percent: 77
status_sleep_prevented: true
monitor_pid: 86114
inhibitor_pid: 86118
pmset: pid 86118(caffeinate): ... PreventUserIdleSystemSleep
command: awake-axi stop b28b2c2fd3e5
status_after_stop: stopped
agent_cleanup_verdict: its session stopped; unrelated pid 81305 untouched
```

This proves Claude's implicit skill resolution through its native `Skill`
tool, loading from the personal skill directory, execution of the workflow,
OS-level verification, and scoped cleanup.

## Verdict

PASS for both agents. Each independently selected the skill without its name
appearing in the task prompt, created a distinct lease, observed the exact
lease-owned `PreventUserIdleSystemSleep` assertion, and cleaned up only its own
session before returning.

The agent tests complement rather than replace `scripts/live-smoke.sh`: the
agent runs prove discovery and correct use, while the deterministic smoke proves
the CLI's process and assertion lifecycle without relying on model behavior.
